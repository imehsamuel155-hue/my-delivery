const express = require("express");
const Shipment = require("../models/Shipment");
const Notification = require("../models/Notification");
const requireAdmin = require("../middleware/auth");
const AdminSettings = require("../models/AdminSettings");

async function pushNotify({ code, title, message, type, location }) {
    try {
        await Notification.create({
            code: String(code).toUpperCase(),
            title,
            message,
            type: type || "status",
            location: location || "",
        });
    } catch (e) {
        console.error("notify failed", e.message);
    }
}

const router = express.Router();

/* ---------- PUBLIC: tracking lookup (what ship.html/the track page calls) ---------- */
// GET /api/shipments/track/:code

// Box video service ON/OFF (also under /api/shipments for reliability)
router.get("/box-service", async (req, res) => {
    try {
        const settings = await AdminSettings.findOne();
        const on = settings ? (settings.boxServiceOn !== false) : true;
        res.json({ on });
    } catch (err) {
        res.json({ on: true });
    }
});
router.put("/box-service", requireAdmin, async (req, res) => {
    try {
        let settings = await AdminSettings.findOne();
        if (!settings) return res.status(500).json({ error: "Admin not set up." });
        if (typeof req.body.on === "boolean") {
            settings.boxServiceOn = req.body.on;
            await settings.save();
        }
        res.json({ on: settings.boxServiceOn !== false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/track/:code", async (req, res) => {
    try {
        const shipment = await Shipment.findOne({
            code: req.params.code.trim().toUpperCase(),
        });
        if (!shipment) {
            return res.status(404).json({ error: "No shipment found for that code." });
        }
        res.json(shipment);
    } catch (err) {
        res.status(500).json({ error: "Something went wrong looking up that shipment." });
    }
});


// GET /api/shipments/track/:code/notifications — public live feed for a tracking code
router.get("/track/:code/notifications", async (req, res) => {
    try {
        const code = req.params.code.trim().toUpperCase();
        const since = req.query.since ? new Date(req.query.since) : null;
        const q = { code };
        if (since && !isNaN(since.getTime())) q.createdAt = { $gt: since };
        const items = await Notification.find(q).sort({ createdAt: -1 }).limit(50);
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: "Could not load notifications." });
    }
});

// GET /api/shipments/notifications/admin — all recent (admin)
router.get("/notifications/admin", requireAdmin, async (req, res) => {
    try {
        const items = await Notification.find().sort({ createdAt: -1 }).limit(80);
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/shipments/notifications/read — mark one or all read (admin)
router.post("/notifications/read", requireAdmin, async (req, res) => {
    try {
        const { id, all } = req.body || {};
        if (all) {
            await Notification.updateMany({ read: false }, { $set: { read: true } });
        } else if (id) {
            await Notification.findByIdAndUpdate(id, { read: true });
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ---------- ADMIN ONLY: everything below requires a valid login token ---------- */

// GET /api/shipments - list all shipments for the admin dashboard.
// PIN-protected shipments only send minimal identifying info here (code,
// names, latest status) - full details (address, payment, route, history)
// are withheld until the correct 4-digit code is submitted via /unlock.
router.get("/", requireAdmin, async (req, res) => {
    const shipments = await Shipment.find().sort({ createdAt: -1 });
    // Admin board gets FULL data — access PIN stays on shipment but is not required again to edit
    const summarized = shipments.map(s => {
        const obj = s.toObject();
        const pinProtected = !!obj.accessPin;
        delete obj.accessPin;
        return { ...obj, pinProtected };
    });
    res.json(summarized);
});

// POST /api/shipments/:code/unlock - checks a shipment's 4-digit access PIN.
// If it matches (or the shipment has no PIN set), returns the full shipment
// so the admin dashboard can open it for editing. Otherwise, refuses.
router.post("/:code/unlock", requireAdmin, async (req, res) => {
    const shipment = await Shipment.findOne({ code: req.params.code.trim().toUpperCase() });
    if (!shipment) return res.status(404).json({ error: "Shipment not found." });

    if (shipment.accessPin && shipment.accessPin !== String(req.body.pin || "")) {
        return res.status(403).json({ error: "Incorrect code for this shipment." });
    }
    const obj = shipment.toObject();
    delete obj.accessPin;
    res.json(obj);
});

// POST /api/shipments - create a new shipment
router.post("/", requireAdmin, async (req, res) => {
    try {
        const code = (req.body.code || "").trim().toUpperCase();
        if (!code) return res.status(400).json({ error: "Tracking code is required." });

        const existing = await Shipment.findOne({ code });
        if (existing) return res.status(409).json({ error: "A shipment with that code already exists." });

        const shipment = await Shipment.create({
            ...req.body,
            code,
            history: req.body.history?.length
                ? req.body.history
                : [{ label: "Order Received", date: new Date().toISOString().slice(0, 10), location: req.body.sender?.address || "Origin" }],
        });
        await pushNotify({
            code: shipment.code,
            title: "Shipment created",
            message: `Tracking ${shipment.code} is live. Receiver: ${shipment.receiver?.name || "—"}.`,
            type: "created",
            location: shipment.sender?.address || "",
        });
        res.status(201).json(shipment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT /api/shipments/:code - update sender/receiver/package/payment/mode
router.put("/:code", requireAdmin, async (req, res) => {
    try {
        const body = { ...(req.body || {}) };
        delete body.code;
        delete body._id;
        delete body.__v;
        // Access PIN is permanent once set — never overwrite from edit form
        const existing = await Shipment.findOne({ code: req.params.code.trim().toUpperCase() });
        if (existing && existing.accessPin) {
            delete body.accessPin;
        }
        // Allow clearing string fields (e.g. terms DDP → DBP)
        const shipment = await Shipment.findOneAndUpdate(
            { code: req.params.code.trim().toUpperCase() },
            { $set: body },
            { new: true, runValidators: true }
        );
        if (!shipment) return res.status(404).json({ error: "Shipment not found." });
        res.json(shipment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE /api/shipments/:code
router.delete("/:code", requireAdmin, async (req, res) => {
    const result = await Shipment.findOneAndDelete({ code: req.params.code.trim().toUpperCase() });
    if (!result) return res.status(404).json({ error: "Shipment not found." });
    res.json({ deleted: true });
});

// POST /api/shipments/:code/status - add a new status timeline step
router.post("/:code/status", requireAdmin, async (req, res) => {
    const { label, location, date } = req.body;
    if (!label) return res.status(400).json({ error: "Status label is required." });

    const shipment = await Shipment.findOne({ code: req.params.code.trim().toUpperCase() });
    if (!shipment) return res.status(404).json({ error: "Shipment not found." });

    shipment.history.push({
        label,
        location: location || "—",
        date: date || new Date().toISOString().slice(0, 10),
    });
    await shipment.save();
    const low = String(label).toLowerCase();
    let type = "status";
    if (low.includes("deliver")) type = "delivered";
    else if (low.includes("hold")) type = "hold";
    await pushNotify({
        code: shipment.code,
        title: label,
        message: `${label} — ${location || "—"}${date ? " · " + date : ""}`,
        type,
        location: location || "",
    });
    res.json(shipment);
});


// POST /api/shipments/:code/status/remove - same as DELETE (mobile/proxy friendly)
router.post("/:code/status/remove", requireAdmin, async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ code: req.params.code.trim().toUpperCase() });
        if (!shipment) return res.status(404).json({ error: "Shipment not found." });
        const idx = parseInt((req.body && req.body.index), 10);
        if (Number.isNaN(idx) || idx < 0 || idx >= shipment.history.length) {
            return res.status(400).json({ error: "Invalid status index." });
        }
        shipment.history.splice(idx, 1);
        await shipment.save();
        res.json(shipment);
    } catch (e) {
        res.status(500).json({ error: e.message || "Remove failed." });
    }
});

// DELETE /api/shipments/:code/status/:index - remove a status timeline step
router.delete("/:code/status/:index", requireAdmin, async (req, res) => {
    const shipment = await Shipment.findOne({ code: req.params.code.trim().toUpperCase() });
    if (!shipment) return res.status(404).json({ error: "Shipment not found." });

    const idx = parseInt(req.params.index, 10);
    if (Number.isNaN(idx) || idx < 0 || idx >= shipment.history.length) {
        return res.status(400).json({ error: "Invalid status index." });
    }
    shipment.history.splice(idx, 1);
    await shipment.save();
    res.json(shipment);
});

// PATCH /api/shipments/:code/route - update live-map route (coords, icon, speed, movement state)
// Merges the fields you send with what's already saved, so e.g. saving new
// coordinates never accidentally wipes out whether the shipment is currently moving.
router.patch("/:code/route", requireAdmin, async (req, res) => {
    const shipment = await Shipment.findOne({ code: req.params.code.trim().toUpperCase() });
    if (!shipment) return res.status(404).json({ error: "Shipment not found." });
    const prev = shipment.route ? (shipment.route.toObject ? shipment.route.toObject() : { ...shipment.route }) : {};
    shipment.route = { ...prev, ...req.body };
    // Allow clearing rotation (null = auto face destination)
    if (Object.prototype.hasOwnProperty.call(req.body, 'rotationDeg')) {
        shipment.route.rotationDeg = req.body.rotationDeg;
    }
    await shipment.save();
    if (req.body.isMoving === true && !prev.isMoving) {
        const o = shipment.route.originCountry || "Origin";
        const d = shipment.route.destCountry || "Destination";
        const ic = shipment.route.icon || "truck";
        const iconLabel = ic === "plane" ? "Plane" : ic === "ship" ? "Ship" : "Truck";
        await pushNotify({
            code: shipment.code,
            title: `${iconLabel} in motion: ${o} → ${d}`,
            message: `${shipment.code} is moving from ${o} to ${d} (${shipment.route.speed || "normal"} speed).`,
            type: "route",
            location: `${o} → ${d}`,
        });
    }
    if (req.body.isMoving === false && prev.isMoving) {
        const o = shipment.route.originCountry || "Origin";
        const d = shipment.route.destCountry || "Destination";
        await pushNotify({
            code: shipment.code,
            title: "Movement paused",
            message: `${shipment.code} ${o} → ${d} frozen at ${Math.round(shipment.route.progress || 0)}%.`,
            type: "route",
            location: `${o} → ${d}`,
        });
    }
    res.json(shipment);
});

module.exports = router;
