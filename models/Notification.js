
const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
    {
        code: { type: String, required: true, uppercase: true, trim: true, index: true },
        title: { type: String, required: true },
        message: { type: String, required: true },
        type: {
            type: String,
            enum: ["status", "created", "route", "delivered", "hold", "system"],
            default: "status",
        },
        location: { type: String, default: "" },
        read: { type: Boolean, default: false },
    },
    { timestamps: true }
);

NotificationSchema.index({ code: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", NotificationSchema);
