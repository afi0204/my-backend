// backend/models/UsageReading.js
const mongoose = require('mongoose');

const UsageReadingSchema = new mongoose.Schema({
  deviceId: { // MongoDB _id of the Device
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
  },
  meterId: { // The physical Meter ID string, for easier querying/indexing
    type: String,
    required: true,
    index: true,
  },
  timestamp: { // When the reading was taken or received
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  volumeReading: { // The absolute volume reading from the meter at this timestamp
    type: Number,
    required: true,
  },
  // Optional: Calculated consumption since the PREVIOUS reading for this device
  // This would require fetching the last reading when saving a new one.
  // consumptionSinceLast: {
  //   type: Number,
  // },
  source: { // Where this reading came from
    type: String,
    enum: ['meter_ingress', 'manual_entry', 'initialization', 'billing_process'],
    default: 'meter_ingress'
  }
});

// Compound index for efficient querying by device and time
UsageReadingSchema.index({ deviceId: 1, timestamp: -1 });
UsageReadingSchema.index({ meterId: 1, timestamp: -1 });

module.exports = mongoose.model('UsageReading', UsageReadingSchema);