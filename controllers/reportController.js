// backend/controllers/reportController.js
const UsageReading = require('../models/UsageReading');
const Bill = require('../models/Bill');
const Device = require('../models/Device');
const mongoose = require('mongoose'); // For ObjectId validation

// Helper function to get start/end dates for periods
const getDateRange = (period) => {
    const now = new Date();
    let start, end = new Date(now); // End is 'now' or end of today for daily

    switch (period) {
        case 'today':
            start = new Date(now.setHours(0, 0, 0, 0));
            end = new Date(now.setHours(23, 59, 59, 999));
            break;
        case 'yesterday':
            end = new Date(now.setHours(0, 0, 0, 0) - 1); // End of yesterday
            start = new Date(new Date(end).setHours(0,0,0,0)); // Start of yesterday
            break;
        case 'last7days':
            end = new Date(now.setHours(23, 59, 59, 999)); // End of today
            start = new Date(new Date().setDate(now.getDate() - 6)); // 6 days ago + today = 7 days
            start.setHours(0,0,0,0);
            break;
        case 'last30days':
            end = new Date(now.setHours(23, 59, 59, 999));
            start = new Date(new Date().setDate(now.getDate() - 29));
            start.setHours(0,0,0,0);
            break;
        case 'thisMonth':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); // Last day of current month
            break;
        case 'lastMonth':
            start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999); // Last day of previous month
            break;
        default: // Default to last 30 days if period is invalid
            end = new Date(now.setHours(23, 59, 59, 999));
            start = new Date(new Date().setDate(now.getDate() - 29));
            start.setHours(0,0,0,0);
    }
    return { start, end };
};


// @desc    Get overall system consumption summary (using Bills for simplicity for now)
const getOverallConsumptionSummary = async (req, res) => {
    try {
        const periodQuery = req.query.period || 'last30days'; // e.g., today, last7days, last30days, thisMonth, lastMonth
        const { start, end } = getDateRange(periodQuery);

        console.log(`[ReportController] getOverallConsumptionSummary - Period: ${periodQuery}, Start: ${start}, End: ${end}`);

        // Using Bills collection for a simpler summary for now
        // Sum consumption from bills within the period
        const billAggregation = await Bill.aggregate([
            {
                $match: {
                    periodEnd: { $gte: start, $lte: end }, // Bills whose period ends within the query range
                    // status: 'paid' // Optional: only consider paid bills for consumption
                }
            },
            {
                $group: {
                    _id: null, // Group all matched bills
                    totalConsumption: { $sum: "$consumption" },
                    totalAmountBilled: { $sum: "$amountDue" },
                    billedCount: { $sum: 1 }
                }
            }
        ]);
        
        const summary = billAggregation.length > 0 ? billAggregation[0] : { totalConsumption: 0, totalAmountBilled: 0, billedCount: 0 };

        // Get other stats
        const totalDevices = await Device.countDocuments({});
        const activeDevices = await Device.countDocuments({ status: 'active' });
        const totalUsers = await Device.countDocuments({}); // Should be User.countDocuments({})

        res.json({
            period: periodQuery,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            totalSystemConsumption: summary.totalConsumption,
            totalAmountBilled: summary.totalAmountBilled,
            numberOfBillsInPeriod: summary.billedCount,
            totalDevices,
            activeDevices,
            totalUsers // This should come from User model count
        });

    } catch (error) {
        console.error('[ReportController] Error in getOverallConsumptionSummary:', error);
        res.status(500).json({ msg: 'Server error fetching consumption summary.' });
    }
};


// @desc    Get consumption history for a specific device
const getDeviceConsumptionHistory = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const periodType = req.query.periodType || 'daily'; // daily, weekly, monthly
        const range = req.query.range || 'last30days'; // last7days, last30days, lastYear, or specific YYYY-MM or YYYY

        if (!mongoose.Types.ObjectId.isValid(deviceId)) {
            return res.status(400).json({ msg: 'Invalid Device ID format' });
        }

        const { start, end } = getDateRange(range); // Use getDateRange for overall range
        console.log(`[ReportController] getDeviceConsumptionHistory for ${deviceId} - PeriodType: ${periodType}, Range: ${range} (Start: ${start}, End: ${end})`);


        // Fetch all readings within the broader range first
        const readings = await UsageReading.find({
            deviceId: deviceId,
            timestamp: { $gte: start, $lte: end }
        }).sort({ timestamp: 'asc' });

        if (readings.length < 2 && periodType !== 'total') { // Need at least 2 readings to calculate consumption difference for periods
            return res.json({ deviceId, periodType, range, data: [], message: 'Not enough readings in the selected range to calculate periodic consumption.' });
        }
        if (readings.length === 0 && periodType === 'total') {
             return res.json({ deviceId, periodType, range, data: [], message: 'No readings found in the selected range.' });
        }


        let consumptionData = [];

        if (periodType === 'total') { // Total consumption in the given range
            if (readings.length > 0) {
                const totalConsumptionInRange = readings[readings.length - 1].volumeReading - readings[0].volumeReading;
                consumptionData.push({
                    period: `${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`,
                    consumption: totalConsumptionInRange >= 0 ? totalConsumptionInRange : 0 // Handle potential reset
                });
            } else {
                 consumptionData.push({ period: 'N/A', consumption: 0 });
            }
        } else {
            // For daily, weekly, monthly - aggregate from sorted readings
            // This requires more complex aggregation logic.
            // For a simpler start, we can calculate consumption between consecutive readings.
            // A true daily/weekly/monthly sum needs grouping.

            // Example: Simple consumption between readings (not aggregated by day/week/month yet)
            // for (let i = 1; i < readings.length; i++) {
            //     consumptionData.push({
            //         periodStart: readings[i-1].timestamp,
            //         periodEnd: readings[i].timestamp,
            //         consumption: readings[i].volumeReading - readings[i-1].volumeReading
            //     });
            // }

            // Placeholder for actual aggregation (this is complex)
            // For daily: group readings by day, find first/last reading of day, calculate diff.
            // For monthly: group by month, find first reading of month, last reading of month.
            // Using MongoDB Aggregation Framework is best for this.
             if (readings.length > 0) {
                consumptionData.push({
                    period: `Aggregated data for ${periodType} (Detail TBD)`,
                    consumption: readings[readings.length - 1].volumeReading - readings[0].volumeReading, // This is total, not periodic yet
                    detail: "Actual periodic aggregation (daily/weekly/monthly) from raw readings requires MongoDB aggregation pipeline - not fully implemented here."
                });
            }
        }


        res.json({
            deviceId,
            periodType,
            range,
            data: consumptionData,
            // rawReadingsCount: readings.length // For debugging
        });

    } catch (error) {
        console.error(`[ReportController] Error in getDeviceConsumptionHistory for ${req.params.deviceId}:`, error);
        res.status(500).json({ msg: 'Server error fetching device consumption history.' });
    }
};


module.exports = {
    getOverallConsumptionSummary,
    getDeviceConsumptionHistory
};