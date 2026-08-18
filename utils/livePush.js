const webpush = require("web-push");
const PushSub = require("../models/PushSub");
const Shipment = require("../models/Shipment");

const SPEEDS = {
    slow: 100 / (7 * 24 * 3600),
    normal: 100 / (4 * 24 * 3600),
    fast: 100 / (2 * 24 * 3600),
};

function computeLiveProgress(route) {
    if (!route) return 0;
    if (!route.isMoving || !route.movingSince) return Number(route.progress) || 0;
    const rate = SPEEDS[route.speed || "slow"] || SPEEDS.slow;
    const elapsedSec = (Date.now() - new Date(route.movingSince).getTime()) / 1000;
    return Math.max(0, Math.min(100, (Number(route.progress) || 0) + elapsedSec * rate));
}

let vapidPublic = process.env.VAPID_PUBLIC_KEY || "";
let vapidPrivate = process.env.VAPID_PRIVATE_KEY || "";
const vapidEmail = process.env.VAPID_EMAIL || "mailto:admin@dhltrackpackage.web.app";

function ensureVapid() {
    if (vapidPublic && vapidPrivate) {
        webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
        return;
    }
    const keys = webpush.generateVAPIDKeys();
    vapidPublic = keys.publicKey;
    vapidPrivate = keys.privateKey;
    webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
    console.log("[push] Generated VAPID keys (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in env to keep stable)");
    console.log("[push] VAPID_PUBLIC_KEY=" + vapidPublic);
}

ensureVapid();

function getVapidPublicKey() {
    return vapidPublic;
}

async function sendToSub(subDoc, title, body, tag) {
    const subscription = {
        endpoint: subDoc.endpoint,
        keys: subDoc.keys,
    };
    try {
        await webpush.sendNotification(
            subscription,
            JSON.stringify({ title, body, tag: tag || "dhl-live", url: "/" })
        );
        return true;
    } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
            await PushSub.deleteOne({ _id: subDoc._id }).catch(() => { });
        }
        console.error("[push] send failed", e.statusCode || e.message);
        return false;
    }
}

async function tickLivePushes() {
    try {
        const subs = await PushSub.find({ enabled: true, trackCode: { $ne: "" } }).limit(500);
        if (!subs.length) return;

        const codes = [...new Set(subs.map((s) => s.trackCode))];
        const shipments = await Shipment.find({ code: { $in: codes } });
        const byCode = Object.fromEntries(shipments.map((s) => [s.code, s]));

        for (const sub of subs) {
            const ship = byCode[sub.trackCode];
            if (!ship || !ship.route) continue;
            const r = ship.route;
            const p = Math.round(computeLiveProgress(r));
            if (sub.lastPercent >= 0 && p === sub.lastPercent) continue;
            if (sub.lastPercent >= 0 && Math.abs(p - sub.lastPercent) < 1) continue;

            const o = r.originCountry || "Origin";
            const d = r.destCountry || "Destination";
            const icon = r.icon === "plane" ? "✈️" : r.icon === "ship" ? "🚢" : r.icon === "warehouse" ? "🏭" : "🚚";
            const title = o + " → " + d;
            const body = icon + " " + p + "% complete · " + (r.isMoving ? "moving" : "stopped") + " · " + sub.trackCode;

            const ok = await sendToSub(sub, title, body, "dhl-live-progress");
            if (ok) {
                sub.lastPercent = p;
                await sub.save().catch(() => { });
            }
        }
    } catch (e) {
        console.error("[push] tick error", e.message);
    }
}

function startLivePushLoop() {
    setInterval(tickLivePushes, 20000);
    setTimeout(tickLivePushes, 5000);
    console.log("[push] Live progress push loop started (every 20s)");
}

module.exports = {
    getVapidPublicKey,
    sendToSub,
    tickLivePushes,
    startLivePushLoop,
};