const express = require('express');
const router = express.Router();
const { getSystemSummary, getConsumptionTrend, getBillingOverview } = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All report routes are protected and for admin only
router.use(protect);
router.use(authorize('admin'));

router.get('/summary', getSystemSummary);
router.get('/consumption-trend', getConsumptionTrend); // e.g., ?months=6
router.get('/billing-overview', (req, res) => { // Temporary simple handler
    console.log('--- [reportRoutes.js] /billing-overview TEMP HANDLER CALLED ---');
    res.json({ message: "Billing overview temp route hit!" });
});

module.exports = router;
