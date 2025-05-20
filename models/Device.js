// backend/models/Device.js

const mongoose = require('mongoose');
const shortid = require('shortid');

const DeviceSchema = new mongoose.Schema({
  meterId: { // The unique identifier for the physical water meter
    type: String,
    required: true,
    unique: true,
  },
  // `password` is used for SMS command authentication for the device itself
  devicePassword: {
    type: String, // This should be a simple password for SMS commands, not hashed like user passwords
    required: true, // As per "Initialization" feature
    default: "000000" // Default initial password, admin can change
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance', 'uninitialized', 'pending_installation'],
    default: 'uninitialized',
  },
  batteryVoltage: {
    type: String, // e.g., "3.7V"
    default: 'N/A',
  },
  currentVolume: { // Current total volume reading
    type: Number,
    default: 0,
  },
  initializationVolume: { // Volume at initialization
    type: Number,
    default: 0,
  },
  networkStrength: { // e.g., "Good", "-75dBm"
    type: String,
    default: 'N/A',
  },
  serverAddress: { // GPRS server address device reports to
    type: String,
    default: 'http://your-data-ingestion-server.com/api/data', // Example
  },
  // Device Internals - Essential fields, often updated by technicians
  firmwareVersion: {
    type: String,
    default: 'N/A', // Default if not provided initially
  },
  iccid: {
    type: String,
    default: 'N/A',
  },
  imei: {
    type: String,
    default: 'N/A',
  },
  imsi: {
    type: String,
    default: 'N/A',
  },
  cellId: {
    type: String,
    default: 'N/A',
  },
  digits: { // Number of digits on the meter display
    type: Number,
    default: 6,
  },
  deviceOffPeriod: { // For timing settings
    type: String, // e.g., "22:00"
    default: '00:00',
  },
  deviceOnPeriod: { // For timing settings
    type: String, // e.g., "06:00"
    default: '00:00',
  },
  lastSeen: {
    type: Date,
  },
  location: { // Optional: for mapping or admin reference
    type: {
      type: String,
      enum: ['Point'],
      // required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      // required: true
    },
    address: String,
  },
  assignedToUser: { // Link to the customer user
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  notes: String,
  // Timestamps will be handled by Mongoose options below
}, { timestamps: true }); // Adds createdAt and updatedAt fields automatically

module.exports = mongoose.model('Device', DeviceSchema);