const express = require("express");
const PushSub = require("../models/PushSub");
const { getVapidPublicKey } = require("../utils/livePush");

const router = express.Router();

// Public key for browser PushManager.subscribe
router.get("/vapid-public-key", (req, res) => {
    res.json({ publicKey: getVapidPublicKey() });
});

// Save subscription + which tracking code to follow
router.post("/subscribe", async (req, res) => {
    try {
        const { subscription, trackCode } = req.body || {};
        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({ error: "Invalid subscription." });
        }
        const code = String(trackCode || "").trim().toUpperCase();
        const doc = await PushSub.findOneAndUpdate(
            { endpoint: subscription.endpoint },
            {
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.keys.p256dh,
                    auth: subscription.keys.auth,
                },
                trackCode: code,
                enabled: true,
                lastPercent: -1,
            },
            { upsert: true, new: true }
        );
        res.json({ ok: true, trackCode: doc.trackCode });
    } catch (e) {
        res.status(500).json({ error: e.message || "Subscribe failed." });
    }
});

router.post("/unsubscribe", async (req, res) => {
    try {
        const { endpoint } = req.body || {};
        if (endpoint) {
            await PushSub.findOneAndUpdate({ endpoint }, { enabled: false });
        }
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: "Unsubscribe failed." });
    }
});

module.exports = router;
