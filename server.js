
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");

const authRoutes = require("./routes/auth");
const shipmentRoutes = require("./routes/shipments");
const contactRoutes = require("./routes/contact");

const app = express();
const PUBLIC = path.join(__dirname, "public");

const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors({ origin: (!corsOrigin || corsOrigin === "*") ? "*" : corsOrigin.split(",") }));
app.use(express.json({ limit: "15mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/shipments", shipmentRoutes);
app.use("/api/contact", contactRoutes);

app.use(express.static(PUBLIC, { index: false }));

const pages = {
    "/": "index.html",
    "/admin": "admin.html",
    "/track": "index.html",
    "/receipt": "receipt.html",
    "/box": "box.html",
};
Object.entries(pages).forEach(([route, file]) => {
    app.get(route, (req, res) => res.sendFile(path.join(PUBLIC, file)));
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "Unexpected server error." });
});

const PORT = process.env.PORT || 5000;
connectDB().then(() => {
    app.listen(PORT, () => console.log(`My Delivery API running on port ${PORT}`));
});
