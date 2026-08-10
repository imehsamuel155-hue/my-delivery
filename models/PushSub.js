const mongoose = require("mongoose");

const PushSubSchema = new mongoose.Schema(
    {
        endpoint: { type: String, required: true, unique: true },
        keys: {
            p256dh: String,
            auth: String,
        },
        trackCode: { type: String, uppercase: true, trim: true, index: true, default: "" },
        enabled: { type: Boolean, default: true },
        lastPercent: { type: Number, default: -1 },
    },
    { timestamps: true }
);

module.exports = mongoose.model("PushSub", PushSubSchema);
