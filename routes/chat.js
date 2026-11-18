const express = require("express");
const ChatThread = require("../models/ChatThread");
const Shipment = require("../models/Shipment");
const AdminSettings = require("../models/AdminSettings");
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

/** Guest: open or create thread — ONE shared thread per tracking code (any device). */
router.post("/guest/open", async (req, res) => {
    try {
        const { guestId, trackCode } = req.body || {};
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

        // Privacy: only this tracking code's thread — never reuse another code's chat
        let thread = await ChatThread.findOne({ trackCode: code }).sort({ lastMessageAt: -1 });

        if (!thread) {
            thread = await ChatThread.create({
                guestId: guestId || ("track-" + code),
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
            // Update labels only — never change trackCode or wipe messages
            thread.senderName = senderName;
            thread.receiverName = receiverName;
            thread.label = label;
            thread.guestDisplayName = label;
            if (guestId) thread.guestId = String(guestId);
            await thread.save();
        }

        // Auto welcome if no messages yet
        if (!thread.messages || thread.messages.length === 0) {
            const now = new Date();
            const timeStr = now.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit" });
            thread.messages = [
                {
                    from: "admin",
                    text: "How can we help you today with your shipment? (" + timeStr + ")",
                    image: "",
                    createdAt: now,
                    auto: true,
                    seenByGuest: true,
                },
            ];
            thread.unreadGuest = 0;
            thread.lastMessageAt = now;
            await thread.save();
        } else {
            // Customer opened chat → mark support messages as Seen
            let changed = false;
            (thread.messages || []).forEach(function (m) {
                if (m.from === "admin" && !m.seenByGuest) {
                    m.seenByGuest = true;
                    changed = true;
                }
            });
            if (thread.unreadGuest > 0) {
                thread.unreadGuest = 0;
                changed = true;
            }
            if (changed) await thread.save();
        }

        res.json({
            threadId: thread._id,
            label: thread.label,
            trackCode: thread.trackCode,
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
        const { guestId, trackCode, text, image, fileName, fileType } = req.body || {};
        const code = String(trackCode || "").trim().toUpperCase();
        if (!code) return res.status(400).json({ error: "Tracking code required." });
        const msgText = String(text || "").trim();
        let img = image || "";
        let ft0 = String(fileType || "").toLowerCase();
        if (!ft0 && img) {
            if (String(img).startsWith("data:video")) ft0 = "video";
            else if (String(img).startsWith("data:image")) ft0 = "image";
        }
        // base64 length limits (MongoDB doc max 16MB; keep room for other messages)
        const maxLen = ft0 === "video" ? 5500000 : 1200000;
        if (img && img.length > maxLen) {
            return res.status(400).json({
                error: ft0 === "video"
                    ? "Video too large. Send a shorter clip (about 10–15 seconds or under ~4 MB)."
                    : "Photo too large. Send a smaller photo.",
            });
        }
        if (!msgText && !img) return res.status(400).json({ error: "Empty message." });

        let ft = String(fileType || "").toLowerCase();
        if (!ft && img) {
            if (String(img).startsWith("data:video")) ft = "video";
            else if (String(img).indexOf("application/pdf") !== -1) ft = "pdf";
            else if (String(img).startsWith("data:image")) ft = "image";
            else ft = "file";
        }

        const msg = {
            from: "guest",
            text: msgText,
            image: img,
            fileName: fileName || "",
            fileType: ft || "",
            createdAt: new Date(),
        };

        // Fast path: $push without rewriting entire document history in app memory
        let thread = await ChatThread.findOneAndUpdate(
            { trackCode: code },
            {
                $push: { messages: msg },
                $inc: { unreadAdmin: 1 },
                $set: { lastMessageAt: new Date() },
            },
            { new: true, sort: { lastMessageAt: -1 } }
        );
        if (!thread) return res.status(404).json({ error: "Open chat first with this tracking code." });

        // Auto-reply once after first guest message
        const guestCount = (thread.messages || []).filter(function (m) { return m.from === "guest"; }).length;
        const alreadyAuto = (thread.messages || []).some(function (m) {
            return m.from === "admin" && m.auto === true;
        });
        if (guestCount === 1 && !alreadyAuto) {
            const recv = (thread.receiverName || thread.guestDisplayName || "customer").split("/")[0].trim() || "customer";
            const autoMsg = {
                from: "admin",
                text: "You have been added to the queue, " + recv + ". Please wait — our support team will get back to you shortly.",
                image: "",
                auto: true,
                createdAt: new Date(),
            };
            thread = await ChatThread.findByIdAndUpdate(
                thread._id,
                { $push: { messages: autoMsg }, $inc: { unreadGuest: 1 }, $set: { lastMessageAt: new Date() } },
                { new: true }
            );
        }

        res.json({ ok: true, messages: thread.messages, unreadGuest: thread.unreadGuest });
    } catch (e) {
        console.error("guest/send", e);
        res.status(500).json({ error: e.message || "Send failed." });
    }
});

/** Guest: poll by tracking code (shared across devices) — marks admin msgs as Seen */
router.get("/guest/by-track/:code", async (req, res) => {
    try {
        const code = String(req.params.code || "").trim().toUpperCase();
        const thread = await ChatThread.findOne({ trackCode: code }).sort({ lastMessageAt: -1 }).lean();
        if (!thread) return res.json({ messages: [], unreadGuest: 0, label: "", trackCode: code });

        // Mark seen without full document rewrite (avoids re-saving huge base64 images every poll)
        const needsSeen = (thread.messages || []).some(function (m) {
            return m.from === "admin" && !m.seenByGuest;
        });
        if ((thread.unreadGuest || 0) > 0 || needsSeen) {
            await ChatThread.updateOne(
                { _id: thread._id },
                {
                    $set: {
                        unreadGuest: 0,
                        "messages.$[m].seenByGuest": true,
                    },
                },
                { arrayFilters: [{ "m.from": "admin", "m.seenByGuest": { $ne: true } }] }
            );
        }

        res.json({
            messages: thread.messages || [],
            unreadGuest: 0,
            label: thread.label,
            trackCode: thread.trackCode,
            threadId: thread._id,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Guest: poll own messages + mark admin replies as read (legacy guestId — prefer by-track) */
router.get("/guest/:guestId", async (req, res) => {
    try {
        // If looks like a track code request misuse, still safe
        const thread = await ChatThread.findOne({ guestId: req.params.guestId }).sort({ lastMessageAt: -1 });
        if (!thread) return res.json({ messages: [], unreadGuest: 0, label: "" });
        if (thread.unreadGuest > 0) {
            await ChatThread.updateOne({ _id: thread._id }, { $set: { unreadGuest: 0 } });
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
        // Do NOT load full messages (base64 images) — only last message text for preview
        const threads = await ChatThread.aggregate([
            { $sort: { lastMessageAt: -1 } },
            { $limit: 200 },
            {
                $project: {
                    label: 1,
                    senderName: 1,
                    receiverName: 1,
                    guestDisplayName: 1,
                    trackCode: 1,
                    unreadAdmin: 1,
                    lastMessageAt: 1,
                    lastMsg: { $arrayElemAt: ["$messages", -1] },
                },
            },
            {
                $project: {
                    label: 1,
                    senderName: 1,
                    receiverName: 1,
                    guestDisplayName: 1,
                    trackCode: 1,
                    unreadAdmin: 1,
                    lastMessageAt: 1,
                    preview: {
                        $cond: [
                            { $and: [{ $ne: ["$lastMsg.text", null] }, { $ne: ["$lastMsg.text", ""] }] },
                            "$lastMsg.text",
                            {
                                $cond: [
                                    { $and: [{ $ne: ["$lastMsg.image", null] }, { $ne: ["$lastMsg.image", ""] }] },
                                    "[Photo]",
                                    "",
                                ],
                            },
                        ],
                    },
                },
            },
        ]);

        const list = threads.map((t) => ({
            id: t._id,
            label: t.label,
            senderName: t.senderName,
            receiverName: t.receiverName,
            guestDisplayName: t.guestDisplayName,
            trackCode: t.trackCode,
            unreadAdmin: t.unreadAdmin || 0,
            lastMessageAt: t.lastMessageAt,
            preview: t.preview || "",
        }));

        const byCode = new Map();
        const noCode = [];
        for (const t of list) {
            const key = (t.trackCode || "").trim();
            if (!key) {
                noCode.push(t);
                continue;
            }
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
        const thread = await ChatThread.findById(req.params.id).lean();
        if (!thread) return res.status(404).json({ error: "Thread not found." });
        if ((thread.unreadAdmin || 0) > 0) {
            // Clear unread without rewriting message images
            await ChatThread.updateOne({ _id: thread._id }, { $set: { unreadAdmin: 0 } });
        }
        res.json({
            id: thread._id,
            label: thread.label,
            senderName: thread.senderName,
            receiverName: thread.receiverName,
            trackCode: thread.trackCode,
            messages: thread.messages || [],
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** Admin: reply to selected thread only */
router.post("/admin/threads/:id/reply", requireAdminOrChatPin, async (req, res) => {
    try {
        const { text, image, fileName, fileType } = req.body || {};
        const msgText = String(text || "").trim();
        let img = image || "";
        let ftCheck = String(fileType || "").toLowerCase();
        if (!ftCheck && img) {
            if (String(img).startsWith("data:video")) ftCheck = "video";
            else if (String(img).startsWith("data:image")) ftCheck = "image";
        }
        const maxAdmin = ftCheck === "video" ? 5500000 : 1200000;
        if (img && img.length > maxAdmin) {
            return res.status(400).json({
                error: ftCheck === "video"
                    ? "Video too large. Send a shorter clip (about 10–15 seconds or under ~4 MB)."
                    : "Photo too large. Send a smaller photo.",
            });
        }
        if (!msgText && !img) return res.status(400).json({ error: "Empty message." });

        let ft = String(fileType || "").toLowerCase();
        if (!ft && img) {
            if (String(img).startsWith("data:video")) ft = "video";
            else if (String(img).indexOf("application/pdf") !== -1) ft = "pdf";
            else if (String(img).startsWith("data:image")) ft = "image";
            else ft = "file";
        }

        const msg = {
            from: "admin",
            text: msgText,
            image: img,
            fileName: fileName || "",
            fileType: ft || "",
            seenByGuest: false,
            createdAt: new Date(),
        };

        const thread = await ChatThread.findByIdAndUpdate(
            req.params.id,
            {
                $push: { messages: msg },
                $inc: { unreadGuest: 1 },
                $set: { lastMessageAt: new Date() },
            },
            { new: true }
        );
        if (!thread) return res.status(404).json({ error: "Thread not found." });

        res.json({ ok: true, messages: thread.messages });
    } catch (e) {
        console.error("admin reply", e);
        res.status(500).json({ error: e.message });
    }
});

/** Admin: delete one message (no trace) */
router.delete("/admin/threads/:id/messages/:msgId", requireAdminOrChatPin, async (req, res) => {
    try {
        const msgId = String(req.params.msgId || "");
        if (!msgId) return res.status(400).json({ error: "Message id required." });

        // $pull is much faster than loading entire thread (with base64) and re-saving
        const thread = await ChatThread.findByIdAndUpdate(
            req.params.id,
            { $pull: { messages: { _id: msgId } }, $set: { lastMessageAt: new Date() } },
            { new: true }
        );
        if (!thread) return res.status(404).json({ error: "Thread not found." });

        res.json({ ok: true, messages: thread.messages || [] });
    } catch (e) {
        // Fallback if ObjectId cast fails
        try {
            const thread = await ChatThread.findById(req.params.id);
            if (!thread) return res.status(404).json({ error: "Thread not found." });
            const msgId = String(req.params.msgId || "");
            const before = (thread.messages || []).length;
            thread.messages = (thread.messages || []).filter(function (m) {
                return String(m._id) !== msgId;
            });
            if (thread.messages.length === before) {
                return res.status(404).json({ error: "Message not found." });
            }
            thread.markModified("messages");
            await thread.save();
            res.json({ ok: true, messages: thread.messages });
        } catch (e2) {
            res.status(500).json({ error: e2.message || e.message });
        }
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





/** Verify standalone chat page PIN (default 4422) */
router.post("/verify-pin", async (req, res) => {
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


/** Admin chat: open ONE thread by tracking code + shipment access PIN only */
router.post("/admin/by-track", requireAdminOrChatPin, async (req, res) => {
    try {
        const trackCode = String((req.body && req.body.trackCode) || "").trim().toUpperCase();
        const accessPin = String((req.body && (req.body.accessPin || req.body.pin)) || "").trim();
        if (!trackCode) return res.status(400).json({ error: "Tracking code required." });
        if (!/^[0-9]{4}$/.test(accessPin)) return res.status(400).json({ error: "4-digit shipment access PIN required." });

        const ship = await Shipment.findOne({ code: trackCode });
        if (!ship) return res.status(404).json({ error: "Tracking code not found." });
        if (!ship.accessPin) {
            return res.status(403).json({ error: "This shipment has no access PIN. Set one when creating the shipment." });
        }
        if (String(ship.accessPin).trim() !== accessPin) {
            return res.status(401).json({ error: "Wrong access PIN. No access to this chat." });
        }

        let thread = await ChatThread.findOne({ trackCode }).sort({ lastMessageAt: -1 });
        if (!thread) {
            // also try case variants
            thread = await ChatThread.findOne({ trackCode: new RegExp("^" + trackCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") }).sort({ lastMessageAt: -1 });
        }
        if (!thread) {
            const senderName = (ship.sender && ship.sender.name) || "";
            const receiverName = (ship.receiver && ship.receiver.name) || "";
            const label = (senderName && receiverName) ? (senderName + " / " + receiverName) : trackCode;
            thread = await ChatThread.create({
                guestId: "admin-track-" + trackCode,
                label,
                senderName,
                receiverName,
                trackCode,
                guestDisplayName: label,
                messages: [],
                unreadAdmin: 0,
                unreadGuest: 0,
            });
        }

        if (thread.unreadAdmin > 0) {
            thread.unreadAdmin = 0;
            await thread.save();
        }

        res.json({
            ok: true,
            id: thread._id,
            threadId: thread._id,
            label: thread.label,
            trackCode: thread.trackCode,
            messages: thread.messages || [],
        });
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
            const ship = await Shipment.findOne({ code: String(thread.trackCode).trim().toUpperCase() });
            needsPin = true;
            if (!ship) {
                return res.status(404).json({ error: "Shipment for this chat not found.", needsPin: true });
            }
            if (!ship.accessPin) {
                return res.status(403).json({
                    error: "This shipment has no access PIN. Set one on the admin board first.",
                    needsPin: true
                });
            }
            // ONLY this shipment's access PIN unlocks this chat — not other shipments
            if (pass && pass === String(ship.accessPin).trim()) ok = true;
        } else {
            return res.status(403).json({
                error: "This chat has no tracking code. Link a shipment access PIN first.",
                needsPin: true
            });
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

module.exports = router;
