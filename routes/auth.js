const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const AdminSettings = require("../models/AdminSettings");
const requireAdmin = require("../middleware/auth");
const router = express.Router();

async function getSettings() {
    const settings = await AdminSettings.findOne();
    if (!settings) {
        throw new Error("Admin account not set up yet. Run `npm run seed` first.");
    }
    return settings;
}

router.post("/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
    }
    try {
        const settings = await getSettings();
        const validUser = username === settings.username;
        const validPass = validUser && (await bcrypt.compare(password, settings.passwordHash));
        if (!validUser || !validPass) {
            return res.status(401).json({ error: "Incorrect username or password." });
        }
        const loginTicket = jwt.sign({ purpose: "pin_check", username }, process.env.JWT_SECRET, { expiresIn: "5m" });
        res.json({ step: "pin_required", loginTicket });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/verify-pin", async (req, res) => {
    const { loginTicket, pin } = req.body;
    if (!loginTicket || !pin) {
        return res.status(400).json({ error: "Missing login ticket or PIN." });
    }
    let payload;
    try {
        payload = jwt.verify(loginTicket, process.env.JWT_SECRET);
        if (payload.purpose !== "pin_check") throw new Error("bad ticket");
    } catch (err) {
        return res.status(401).json({ error: "Your login attempt expired. Please log in again." });
    }
    try {
        const settings = await getSettings();
        const validPin = await bcrypt.compare(String(pin), settings.pinHash);
        if (!validPin) {
            return res.status(401).json({ error: "Incorrect PIN." });
        }
        const token = jwt.sign({ username: payload.username, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "12h" });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put("/credentials", requireAdmin, async (req, res) => {
    const { currentPassword, newUsername, newPassword, newPin } = req.body;
    if (!currentPassword) {
        return res.status(400).json({ error: "Enter your current password to make changes." });
    }
    try {
        const settings = await getSettings();
        const validPass = await bcrypt.compare(currentPassword, settings.passwordHash);
        if (!validPass) {
            return res.status(401).json({ error: "Current password is incorrect." });
        }
        if (newUsername && newUsername.trim()) settings.username = newUsername.trim();
        if (newPassword && newPassword.trim()) settings.passwordHash = await bcrypt.hash(newPassword.trim(), 10);
        if (newPin && newPin.trim()) {
            if (!/^\d{4,8}$/.test(newPin.trim())) {
                return res.status(400).json({ error: "Login PIN must be 4–8 digits." });
            }
            settings.pinHash = await bcrypt.hash(newPin.trim(), 10);
        }
        if (req.body.newChatPin && String(req.body.newChatPin).trim()) {
            const cp = String(req.body.newChatPin).trim();
            if (!/^\d{4,8}$/.test(cp)) {
                return res.status(400).json({ error: "Chat PIN must be 4–8 digits." });
            }
            settings.chatPin = cp;
        }
        await settings.save();
        res.json({ success: true, username: settings.username, chatPin: settings.chatPin || "4422" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Public: is box video service available?
router.get("/box-service", async (req, res) => {
    try {
        const settings = await AdminSettings.findOne();
        const on = settings ? (settings.boxServiceOn !== false) : true;
        res.json({ on });
    } catch (err) {
        res.json({ on: true });
    }
});

// Admin: turn box service on/off
router.put("/box-service", requireAdmin, async (req, res) => {
    try {
        const settings = await getSettings();
        if (typeof req.body.on === "boolean") {
            settings.boxServiceOn = req.body.on;
            await settings.save();
        }
        res.json({ on: settings.boxServiceOn !== false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/signup", (req, res) => {
    res.status(500).json({ error: "Server error. Please try again later." });
});

module.exports = router;
