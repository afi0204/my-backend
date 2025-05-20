// backend/controllers/billController.js
const Bill = require('../models/Bill');
const Device = require('../models/Device');
const User = require('../models/User');

// --- Function Definitions ---

// @desc    Create a new bill
const createBill = async (req, res) => {
    console.log('[billController] createBill called. Request body:', req.body);
    const {
        userId,
        deviceId,
        meterId, // The actual meter ID string
        periodStart,
        periodEnd,
        previousReading,
        currentReading,
        ratePerUnit,
        // consumption, // Can be calculated if not provided
        // amountDue,   // Can be calculated if not provided
        dueDate
    } = req.body;

    let calculatedConsumption = req.body.consumption;
    let calculatedAmountDue = req.body.amountDue;

    // Basic validation
    if (!userId || !deviceId || !meterId || !periodStart || !periodEnd ||
        previousReading === undefined || currentReading === undefined || ratePerUnit === undefined || !dueDate) {
        return res.status(400).json({ msg: 'Please provide all required bill fields.' });
    }

    // Calculate consumption if not provided
    if (calculatedConsumption === undefined && previousReading !== undefined && currentReading !== undefined) {
        calculatedConsumption = parseFloat(currentReading) - parseFloat(previousReading);
        if (calculatedConsumption < 0) {
            // This might indicate an issue, like a meter reset or incorrect readings
            console.warn(`[billController] Calculated consumption is negative for meter ${meterId}. Current: ${currentReading}, Previous: ${previousReading}`);
            // Depending on business rules, you might want to error out or flag this bill.
            // For now, we'll allow it but it's something to consider.
        }
    }
    // Calculate amountDue if not provided and consumption is available
    if (calculatedAmountDue === undefined && calculatedConsumption !== undefined && ratePerUnit !== undefined) {
        calculatedAmountDue = calculatedConsumption * parseFloat(ratePerUnit);
    }

    try {
        const newBill = new Bill({
            user: userId,
            device: deviceId,
            meterId,
            periodStart: new Date(periodStart),
            periodEnd: new Date(periodEnd),
            previousReading,
            currentReading,
            consumption: calculatedConsumption,
            ratePerUnit,
            amountDue: calculatedAmountDue,
            dueDate: new Date(dueDate),
            status: 'unpaid' // Default status for a new bill
        });

        const savedBill = await newBill.save();
        res.status(201).json(savedBill);
    } catch (error) {
        console.error('Error creating bill:', error.message);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ msg: 'Server Error creating bill' });
    }
};

// @desc    Get bills for the logged-in user (customer)
const getBillsForUser = async (req, res) => { // <<<< FUNCTION DEFINITION
    // ... your getBillsForUser logic ...
    try {
        const bills = await Bill.find({ user: req.user.id }) // req.user.id from auth middleware
                                .sort({ periodEnd: -1 })
                                .populate('device', 'meterId');
        if (!bills) {
            return res.status(404).json({ msg: 'No bills found for this user.' });
        }
        res.json(bills);
    } catch (error) {
        console.error('Error in getBillsForUser:', error.message);
        res.status(500).json({ msg: 'Server Error fetching user bills' });
    }
};

// @desc    Get all bills (for admin)
const getAllBills = async (req, res) => {
    console.log('--- [BACKEND billController] getAllBills: Handler called ---');
    console.log('[BACKEND billController] getAllBills: Request query:', req.query);

    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const sortField = req.query.sort || 'periodEnd'; // Default sort field
        const sortOrder = req.query.order === 'asc' ? 1 : -1; // Default to descending

        const query = {};

        // Filtering by status
        if (req.query.status) {
            query.status = req.query.status;
            console.log(`[BACKEND billController] Filtering by status: ${req.query.status}`);
        }

        // Filtering by user ID (if admin wants to see bills for a specific user)
        if (req.query.userId) {
            query.user = req.query.userId;
            console.log(`[BACKEND billController] Filtering by user ID: ${req.query.userId}`);
        }

        // Filtering by meterId
        if (req.query.meterId) {
            query.meterId = { $regex: req.query.meterId, $options: 'i' }; // Case-insensitive search
            console.log(`[BACKEND billController] Filtering by meterId: ${req.query.meterId}`);
        }

        // Date range filtering for periodEnd
        if (req.query.periodEndFrom && req.query.periodEndTo) {
            query.periodEnd = {
                $gte: new Date(req.query.periodEndFrom),
                $lte: new Date(req.query.periodEndTo)
            };
            console.log(`[BACKEND billController] Filtering by periodEnd date range: ${req.query.periodEndFrom} to ${req.query.periodEndTo}`);
        }

        const startIndex = (page - 1) * limit;

        console.log(`[BACKEND billController] Mongoose find with query: ${JSON.stringify(query)}, sort: {${sortField}: ${sortOrder}}, skip: ${startIndex}, limit: ${limit}`);

        const totalBillsMatchingQuery = await Bill.countDocuments(query);
        const bills = await Bill.find(query)
            .populate('user', 'name email userId')
            .populate('device', 'meterId')
            .sort({ [sortField]: sortOrder })
            .skip(startIndex)
            .limit(limit);

        console.log(`[BACKEND billController] Found ${bills.length} bills for this page. Total matching query: ${totalBillsMatchingQuery}`);

        res.setHeader('X-Total-Count', totalBillsMatchingQuery);
        res.status(200).json({ bills, totalBills: totalBillsMatchingQuery, currentPage: page, totalPages: Math.ceil(totalBillsMatchingQuery / limit) });

    } catch (error) {
        console.error('Error fetching all bills:', error.message);
        res.status(500).json({ msg: 'Server Error fetching bills' });
    }
};

// @desc    Get a single bill by ID
const getBillById = async (req, res) => {
    console.log(`[billController] getBillById called for ID: ${req.params.id}`);
    try {
        const bill = await Bill.findById(req.params.id)
            .populate('user', 'name email userId')
            .populate('device', 'meterId status location');

        if (!bill) {
            return res.status(404).json({ msg: 'Bill not found' });
        }

        // Authorization: Admin can see any bill. Customer can only see their own.
        if (req.user.role === 'customer' && bill.user._id.toString() !== req.user.id) {
            console.warn(`[billController] Unauthorized attempt by customer ${req.user.id} to access bill ${bill._id}`);
            return res.status(403).json({ msg: 'Not authorized to view this bill' });
        }

        res.json(bill);
    } catch (error) {
        console.error('Error fetching bill by ID:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Bill not found (invalid ID format)' });
        }
        res.status(500).json({ msg: 'Server Error fetching bill' });
    }
};

// @desc    Update bill status
const updateBillStatus = async (req, res) => {
    console.log(`[billController] updateBillStatus called for ID: ${req.params.id}. Body:`, req.body);
    const { status, paymentDate } = req.body;

    if (!status || !['unpaid', 'paid', 'overdue'].includes(status)) {
        return res.status(400).json({ msg: 'Invalid status provided.' });
    }

    try {
        const bill = await Bill.findById(req.params.id);
        if (!bill) {
            return res.status(404).json({ msg: 'Bill not found' });
        }

        bill.status = status;
        if (status === 'paid' && paymentDate) {
            bill.paymentDate = new Date(paymentDate);
        } else if (status !== 'paid') {
            bill.paymentDate = null; // Clear payment date if not paid
        }

        const updatedBill = await bill.save();
        res.json(updatedBill);
    } catch (error) {
        console.error('Error updating bill status:', error.message);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ msg: 'Server Error updating bill status' });
    }
};

// @desc    Update a full bill (Admin)
const updateBill = async (req, res) => {
    console.log(`[billController] updateBill called for ID: ${req.params.id}. Body:`, req.body);
    // Add more specific validation for fields being updated if necessary.
    // For example, if readings or rate change, consumption and amountDue should be recalculated.
    try {
        const updatedBill = await Bill.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!updatedBill) {
            return res.status(404).json({ msg: 'Bill not found for update' });
        }
        res.json(updatedBill);
    } catch (error) {
        console.error('Error updating bill:', error.message);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ msg: 'Server Error updating bill' });
    }
};
// --- Exports ---
// This is likely around your line 64
module.exports = {
    createBill,
    getBillsForUser,   // <<<<< `getBillsForUser` is used here
    getAllBills,
    getBillById,
    updateBillStatus,
    updateBill // Export the new function
    // Any other functions you want to export
};