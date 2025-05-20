// backend/models/User.js

const mongoose = require('mongoose');
const shortid = require('shortid');

const UserSchema = new mongoose.Schema({
  userId: { // Custom user ID if needed, or use MongoDB's _id
    type: String,
    default: () => `USR-${shortid.generate()}`,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true, // Ensures stored email is lowercase
    trim: true,  },
  password: { // Hashed password
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['customer', 'technician', 'admin'],
    required: true,
  },
  // For customers, link to their devices
  assignedDevices: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device'
  }],
  // For technicians, maybe areas of operation or specific skills
  // technicianSpecifics: { type: mongoose.Schema.Types.Mixed },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', UserSchema);