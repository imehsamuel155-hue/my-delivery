const mongoose = require("mongoose");

async function connectDB() {
    try {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            throw new Error("MONGODB_URI is missing. Check your .env file.");
        }
        await mongoose.connect(uri);
        console.log("MongoDB connected:", mongoose.connection.host);
    } catch (err) {
        console.error("MongoDB connection error:", err.message);
        process.exit(1);
    }
}

module.exports = connectDB;