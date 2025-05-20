// backend/routes/billRoutes.js
const express = require('express');
const router = express.Router();
const {
    createBill,
    getBillsForUser,
    getAllBills,
    updateBillStatus,
    getBillById,
    updateBill // Import the new controller function
} = require('../controllers/billController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Customer: View their own bills
router.get('/my-bills', protect, authorize('customer'), getBillsForUser);

// Admin: Manage all bills
router.post('/', protect, authorize('admin'), createBill); // Admin or system generates bills
router.get('/', protect, authorize('admin'), getAllBills);
router.get('/:id', protect, authorize('admin', 'customer'), getBillById); // Customer can view a specific bill of theirs
router.put('/:id', protect, authorize('admin'), updateBill); // Admin updates a full bill
router.put('/:id/status', protect, authorize('admin'), updateBillStatus); // Admin updates payment status

module.exports = router;