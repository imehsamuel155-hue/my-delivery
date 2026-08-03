
// Run with: node seed.js
// Populates your MongoDB with the same two demo shipments the front end
// used to create automatically in localStorage. Safe to run more than once —
// it skips any shipment whose code already exists. Also creates the initial
// admin login (username/password/PIN) from your .env, if one doesn't exist yet.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const connectDB = require("./config/db");
const Shipment = require("./models/Shipment");
const AdminSettings = require("./models/AdminSettings");

const demoShipments = [
    {
        code: "NSE100234",
        sender: { name: "Bright Textiles Ltd.", address: "22 Marina Rd, Lagos, Nigeria", phone: "+234 803 555 0110", email: "orders@brighttextiles.com" },
        receiver: { name: "Daniel Kimutai", address: "9 Riverside Dr, Nairobi, Kenya", phone: "+254 712 445 900", email: "daniel.kimutai@example.com" },
        package: { weightKg: 18.5, length: 60, width: 40, height: 35, description: "Cotton fabric rolls" },
        payment: { amount: 340, currency: "USD", method: "Bank Transfer", status: "Paid" },
        mode: "Land Freight",
        estimatedDelivery: "2026-07-22",
        carrier: "NovaShip Standard",
        route: {
            originCountry: "Nigeria", destCountry: "Kenya",
            originLat: 6.5244, originLng: 3.3792, destLat: -1.2921, destLng: 36.8219,
            icon: "truck", speed: "slow", progress: 55, isMoving: false, movingSince: null,
        },
        history: [
            { label: "Order Received", date: "2026-07-01", location: "Lagos, Nigeria" },
            { label: "Dispatched", date: "2026-07-02", location: "Lagos Sorting Hub" },
            { label: "In Transit", date: "2026-07-05", location: "Border Crossing, Benin" },
            { label: "Out For Delivery", date: "2026-07-10", location: "Nairobi, Kenya" },
        ],
    },
    {
        code: "NSE100999",
        sender: { name: "Pacific Electronics", address: "88 Harbor Blvd, Singapore", phone: "+65 8123 4499", email: "sales@pacificelectronics.sg" },
        receiver: { name: "Mei Ling", address: "4 Orchard Court, Singapore", phone: "+65 9988 1122", email: "mei.ling@example.com" },
        package: { weightKg: 4.2, length: 30, width: 25, height: 15, description: "Consumer electronics" },
        payment: { amount: 75, currency: "SGD", method: "Card", status: "Paid" },
        mode: "Air Freight",
        estimatedDelivery: "2026-07-18",
        carrier: "NovaShip Express",
        route: {
            originCountry: "Singapore", destCountry: "Malaysia",
            originLat: 1.3521, originLng: 103.8198, destLat: 3.1390, destLng: 101.6869,
            icon: "plane", speed: "slow", progress: 15, isMoving: false, movingSince: null,
        },
        history: [
            { label: "Order Received", date: "2026-07-12", location: "Singapore" },
            { label: "Dispatched", date: "2026-07-12", location: "Changi Cargo Terminal" },
        ],
    },
];

(async () => {
    await connectDB();

    const pin = process.env.ADMIN_PIN || "000000";
    if (!/^\d{6}$/.test(pin)) {
        console.error("ADMIN_PIN in .env must be exactly 6 digits. Fix it and re-run seed.");
        process.exit(1);
    }
    const force = process.env.FORCE_ADMIN === "1" || process.argv.includes("--force");
    const existingAdmin = await AdminSettings.findOne();
    if (!existingAdmin) {
        await AdminSettings.create({
            username: process.env.ADMIN_USERNAME || "admin",
            passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || "changeme", 10),
            pinHash: await bcrypt.hash(pin, 10),
        });
        console.log(`Admin account created — username: ${process.env.ADMIN_USERNAME || "admin"}, PIN: ${pin}`);
    } else if (force) {
        existingAdmin.username = process.env.ADMIN_USERNAME || "admin";
        existingAdmin.passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "changeme", 10);
        existingAdmin.pinHash = await bcrypt.hash(pin, 10);
        await existingAdmin.save();
        console.log(`Admin RESET — username: ${existingAdmin.username}, PIN: ${pin}`);
    } else {
        console.log("Admin account already exists — skipping. To reset from .env run: npm run seed -- --force");
        console.log("Current username in DB:", existingAdmin.username);
    }

    for (const s of demoShipments) {
        const exists = await Shipment.findOne({ code: s.code });
        if (exists) {
            console.log(`Skipping ${s.code} - already exists.`);
            continue;
        }
        await Shipment.create(s);
        console.log(`Created ${s.code}.`);
    }
    console.log("Done.");
    process.exit(0);
})();
