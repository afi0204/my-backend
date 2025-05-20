// backend/models/Bill.js

const mongoose = require('mongoose');
const shortid = require('shortid');

const BillSchema = new mongoose.Schema({
  billId: {
    type: String,
    default: () => `BILL-${shortid.generate()}`,
    unique: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  device: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
  },
  meterId: { // Store for easier querying without populating device
    type: String,
    required: true,
  },
  periodStart: {
    type: Date,
    required: true,
  },
  periodEnd: {
    type: Date,
    required: true,
  },
  previousReading: { // Volume
    type: Number,
    required: true,
  },
  currentReading: { // Volume
    type: Number,
    required: true,
  },
  consumption: { // currentReading - previousReading
    type: Number,
    required: true,
  },
  ratePerUnit: { // Store rate at the time of billing
    type: Number,
    required: true,
  },
  amountDue: {
    type: Number,
    required: true,
  },
  dueDate: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['unpaid', 'paid', 'overdue'],
    default: 'unpaid',
  },
  paymentDate: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Bill', BillSchema);