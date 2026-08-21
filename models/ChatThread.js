const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
    {
        from: { type: String, enum: ["guest", "admin"], required: true },
        text: { type: String, trim: true, default: "" },
        image: { type: String, default: "" }, // data URL or url (image/video/pdf)
        fileName: { type: String, default: "" },
        fileType: { type: String, default: "" }, // image | video | pdf | file
        createdAt: { type: Date, default: Date.now },
    },
    { _id: true }
);

const ChatThreadSchema = new mongoose.Schema(
    {
        guestId: { type: String, required: true, index: true },
        label: { type: String, required: true, trim: true }, // e.g. "James Chan / Putri Union"
        senderName: { type: String, trim: true, default: "" },
        receiverName: { type: String, trim: true, default: "" },
        trackCode: { type: String, trim: true, uppercase: true, default: "" },
        guestDisplayName: { type: String, trim: true, default: "Guest" },
        messages: { type: [MessageSchema], default: [] },
        unreadAdmin: { type: Number, default: 0 },
        unreadGuest: { type: Number, default: 0 },
        lastMessageAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

ChatThreadSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model("ChatThread", ChatThreadSchema);
