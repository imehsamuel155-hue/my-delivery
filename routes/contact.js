
const express = require("express");
const ContactMessage = require("../models/ContactMessage");
const router = express.Router();

// POST /api/contact - stores the message; wire up real email sending later if you want
router.post("/", async (req, res) => {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: "All fields are required." });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({ error: "Please enter a valid email." });
    }

    try {
        await ContactMessage.create({ name, email, subject, message });
        res.status(201).json({ success: true, note: "We've received your message and will get back to you shortly." });
    } catch (err) {
        res.status(500).json({ error: "Something went wrong sending your message." });
    }
});

module.exports = router;
