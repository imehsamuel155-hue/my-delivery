
const mongoose = require("mongoose");

// Singleton document - there's only ever one of these. It holds the admin
// login credentials and PIN as bcrypt hashes so they're never stored in
// plain text, and so they can be changed later from the admin dashboard
// instead of being locked to whatever's in your .env forever.
const AdminSettingsSchema = new mongoose.Schema(
    {
        username: { type: String, required: true },
        passwordHash: { type: String, required: true },
        pinHash: { type: String, required: true }, // 6-digit PIN, required as a second step at login
    },
    { timestamps: true }
);

module.exports = mongoose.model("AdminSettings", AdminSettingsSchema);
