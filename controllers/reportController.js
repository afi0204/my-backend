const User = require('../models/User');
const Device = require('../models/Device');
const Bill = require('../models/Bill');
const mongoose = require('mongoose'); // For ObjectId if needed

// @desc    Get system summary statistics
// @route   GET /api/reports/summary
// @access  Private/Admin
const getSystemSummary = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const userRoles = await User.aggregate([
            { $group: { _id: '$role', count: { $sum: 1 } } },
            { $project: { _id: 0, role: '$_id', count: 1 } }
        ]);

        const totalDevices = await Device.countDocuments();
        const deviceStatuses = await Device.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $project: { _id: 0, status: '$_id', count: 1 } }
        ]);

        // Convert array of objects to object for easier frontend access
        const userCounts = userRoles.reduce((acc, item) => {
            acc[item.role] = item.count;
            return acc;
        }, { total: totalUsers });

        const deviceCounts = deviceStatuses.reduce((acc, item) => {
            acc[item.status] = item.count;
            return acc;
        }, { total: totalDevices });


        res.json({
            userCounts,
            deviceCounts
        });

    } catch (error) {
        console.error('Error fetching system summary:', error);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get consumption trend (e.g., last 6 months)
// @route   GET /api/reports/consumption-trend?months=6
// @access  Private/Admin
const getConsumptionTrend = async (req, res) => {
    try {
        const numberOfMonths = parseInt(req.query.months) || 6; // Default to 6 months
        const today = new Date();
        const monthlyConsumptions = [];

        for (let i = 0; i < numberOfMonths; i++) {
            const targetMonth = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const nextMonth = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);

            const monthStr = `${targetMonth.getFullYear()}-${(targetMonth.getMonth() + 1).toString().padStart(2, '0')}`;

            // This aggregation assumes bills accurately reflect consumption for the period
            const result = await Bill.aggregate([
                {
                    $match: {
                        periodEnd: { // Or periodStart, depending on your billing cycle logic
                            $gte: targetMonth,
                            $lt: nextMonth
                        },
                        // status: 'paid' // Optional: only count paid/finalized consumption
                    }
                },
                {
                    $group: {
                        _id: null, // Group all matched bills
                        totalConsumption: { $sum: '$consumption' }
                    }
                }
            ]);
            monthlyConsumptions.unshift({ // Add to beginning to keep chronological order
                month: monthStr,
                totalConsumption: result.length > 0 ? result[0].totalConsumption : 0
            });
        }
        res.json(monthlyConsumptions); // [{ month: 'YYYY-MM', totalConsumption: X }, ...]
    } catch (error) {
        console.error('Error fetching consumption trend:', error);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get billing overview for a specific month or current
// @route   GET /api/reports/billing-overview?month=YYYY-MM
// @access  Private/Admin
const getBillingOverview = async (req, res) => {
    try {
        const monthQuery = req.query.month; // YYYY-MM format
        let startDate, endDate;

        if (monthQuery) {
            const [year, month] = monthQuery.split('-').map(Number);
            startDate = new Date(year, month - 1, 1);
            endDate = new Date(year, month, 1); // First day of next month
        } else { // Default to current month
            const today = new Date();
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        }

        const billingData = await Bill.aggregate([
            {
                $match: {
                    createdAt: { // Assuming bills are created within the month they pertain to,
                                 // or use periodStart/periodEnd for more accuracy
                        $gte: startDate,
                        $lt: endDate
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalBilledAmount: { $sum: '$amountDue' },
                    totalPaidAmount: {
                        $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amountDue', 0] }
                    },
                    totalBills: { $sum: 1 },
                    paidBills: {
                        $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
                    },
                    unpaidBills: {
                        $sum: { $cond: [{ $eq: ['$status', 'unpaid'] }, 1, 0] }
                    },
                    overdueBills: { // This might need more complex logic based on dueDate vs. today
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ['$status', 'paid'] },
                                        { $lt: ['$dueDate', new Date()] } // dueDate is past and not paid
                                    ]
                                }, 1, 0
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0 // Exclude the _id field from the result
                }
            }
        ]);

        res.json(billingData.length > 0 ? billingData[0] : {
            totalBilledAmount: 0,
            totalPaidAmount: 0,
            totalBills: 0,
            paidBills: 0,
            unpaidBills: 0,
            overdueBills: 0
        });
    } catch (error) {
        console.error('Error fetching billing overview:', error);
        res.status(500).json({ msg: 'Server Error' });
    }
};


module.exports = {
    getSystemSummary,
    getConsumptionTrend,
    getBillingOverview
};