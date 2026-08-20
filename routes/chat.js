const express = require("express");
const ChatThread = require("../models/ChatThread");
const Shipment = require("../models/Shipment");
const authMw = require("../middleware/auth");
const requireAdmin = authMw.requireAdmin || authMw;
const requireAdminOrChatPin = authMw.requireAdminOrChatPin || requireAdmin;

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

        // Auto welcome if no messages yet
        if (!thread.messages || thread.messages.length === 0) {
            const recv = receiverName || "customer";
            const now = new Date();
            const timeStr = now.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit" });
            thread.messages = [
                {
                    from: "admin",
                    text: "How can we help you today with your shipment? (" + timeStr + ")",
                    image: "",
                    createdAt: now,
                    auto: true,
                },
            ];
            thread.unreadGuest = 1;
            thread.lastMessageAt = now;
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

        // Auto-response until a human admin has replied at least once (non-auto)
        const humanAdmin = (thread.messages || []).some(function (m) {
            return m.from === "admin" && !m.auto;
        });
        if (!humanAdmin) {
            const recv = (thread.receiverName || thread.guestDisplayName || "customer").split("/")[0].trim() || "customer";
            const guestCount = (thread.messages || []).filter(function (m) { return m.from === "guest"; }).length;
            let autoText;
            if (guestCount <= 1) {
                autoText = "How can we help you today with your shipment?";
            } else {
                autoText = "You have been added to the queue, " + recv + ". Our support team will attend to you shortly.";
            }
            // Don't spam identical auto if last was already auto
            const last = thread.messages[thread.messages.length - 1];
            const prev = thread.messages[thread.messages.length - 2];
            const lastAuto = prev && prev.from === "admin" && prev.auto;
            if (!lastAuto || guestCount === 1) {
                thread.messages.push({
                    from: "admin",
                    text: autoText,
                    image: "",
                    createdAt: new Date(),
                    auto: true,
                });
                thread.unreadGuest = (thread.unreadGuest || 0) + 1;
            }
        }

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
router.get("/admin/threads", requireAdminOrChatPin, async (req, res) => {
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
        // One conversation per tracking code (keep latest)
        const byCode = new Map();
        const noCode = [];
        for (const t of list) {
            const key = (t.trackCode || "").trim();
            if (!key) { noCode.push(t); continue; }
            const prev = byCode.get(key);
            if (!prev || new Date(t.lastMessageAt || 0) > new Date(prev.lastMessageAt || 0)) {
                byCode.set(key, t);
            }
        }
        const merged = Array.from(byCode.values()).concat(noCode);
        merged.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
        res.json({ threads: merged });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Admin: get one thread messages */
router.get("/admin/threads/:id", requireAdminOrChatPin, async (req, res) => {
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
router.post("/admin/threads/:id/reply", requireAdminOrChatPin, async (req, res) => {
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
router.get("/admin/unread-count", requireAdminOrChatPin, async (req, res) => {
    try {
        const threads = await ChatThread.find({ unreadAdmin: { $gt: 0 } }).select("unreadAdmin");
        const total = threads.reduce((s, t) => s + (t.unreadAdmin || 0), 0);
        res.json({ total, conversations: threads.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;


const AdminSettings = require("../models/AdminSettings");

/** Verify standalone chat page PIN (default 4422) */
router.post("/chat-pin", async (req, res) => {
    try {
        const pin = String((req.body && req.body.pin) || "").trim();
        const s = await AdminSettings.findOne();
        const expected = (s && s.chatPin) ? String(s.chatPin).trim() : "4422";
        if (pin !== expected) return res.status(401).json({ error: "Incorrect chat PIN." });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Admin: change chat PIN (requires admin auth) */
router.put("/chat-pin", requireAdmin, async (req, res) => {
    try {
        const pin = String((req.body && req.body.pin) || "").trim();
        if (!/^[0-9]{4,8}$/.test(pin)) return res.status(400).json({ error: "PIN must be 4–8 digits." });
        let s = await AdminSettings.findOne();
        if (!s) return res.status(500).json({ error: "Settings missing." });
        s.chatPin = pin;
        await s.save();
        res.json({ ok: true, chatPin: pin });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Admin: permanently clear one thread or all */
router.delete("/admin/threads/:id", requireAdminOrChatPin, async (req, res) => {
    try {
        await ChatThread.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete("/admin/threads", requireAdminOrChatPin, async (req, res) => {
    try {
        await ChatThread.deleteMany({});
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Unlock a thread with shipment accessPin (4-digit) */

/** Admin: clear messages in one thread (keep thread) */
router.post("/admin/threads/:id/clear", requireAdminOrChatPin, async (req, res) => {
    try {
        const thread = await ChatThread.findById(req.params.id);
        if (!thread) return res.status(404).json({ error: "Thread not found." });
        thread.messages = [];
        thread.unreadAdmin = 0;
        thread.unreadGuest = 0;
        thread.lastMessageAt = new Date();
        await thread.save();
        res.json({ ok: true, messages: [] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/admin/unlock-thread", requireAdminOrChatPin, async (req, res) => {
    try {
        const { threadId, password, pin } = req.body || {};
        const thread = await ChatThread.findById(threadId);
        if (!thread) return res.status(404).json({ error: "Thread not found." });
        const pass = String(password || pin || "").trim();
        let ok = false;
        let needsPin = false;
        if (thread.trackCode) {
            const ship = await Shipment.findOne({ code: thread.trackCode });
            if (ship && ship.accessPin) {
                needsPin = true;
                if (pass && pass === String(ship.accessPin)) ok = true;
            } else {
                ok = true; // no shipment PIN set
            }
        } else {
            ok = true;
        }
        if (!ok) {
            return res.status(401).json({
                error: needsPin ? "Enter this shipment's 4-digit access PIN to open the chat." : "Wrong PIN.",
                needsPin: true
            });
        }
        if (thread.unreadAdmin > 0) {
            thread.unreadAdmin = 0;
            await thread.save();
        }
        res.json({
            ok: true,
            id: thread._id,
            label: thread.label,
            trackCode: thread.trackCode,
            messages: thread.messages || []
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
