// backend/routes/meterDataRoutes.js
const express = require('express');
const router = express.Router();
const { processIncomingMeterData } = require('../controllers/meterDataController'); // We'll create this controller

// @route   POST /api/meter-data/ingress
// @desc    Endpoint for receiving data from water meters (simulating SMS gateway webhook)
// @access  Public (or secured with a secret key if the gateway supports it)
router.post('/ingress', processIncomingMeterData);

module.exports = router;