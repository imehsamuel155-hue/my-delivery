const mongoose = require("mongoose");

const AdminSettingsSchema = new mongoose.Schema(
    {
        username: { type: String, required: true },
        passwordHash: { type: String, required: true },
        pinHash: { type: String, required: true },
        // Box / package video service — OFF shows "server unavailable" on box page
        boxServiceOn: { type: Boolean, default: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model("AdminSettings", AdminSettingsSchema);
