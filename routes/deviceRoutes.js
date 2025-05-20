// backend/routes/deviceRoutes.js
const express = require('express');
const router = express.Router();

const {
  createDevice,
  getAllDevices,
  getDeviceById,
  updateDevice,
  deleteDevice,
  getTechnicianDevices,    // For technician home screen
  handleDeviceDataUpdate,  // Handler for meter data uploads
  handleSmsCommand         // New handler for SMS command simulation
} = require('../controllers/deviceController');

const { protect, authorize } = require('../middleware/authMiddleware');

// Public routes (no auth) for device-initiated requests
router.post('/data-update', handleDeviceDataUpdate);
router.post('/sms-command', handleSmsCommand);

// Technician-specific route for their home screen
router.get(
  '/technician/home',
  protect,
  authorize('technician', 'admin'),
  getTechnicianDevices
);

// Admin routes for full device management
router.post('/', protect, authorize('admin'), createDevice);
router.get('/', protect, authorize('admin', 'technician'), getAllDevices);
router.get('/:id', protect, authorize('admin', 'technician'), getDeviceById);
router.put('/:id', protect, authorize('admin'), updateDevice);
router.delete('/:id', protect, authorize('admin'), deleteDevice);

module.exports = router;
