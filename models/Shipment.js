const mongoose = require("mongoose");

const PartySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        address: { type: String, required: true, trim: true },
        phone: { type: String, trim: true },
        email: { type: String, trim: true },
    },
    { _id: false }
);

const PackageSchema = new mongoose.Schema(
    {
        weightKg: { type: Number, required: true },
        length: { type: Number },
        width: { type: Number },
        height: { type: Number },
        description: { type: String, trim: true },
    },
    { _id: false }
);

const PaymentSchema = new mongoose.Schema(
    {
        amount: { type: Number, required: true },
        currency: { type: String, default: "USD", trim: true },
        method: {
            type: String,
            enum: ["Card", "Bank Transfer", "Outstanding Payment", "Cash on Delivery"],
            default: "Card",
        },
        status: {
            type: String,
            enum: ["Paid", "Unpaid", "Refunded"],
            default: "Unpaid",
        },
    },
    { _id: false }
);

const StatusStepSchema = new mongoose.Schema(
    {
        label: { type: String, required: true, trim: true },
        location: { type: String, trim: true, default: "—" },
        date: { type: String, required: true }, // stored as YYYY-MM-DD to match the front end
    },
    { _id: false }
);

const RouteSchema = new mongoose.Schema(
    {
        originCountry: String,
        destCountry: String,
        originLat: Number,
        originLng: Number,
        destLat: Number,
        destLng: Number,
        icon: { type: String, enum: ["truck", "plane", "ship"], default: "truck" },
        vehicleImg: { type: String, default: "" },
        speed: { type: String, enum: ["slow", "normal", "fast"], default: "slow" },
        flipOverride: { type: Boolean, default: false },
        rotationDeg: { type: Number, default: 0 },
        progress: { type: Number, default: 0, min: 0, max: 100 }, // frozen progress when not moving
        isMoving: { type: Boolean, default: false },
        movingSince: { type: Date, default: null }, // when isMoving is true, progress is computed live from this
    },
    { _id: false }
);

const ShipmentSchema = new mongoose.Schema(
    {
        code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
        sender: { type: PartySchema, required: true },
        receiver: { type: PartySchema, required: true },
        package: { type: PackageSchema, required: true },
        payment: { type: PaymentSchema, required: true },
        carrier: { type: String, trim: true },
        waybillNumber: { type: String, trim: true, default: '' },
        serviceType: { type: String, trim: true, default: 'EXPRESS WORLDWIDE' },
        packagingType: { type: String, trim: true, default: 'My Own Package' },
        pieces: { type: Number, default: 1 },
        weightLbs: { type: String, default: '' },
        dimensionalWeight: { type: String, default: '' },
        chargeableWeight: { type: String, default: '' },
        insuredAmount: { type: String, default: '' },
        termsOfTrade: { type: String, default: 'DDP' },
        billingAccount: { type: String, default: '' },
        dutiesTaxesAccount: { type: String, default: '' },
        declaredValue: { type: String, default: '' },
        declaredCurrency: { type: String, default: 'USD' },
        dutiable: { type: String, default: 'Shipper' },
        specialServices: { type: String, default: '' },
        shipmentDate: { type: String, default: '' },
        reference: { type: String, default: '' },
        originCountry: { type: String, default: '' },
        destCountryLabel: { type: String, default: '' },
        estimatedDelivery: { type: String, trim: true },
        mode: {
            type: String,
            enum: ["Air Freight", "Sea Freight", "Land Freight"],
            default: "Air Freight",
        },
        route: { type: RouteSchema, default: () => ({}) },
        history: { type: [StatusStepSchema], default: [] },
        // Optional 4-digit code an admin can set per shipment. If set, any admin
        // user must enter it correctly before they can open/edit this specific
        // shipment - even though they're already logged into the dashboard.
        boxImage: { type: String, default: '' }, // base64 or url for /box page
        accessPin: {
            type: String,
            validate: {
                validator: v => !v || /^\d{4}$/.test(v),
                message: "Shipment access PIN must be exactly 4 digits.",
            },
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Shipment", ShipmentSchema);
