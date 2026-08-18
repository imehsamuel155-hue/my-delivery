const express = require("express");
const ChatThread = require("../models/ChatThread");
const Shipment = require("../models/Shipment");
const requireAdmin = require("../middleware/auth");

const router = express.Router();

function makeLabel(sender, receiver, fallback) {
    const s = (sender || "").trim();
    const r = (receiver || "").trim();
    if (s && r) return s + " / " + r;
    if (s) return s;
    if (r) return r;
    return fallback || "Guest";
}

/** Guest: open or create thread — tracking code REQUIRED (must match a shipment). */
router.post("/guest/open", async (req, res) => {
    try {
        const { guestId, trackCode } = req.body || {};
        if (!guestId) return res.status(400).json({ error: "guestId required." });

        const code = String(trackCode || "").trim().toUpperCase();
        if (!code) {
            return res.status(400).json({ error: "Please enter a valid tracking code." });
        }

        const ship = await Shipment.findOne({ code });
        if (!ship) {
            return res.status(404).json({ error: "Tracking code not found. Enter a correct tracking code." });
        }

        const senderName = (ship.sender && ship.sender.name) || "";
        const receiverName = (ship.receiver && ship.receiver.name) || "";
        const label = makeLabel(senderName, receiverName, code);

        let thread = await ChatThread.findOne({ guestId, trackCode: code });
        if (!thread) thread = await ChatThread.findOne({ guestId });

        if (!thread) {
            thread = await ChatThread.create({
                guestId,
                label,
                senderName,
                receiverName,
                trackCode: code,
                guestDisplayName: label,
                messages: [],
                unreadAdmin: 0,
                unreadGuest: 0,
            });
        } else {
            thread.trackCode = code;
            thread.senderName = senderName;
            thread.receiverName = receiverName;
            thread.label = label;
            thread.guestDisplayName = label;
            await thread.save();
        }

        res.json({
            threadId: thread._id,
            label: thread.label,
            messages: thread.messages,
            unreadGuest: thread.unreadGuest,
        });
    } catch (e) {
        res.status(500).json({ error: e.message || "Open chat failed." });
    }
});

/** Guest: send message (only to their own thread) */
router.post("/guest/send", async (req, res) => {
    try {
        const { guestId, text, image } = req.body || {};
        if (!guestId) return res.status(400).json({ error: "guestId required." });
        const msgText = String(text || "").trim();
        if (!msgText && !image) return res.status(400).json({ error: "Empty message." });

        const thread = await ChatThread.findOne({ guestId });
        if (!thread) return res.status(404).json({ error: "Open chat first." });

        thread.messages.push({
            from: "guest",
            text: msgText,
            image: image || "",
            createdAt: new Date(),
        });
        thread.unreadAdmin = (thread.unreadAdmin || 0) + 1;
        thread.lastMessageAt = new Date();
        await thread.save();

        res.json({ ok: true, messages: thread.messages, unreadGuest: thread.unreadGuest });
    } catch (e) {
        res.status(500).json({ error: e.message || "Send failed." });
    }
});

/** Guest: poll own messages + mark admin replies as read */
router.get("/guest/:guestId", async (req, res) => {
    try {
        const thread = await ChatThread.findOne({ guestId: req.params.guestId });
        if (!thread) return res.json({ messages: [], unreadGuest: 0, label: "" });
        if (thread.unreadGuest > 0) {
            thread.unreadGuest = 0;
            await thread.save();
        }
        res.json({
            threadId: thread._id,
            label: thread.label,
            messages: thread.messages,
            unreadGuest: 0,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Admin: list all threads (separate A, B, C…) */
router.get("/admin/threads", requireAdmin, async (req, res) => {
    try {
        const threads = await ChatThread.find()
            .sort({ lastMessageAt: -1 })
            .select("label senderName receiverName guestDisplayName trackCode unreadAdmin lastMessageAt messages")
            .limit(200)
            .lean();

        const list = threads.map((t) => {
            const last = (t.messages && t.messages[t.messages.length - 1]) || null;
            return {
                id: t._id,
                label: t.label,
                senderName: t.senderName,
                receiverName: t.receiverName,
                guestDisplayName: t.guestDisplayName,
                trackCode: t.trackCode,
                unreadAdmin: t.unreadAdmin || 0,
                lastMessageAt: t.lastMessageAt,
                preview: last ? (last.text || (last.image ? "[Photo]" : "")) : "",
            };
        });
        res.json({ threads: list });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Admin: get one thread messages */
router.get("/admin/threads/:id", requireAdmin, async (req, res) => {
    try {
        const thread = await ChatThread.findById(req.params.id);
        if (!thread) return res.status(404).json({ error: "Thread not found." });
        if (thread.unreadAdmin > 0) {
            thread.unreadAdmin = 0;
            await thread.save();
        }
        res.json({
            id: thread._id,
            label: thread.label,
            senderName: thread.senderName,
            receiverName: thread.receiverName,
            trackCode: thread.trackCode,
            messages: thread.messages,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Admin: reply to selected thread only */
router.post("/admin/threads/:id/reply", requireAdmin, async (req, res) => {
    try {
        const { text, image } = req.body || {};
        const msgText = String(text || "").trim();
        if (!msgText && !image) return res.status(400).json({ error: "Empty message." });

        const thread = await ChatThread.findById(req.params.id);
        if (!thread) return res.status(404).json({ error: "Thread not found." });

        thread.messages.push({
            from: "admin",
            text: msgText,
            image: image || "",
            createdAt: new Date(),
        });
        thread.unreadGuest = (thread.unreadGuest || 0) + 1;
        thread.lastMessageAt = new Date();
        await thread.save();

        res.json({ ok: true, messages: thread.messages });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Admin: total unread for badge */
router.get("/admin/unread-count", requireAdmin, async (req, res) => {
    try {
        const threads = await ChatThread.find({ unreadAdmin: { $gt: 0 } }).select("unreadAdmin");
        const total = threads.reduce((s, t) => s + (t.unreadAdmin || 0), 0);
        res.json({ total, conversations: threads.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
