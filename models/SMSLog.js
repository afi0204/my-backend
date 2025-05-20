// backend/models/SMSLog.js

const mongoose = require('mongoose');

const SMSLogSchema = new mongoose.Schema({
  meterId: { // Meter ID the command was intended for
    type: String,
    required: true,
  },
  commandType: { // e.g., 'INIT', 'SET_SERVER', 'SET_TIME'
    type: String,
    required: true,
  },
  rawCommand: { // The full SMS command string
    type: String,
    required: true,
  },
  parameters: { // Parsed parameters from the command
    type: mongoose.Schema.Types.Mixed,
  },
  status: { // 'success', 'failed', 'pending'
    type: String,
    required: true,
    default: 'pending'
  },
  response: { // Simulated response from device or error message
    type: String,
  },
  processedByTechnician: { // Technician who sent the command
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    // required: true // Assuming commands come from authenticated technicians
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('SMSLog', SMSLogSchema);