// backend/controllers/deviceController.js
const Device = require('../models/Device');
const User = require('../models/User'); // Assuming User model might be needed for operations like assign/unassign
const { processSimulatedSms } = require('../services/smsService'); // Import the SMS processing service
const SMSLog = require('../models/SMSLog'); // Though smsService handles logging, good to have if direct logging is ever needed here

// --- Function Definitions ---

// @desc    Create a new device (by admin)
// @route   POST /api/devices
// @access  Private/Admin
const createDevice = async (req, res) => {
    console.log('[deviceController] createDevice called. Request body:', req.body);
    const {
        meterId,
        status, // e.g., 'uninitialized', 'active', 'inactive', 'maintenance'
        location, // e.g., { address: '123 Main St', coordinates: { lat: 0, lon: 0 } }
        notes,
        assignedToUser, // Optional: _id of the user this device is assigned to
        // Add other fields from your Device model as needed
        // devicePassword, serverAddress, digits are often set via SMS/technician later
    } = req.body;

    if (!meterId) {
        return res.status(400).json({ msg: 'Meter ID is required' });
    }

    try {
        let device = await Device.findOne({ meterId });
        if (device) {
            return res.status(400).json({ msg: 'Device with this Meter ID already exists' });
        }

        device = new Device({
            meterId,
            status: status || 'uninitialized', // Default status
            location,
            notes,
            assignedToUser: assignedToUser || null
        });
        const savedDevice = await device.save();

        // Populate assignedToUser before sending the response
        const populatedDevice = await Device.findById(savedDevice._id).populate('assignedToUser', 'name email userId');
        res.status(201).json(populatedDevice || savedDevice);
    } catch (error) {
        console.error('Error creating device:', error.message);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ msg: 'Server Error creating device' });
    }
};

// @desc    Get all devices with pagination and sorting
// @route   GET /api/devices
// @access  Private/Admin
const getAllDevices = async (req, res) => {
    console.log('--- [BACKEND deviceController] getAllDevices: Handler called ---');
    console.log('[BACKEND deviceController] getAllDevices: Request query:', req.query);

    const RECENT_DEVICES_COUNT = 20; // Default count for recent items view

    try {
        // Check if any common pagination/filtering query parameters are present
        const hasQueryParams = req.query.page || req.query.limit || req.query.sort || req.query.status || req.query.search || req.query.assignedToUser;

        if (!hasQueryParams) {
            // --- Fetch Recent Devices Logic ---
            console.log('[BACKEND deviceController] No specific query params, fetching recent devices.');
            const devices = await Device.find({})
                .populate('assignedToUser', 'name email userId')
                .sort({ lastSeen: -1, createdAt: -1 }) // Sort by most recently seen, then by creation
                .limit(RECENT_DEVICES_COUNT);

            const totalDevicesInSystem = await Device.countDocuments({}); // Optional: total count in the system

            // For recent items, totalDevices is the count of items returned in this "recent" list
            return res.json({
                devices,
                totalDevices: devices.length,
                totalDevicesInSystem
            });
        } else {
            // --- Full Pagination and Filtering Logic ---
            console.log('[BACKEND deviceController] Query params present, using full pagination/filtering.');
            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 10;
            const sortField = req.query.sort || 'createdAt'; // Default sort field
            const sortOrder = req.query.order === 'desc' ? -1 : 1;

            const query = {};
            if (req.query.status) {
                query.status = req.query.status;
                console.log(`[BACKEND deviceController] Filtering by status: ${req.query.status}`);
            }
            if (req.query.assignedToUser) {
                query.assignedToUser = req.query.assignedToUser;
                console.log(`[BACKEND deviceController] Filtering by assigned user: ${req.query.assignedToUser}`);
            }
            if (req.query.search) {
                const searchRegex = new RegExp(req.query.search, 'i');
                query.$or = [{ meterId: searchRegex }, { notes: searchRegex }]; // Example search fields
                console.log(`[BACKEND deviceController] Filtering by search term: ${req.query.search}`);
            }

            const startIndex = (page - 1) * limit;
            console.log(`[BACKEND deviceController] Mongoose find with query: ${JSON.stringify(query)}, sort: {${sortField}: ${sortOrder}}, skip: ${startIndex}, limit: ${limit}`);

            const totalDevicesMatchingQuery = await Device.countDocuments(query);
            const devices = await Device.find(query)
                .populate('assignedToUser', 'name email userId')
                .sort({ [sortField]: sortOrder })
                .skip(startIndex)
                .limit(limit);

            console.log(`[BACKEND deviceController] Found ${devices.length} devices for this page. Total matching query: ${totalDevicesMatchingQuery}`);

            res.setHeader('X-Total-Count', totalDevicesMatchingQuery); // For frontend pagination
            res.status(200).json({ devices, totalDevices: totalDevicesMatchingQuery });
        }
    } catch (error) {
        console.error('--- [BACKEND deviceController] getAllDevices: ERROR ---', error);
        res.status(500).json({ msg: 'Server Error fetching devices', errorDetails: error.message });
    }
};


// @desc    Get device by ID
// @route   GET /api/devices/:id
// @access  Private/Admin
const getDeviceById = async (req, res) => {
    console.log(`[deviceController] getDeviceById called for ID: ${req.params.id}`);
    try {
        const device = await Device.findById(req.params.id)
            .populate('assignedToUser', 'name email userId'); // Populate user details if assigned

        if (!device) {
            return res.status(404).json({ msg: 'Device not found' });
        }
        res.json(device);
    } catch (error) {
        console.error('Error fetching device by ID:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Device not found (invalid ID format)' });
        }
        res.status(500).json({ msg: 'Server Error fetching device' });
    }
};

// @desc    Update device
// @route   PUT /api/devices/:id
// @access  Private/Admin
const updateDevice = async (req, res) => {
    console.log(`[deviceController] updateDevice called for ID: ${req.params.id}.`);
    console.log('[deviceController] Full Request Body:', JSON.stringify(req.body, null, 2));
    const {
        meterId,
        status,
        location,
        notes,
        assignedToUser, // Can be a user's _id or null/empty string to unassign
        devicePassword,
        // serverAddress is already in your Device model, ensure it's handled
        serverAddress, // Added here to be explicit if sent for general update
        digits,
        currentVolume,
        initializationVolume,
        batteryVoltage,
        networkStrength,
        deviceOffPeriod,
        deviceOnPeriod,
        // Device Internals
        firmwareVersion,
        iccid,
        imei,
        imsi,
        cellId,
    } = req.body;

    console.log('[deviceController] Destructured Internals from req.body:');
    console.log('  req.body.firmwareVersion:', req.body.firmwareVersion);
    console.log('  req.body.iccid:', req.body.iccid);
    console.log('  req.body.imei:', req.body.imei);
    console.log('  req.body.imsi:', req.body.imsi);
    console.log('  req.body.cellId:', req.body.cellId);
    console.log('  req.body.serverAddress (for internals update):', req.body.serverAddress);

    try {
        let device = await Device.findById(req.params.id);

        if (!device) {
            return res.status(404).json({ msg: 'Device not found' });
        }

        console.log('[deviceController] Device found. Current values before update:');
        console.log(`  MeterID: ${device.meterId}, Status: ${device.status}, ServerAddress: ${device.serverAddress}`);
        console.log(`  FW: ${device.firmwareVersion}, ICCID: ${device.iccid}, IMEI: ${device.imei}, IMSI: ${device.imsi}, CellID: ${device.cellId}`);

        const originalAssignedUserId = device.assignedToUser ? device.assignedToUser.toString() : null;

        // Update fields if they are provided in the request body and are different
        if (meterId !== undefined && meterId !== device.meterId) { // Check for undefined to allow empty string
            const existingDeviceWithNewMeterId = await Device.findOne({ meterId });
            if (existingDeviceWithNewMeterId && existingDeviceWithNewMeterId._id.toString() !== device._id.toString()) {
                return res.status(400).json({ msg: 'Another device with this Meter ID already exists' });
            }
            device.meterId = meterId;
        }
        if (status !== undefined) device.status = status;
        if (location !== undefined) device.location = location;
        if (notes !== undefined) device.notes = notes;
        if (devicePassword !== undefined) device.devicePassword = devicePassword;

        // If serverAddress is part of the req.body (e.g. from internals update), update it.
        // The destructured `serverAddress` will pick this up if the key exists in req.body.
        if (req.body.serverAddress !== undefined) {
            console.log(`[deviceController] Updating serverAddress from '${device.serverAddress}' to '${req.body.serverAddress}'`);
            device.serverAddress = req.body.serverAddress;
        }

        if (digits !== undefined) device.digits = digits;

        // Update other fields if provided
        if (currentVolume !== undefined) device.currentVolume = currentVolume;
        if (initializationVolume !== undefined) device.initializationVolume = initializationVolume;
        if (batteryVoltage !== undefined) device.batteryVoltage = batteryVoltage;
        if (networkStrength !== undefined) device.networkStrength = networkStrength;
        if (deviceOffPeriod !== undefined) device.deviceOffPeriod = deviceOffPeriod;
        if (deviceOnPeriod !== undefined) device.deviceOnPeriod = deviceOnPeriod;

        // Update device internals if provided
        // Use req.body.fieldName to be explicit for these, as they come from the internals update payload
        if (req.body.firmwareVersion !== undefined) {
            console.log(`[deviceController] Updating firmwareVersion from '${device.firmwareVersion}' to '${req.body.firmwareVersion}'`);
            device.firmwareVersion = req.body.firmwareVersion;
        }
        if (req.body.iccid !== undefined) {
            console.log(`[deviceController] Updating iccid from '${device.iccid}' to '${req.body.iccid}'`);
            device.iccid = req.body.iccid;
        }
        if (req.body.imei !== undefined) {
            console.log(`[deviceController] Updating imei from '${device.imei}' to '${req.body.imei}'`);
            device.imei = req.body.imei;
        }
        if (req.body.imsi !== undefined) {
            console.log(`[deviceController] Updating imsi from '${device.imsi}' to '${req.body.imsi}'`);
            device.imsi = req.body.imsi;
        }
        if (req.body.cellId !== undefined) {
            console.log(`[deviceController] Updating cellId from '${device.cellId}' to '${req.body.cellId}'`);
            device.cellId = req.body.cellId;
        }


        // Handle assignedToUser change
        // Determine the new assigned user ID (null if unassigning or not provided)
        const newAssignedUserId = assignedToUser === undefined ? originalAssignedUserId : (assignedToUser || null);

        // Only perform assignment/unassignment logic if the assigned user ID has actually changed
        if (newAssignedUserId !== originalAssignedUserId) {
            // If the device was previously assigned, remove it from the old user's assignedDevices array
            if (originalAssignedUserId) {
                console.log(`[deviceController] Unassigning device ${device._id} from user ${originalAssignedUserId}`);
                await User.findByIdAndUpdate(originalAssignedUserId, { $pull: { assignedDevices: device._id } });
            }

            // If the device is being assigned to a new user, add it to the new user's assignedDevices array
            if (newAssignedUserId) {
                console.log(`[deviceController] Attempting to assign device ${device._id} to user ${newAssignedUserId}`);
                const userToAssign = await User.findById(newAssignedUserId);
                // Check if the user exists and has the 'customer' role before assigning
                if (!userToAssign || userToAssign.role !== 'customer') {
                    console.warn(`[deviceController] Attempted to assign device to non-customer or invalid user ID: ${newAssignedUserId}. Assignment failed.`);
                    // Decide how to handle this: either keep the original assignment, set to null, or return an error
                    // For now, let's set it to null if the target user is invalid
                    device.assignedToUser = null;
                    // Optionally, notify the frontend that the assignment failed
                    // res.status(400).json({ msg: 'Cannot assign device to a non-customer or invalid user.' }); return;
                } else {
                    console.log(`[deviceController] Assigning device ${device._id} to user ${newAssignedUserId}`);
                    await User.findByIdAndUpdate(newAssignedUserId, { $addToSet: { assignedDevices: device._id } });
                    device.assignedToUser = newAssignedUserId;
                }
            } else {
                // If assignedToUser is explicitly set to null or empty string, unassign the device
                console.log(`[deviceController] Unassigning device ${device._id}`);
                device.assignedToUser = null;
            }
        }

        // Save the updated device
        console.log('[deviceController] Device object before save:', JSON.stringify(device.toObject(), null, 2));
        const updatedDevice = await device.save();
        console.log('[deviceController] Device saved. Result after save:', JSON.stringify(updatedDevice.toObject(), null, 2));

        // Populate the assigned user details before sending the response
        const populatedDevice = await Device.findById(updatedDevice._id).populate('assignedToUser', 'name email userId');

        res.json(populatedDevice || updatedDevice); // Send the populated device if successful

    } catch (error) {
        console.error('Error updating device:', error.message, error.stack);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error', errors: error.errors });
        }
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Device not found (invalid ID format)' });
        }
        res.status(500).json({ msg: 'Server Error updating device' });
    }
};

// @desc    Delete device
// @route   DELETE /api/devices/:id
// @access  Private/Admin
const deleteDevice = async (req, res) => {
    console.log(`[deviceController] deleteDevice called for ID: ${req.params.id}`);
    try {
        // Find the device by ID
        const device = await Device.findById(req.params.id);

        // If device not found, return 404
        if (!device) {
            console.log(`[deviceController] Device not found for ID: ${req.params.id}`);
            return res.status(404).json({ msg: 'Device not found' });
        }

        // --- Pre-deletion logic ---
        // If the device is assigned to a user, unassign it before deleting the device
        if (device.assignedToUser) {
            console.log(`[deviceController] Unassigning device ${device._id} from user ${device.assignedToUser} before deletion.`);
            // Find the user and remove the device's ID from their assignedDevices array
            await User.findByIdAndUpdate(device.assignedToUser, { $pull: { assignedDevices: device._id } });
            console.log(`[deviceController] Device ${device._id} successfully unassigned from user ${device.assignedToUser}.`);
        }

        // Delete the device from the database
        await Device.findByIdAndDelete(req.params.id); // Or use findByIdAndRemove

        console.log(`[deviceController] Device ${req.params.id} successfully deleted.`);
        // Send a success response
        res.json({ msg: 'Device removed' });

    } catch (error) {
        console.error('[deviceController] Error deleting device:', error.message);
        // Handle invalid MongoDB ID format
        if (error.kind === 'ObjectId') {
            console.log(`[deviceController] Invalid ObjectId format for ID: ${req.params.id}`);
            return res.status(404).json({ msg: 'Device not found (invalid ID format)' });
        }
        // Handle other server errors
        res.status(500).json({ msg: 'Server Error deleting device', errorDetails: error.message });
    }
};

// @desc   Get devices assigned to the currently logged-in technician
// @route   GET /api/devices/technician
// @access  Private/Technician
const getTechnicianDevices = async (req, res) => {
    console.log(`[deviceController] getTechnicianDevices called for technician: ${req.user.id}`);
    try {
        // This assumes technicians are assigned devices directly via 'assignedToUser'
        // If technicians are assigned to areas or have a different assignment mechanism,
        // this query will need to be adjusted.

        // For simplicity, let's assume a technician might be a 'user' who can be assigned devices.
        // Or, if technicians don't get devices assigned directly but oversee all, this logic changes.
        // For now, let's fetch devices assigned to this user if they are a customer (as an example)
        // or all devices if they are an admin/technician with broader access.

        // A more typical scenario: Technicians might not have devices *assigned* to them in the same way
        // customers do. They might see all devices or devices in a specific region.
        // For now, let's return a list of all devices, similar to admin, but perhaps with fewer details
        // or specific sorting. This needs to be defined by your business logic for technicians.

        // As a placeholder, let's return all 'active' or 'maintenance' devices, sorted by lastSeen.
        const devices = await Device.find({ status: { $in: ['active', 'maintenance', 'uninitialized'] } })
            .populate('assignedToUser', 'name email') // Show who it's assigned to, if anyone
            .sort({ lastSeen: -1, meterId: 1 });

        res.json(devices);
    } catch (error) {
        console.error('Error fetching technician devices:', error.message);
        res.status(500).json({ msg: 'Server Error fetching technician devices' });
    }
};

// @desc    Receive data update from a device (simulating SMS or direct report)
// @route   POST /api/devices/data-update
// @access  Public or Protected (depending on your security model for device communication)
const handleDeviceDataUpdate = async (req, res) => {
    console.log('[deviceController] handleDeviceDataUpdate called. Body:', req.body);
    const {
        meterId,
        currentVolume,
        batteryVoltage,
        networkStrength,
        status // Optional: device might report its own status
    } = req.body;

    if (!meterId) {
        return res.status(400).json({ msg: 'Meter ID is required for data update.' });
    }

    try {
        const device = await Device.findOne({ meterId });

        if (!device) {
            console.warn(`[deviceController] Data update received for unknown meterId: ${meterId}`);
            return res.status(404).json({ msg: `Device with Meter ID ${meterId} not found.` });
        }

        // Update device fields
        if (currentVolume !== undefined) device.currentVolume = parseFloat(currentVolume);
        if (batteryVoltage !== undefined) device.batteryVoltage = batteryVoltage;
        if (networkStrength !== undefined) device.networkStrength = networkStrength;
        if (status) device.status = status; // Update status if provided
        else if (device.status === 'uninitialized' && (currentVolume !== undefined || batteryVoltage !== undefined)) device.status = 'active'; // Activate if it was uninitialized and sends data

        device.lastSeen = new Date(); // Update lastSeen timestamp

        // TODO: Optionally, create a new UsageReading record here

        const updatedDevice = await device.save();
        console.log(`[deviceController] Device ${meterId} updated successfully with new data.`);
        // Populate assignedToUser before sending the response
        const populatedDevice = await Device.findById(updatedDevice._id).populate('assignedToUser', 'name email userId');
        res.status(200).json({ msg: 'Device data updated successfully', device: populatedDevice || updatedDevice });

    } catch (error) {
        console.error(`[deviceController] Error processing device data update for ${meterId}:`, error.message);
        res.status(500).json({ msg: 'Server error processing device data update.' });
    }
};

// @desc    Handle simulated SMS commands
// @route   POST /api/devices/sms-command
// @access  Public or Protected (depending on configuration in routes)
const handleSmsCommand = async (req, res) => {
    const { rawCommand } = req.body;
    // Optional: If this route becomes protected and used by logged-in technicians,
    // you could extract the technician's ID:
    // const technicianUserId = req.user ? req.user.id : null;

    if (!rawCommand) {
        return res.status(400).json({ success: false, message: 'rawCommand is required in the request body.' });
    }

    try {
        // Pass null for technicianUserId if the command is from a device or an unauthenticated source.
        // If a technician sends this via an interface and the route is protected,
        // you could pass req.user.id (e.g., from authMiddleware).
        const result = await processSimulatedSms(rawCommand, null /* technicianUserId */);

        if (result.success) {
            res.status(200).json(result);
        } else {
            // smsService returns a comprehensive result. Determine status code based on message.
            const statusCode = result.message && (result.message.toLowerCase().includes("server error") || result.message.toLowerCase().includes("failed to log")) ? 500 : 400;
            res.status(statusCode).json(result);
        }
    } catch (error) {
        console.error('Error in handleSmsCommand controller:', error);
        res.status(500).json({ success: false, message: 'Internal server error processing SMS command.', error: error.message });
    }
};

// --- Export Functions ---
module.exports = {
    createDevice,
    getAllDevices, // Assuming this is the paginated version used by the list
    getDeviceById,
    updateDevice,
    deleteDevice, // Export the completed function
    getTechnicianDevices, // Export the new function
    handleDeviceDataUpdate, // Add the new function here
    handleSmsCommand // Export the new SMS command handler
};
