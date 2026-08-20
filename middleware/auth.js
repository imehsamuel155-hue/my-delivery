const jwt = require("jsonwebtoken");
const AdminSettings = require("../models/AdminSettings");

function requireAdmin(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: "Missing or invalid Authorization header." });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.role !== "admin") {
            return res.status(403).json({ error: "Not authorized." });
        }
        req.admin = payload;
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token." });
    }
}

/** Admin JWT or X-Chat-Pin / body pin matching settings.chatPin (default 4422) */
async function requireAdminOrChatPin(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (token) {
        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            if (payload.role === "admin") {
                req.admin = payload;
                return next();
            }
        } catch (e) { /* fall through to chat pin */ }
    }
    try {
        const pin = String(
            req.headers["x-chat-pin"] ||
            (req.body && req.body.chatPin) ||
            (req.query && req.query.chatPin) ||
            ""
        ).trim();
        const s = await AdminSettings.findOne();
        const expected = (s && s.chatPin) ? String(s.chatPin).trim() : "4422";
        if (pin && pin === expected) {
            req.chatPinOk = true;
            return next();
        }
        return res.status(401).json({ error: "Login as admin or enter chat PIN 4422." });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}

module.exports = requireAdmin;
module.exports.requireAdmin = requireAdmin;
module.exports.requireAdminOrChatPin = requireAdminOrChatPin;
