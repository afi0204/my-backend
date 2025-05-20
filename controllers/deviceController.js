// backend/controllers/deviceController.js
const Device = require('../models/Device');
const User = require('../models/User'); // If assigning device to user on creation

// @desc    Create a new device (by admin)
// @route   POST /api/devices
// @access  Private/Admin
const createDevice = async (req, res) => {
    const {
        meterId, devicePassword, status, serverAddress, digits, location, assignedToUser, notes
    } = req.body;

    try {
        let device = await Device.findOne({ meterId });
        if (device) {
            return res.status(400).json({ msg: 'Device with this Meter ID already exists' });
        }

        device = new Device({
            meterId,
            devicePassword, // Technician sets this during initialization via SMS
            status: status || 'uninitialized',
            serverAddress,
            digits,
            location,
            assignedToUser: assignedToUser || null,
            notes
        });

        await device.save();
        res.status(201).json(device);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ msg: 'Server Error creating device' });
    }
};

// @desc    Get all devices
// @route   GET /api/devices
// @access  Private/Admin or Private/Technician
const getAllDevices = async (req, res) => {
    try {
        const devices = await Device.find().populate('assignedToUser', 'name email');
        res.json(devices);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ msg: 'Server Error fetching devices' });
    }
};

// @desc    Get devices for technician home screen (Meter ID, Status, Battery, Volume, Network)
// @route   GET /api/devices/technician/home
// @access  Private/Technician or Private/Admin
const getTechnicianDevices = async (req, res) => {
    try {
        // For now, technicians see all devices.
        // If technicians were assigned to specific devices/areas, you'd filter here.
        const devices = await Device.find({})
            .select('meterId status batteryVoltage currentVolume networkStrength lastSeen')
            .sort({ lastSeen: -1 }); // Sort by most recently updated or seen
        res.json(devices);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ msg: 'Server Error fetching technician devices' });
    }
};


// @desc    Get device by ID
// @route   GET /api/devices/:id (MongoDB _id)
// @access  Private/Admin or Private/Technician
const getDeviceById = async (req, res) => {
    try {
        const device = await Device.findById(req.params.id).populate('assignedToUser', 'name email');
        if (!device) {
            return res.status(404).json({ msg: 'Device not found' });
        }
        res.json(device);
    } catch (error) {
        console.error(error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Device not found (invalid ID format)' });
        }
        res.status(500).json({ msg: 'Server Error fetching device' });
    }
};

// @desc    Update device (by admin - e.g., assign to user, add notes)
// @route   PUT /api/devices/:id
// @access  Private/Admin
const updateDevice = async (req, res) => {
    // Admin can update fields like assignedToUser, notes, location
    // Fields like batteryVoltage, currentVolume, networkStrength are typically updated by the device itself or via SMS commands.
    const { status, location, assignedToUser, notes, devicePassword } = req.body;

    const updateFields = {};
    if (status) updateFields.status = status;
    if (location) updateFields.location = location;
    if (assignedToUser !== undefined) updateFields.assignedToUser = assignedToUser; // Allow unassigning
    if (notes) updateFields.notes = notes;
    if (devicePassword) updateFields.devicePassword = devicePassword; // Admin can override/reset device password

    try {
        let device = await Device.findById(req.params.id);
        if (!device) {
            return res.status(404).json({ msg: 'Device not found' });
        }

        // If assigning to a user, ensure the user exists and is a customer
        if (assignedToUser) {
            const user = await User.findById(assignedToUser);
            if (!user || user.role !== 'customer') {
                return res.status(400).json({ msg: 'Invalid customer ID for assignment.' });
            }
            // Also, update the user's assignedDevices array
            await User.findByIdAndUpdate(assignedToUser, { $addToSet: { assignedDevices: device._id } });
        } else if (assignedToUser === null && device.assignedToUser) {
            // If unassigning, remove from the previous user's assignedDevices
            await User.findByIdAndUpdate(device.assignedToUser, { $pull: { assignedDevices: device._id } });
        }


        device = await Device.findByIdAndUpdate(
            req.params.id,
            { $set: updateFields },
            { new: true, runValidators: true }
        ).populate('assignedToUser', 'name email');

        res.json(device);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ msg: 'Server Error updating device' });
    }
};

// @desc    Delete device
// @route   DELETE /api/devices/:id
// @access  Private/Admin
const deleteDevice = async (req, res) => {
    try {
        const device = await Device.findById(req.params.id);
        if (!device) {
            return res.status(404).json({ msg: 'Device not found' });
        }

        // Pre-deletion logic: unassign from user, remove related bills?
        if (device.assignedToUser) {
            await User.findByIdAndUpdate(device.assignedToUser, { $pull: { assignedDevices: device._id } });
        }
        // Consider implications for bills, usage data, etc. Soft delete might be better.
        // For now, hard delete:
        await Device.findByIdAndRemove(req.params.id);

        res.json({ msg: 'Device removed' });
    } catch (error) {
        console.error(error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Device not found (invalid ID format)' });
        }
        res.status(500).json({ msg: 'Server Error deleting device' });
    }
};

module.exports = {
    createDevice,
    getAllDevices,
    getTechnicianDevices,
    getDeviceById,
    updateDevice,
    deleteDevice,
};