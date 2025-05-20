// backend/routes/smsRoutes.js
const express = require('express');
const router = express.Router();
const { processSimulatedSms } = require('../services/smsService');
const { protect, authorize } = require('../middleware/authMiddleware');
const SMSLog = require('../models/SMSLog');

// @route   POST /api/sms/simulate
// @desc    Simulate an incoming SMS command (for Technician App to call)
// @access  Private (Technician or Admin)
router.post('/simulate', protect, authorize('technician', 'admin'), async (req, res) => {
    const { commandString } = req.body; // e.g., "INIT:pw,MTR001,server,0,6"
    const technicianUserId = req.user.id; // Logged-in technician

    if (!commandString) {
        return res.status(400).json({ msg: 'commandString is required' });
    }

    const result = await processSimulatedSms(commandString, technicianUserId);

    if (result.success) {
        res.json({ msg: result.message, log: result.details });
    } else {
        res.status(400).json({ msg: result.message, log: result.details });
    }
});

// @route   GET /api/sms/logs
// @desc    Get all SMS logs (for Admin)
// @access  Private (Admin)
router.get('/logs', protect, authorize('admin'), async (req, res) => {
    try {
        const logs = await SMSLog.find()
            .populate('processedByTechnician', 'name email')
            .sort({ timestamp: -1 });
        res.json(logs);
    } catch (error) {
        console.error('Error fetching SMS logs:', error);
        res.status(500).json({ msg: 'Server error fetching SMS logs' });
    }
});

// @route   GET /api/sms/logs/device/:meterId
// @desc    Get SMS logs for a specific device (for Admin/Technician)
// @access  Private (Admin, Technician)
router.get('/logs/device/:meterId', protect, authorize('admin', 'technician'), async (req, res) => {
    try {
        const logs = await SMSLog.find({ meterId: req.params.meterId })
            .populate('processedByTechnician', 'name email')
            .sort({ timestamp: -1 });
        res.json(logs);
    } catch (error) {
        console.error(`Error fetching SMS logs for device ${req.params.meterId}:`, error);
        res.status(500).json({ msg: 'Server error fetching device SMS logs' });
    }
});


module.exports = router;