// backend/controllers/userController.js
const User = require('../models/User');
const Device = require('../models/Device'); // Import Device model
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const createUser = async (req, res) => {
    const { name, email, password, role, assignedDevices } = req.body;
    console.log('[userController] createUser called. Request body:', req.body);

    try {
        const lowercasedEmail = email.toLowerCase().trim();
        let existingUser = await User.findOne({ email: lowercasedEmail });
        if (existingUser) {
            return res.status(400).json({ msg: 'User already exists with this email' });
        }

        const user = new User({
            name,
            email,
            role,
            password, // Will be hashed
            // Ensure assignedDevices is an array of valid ObjectIds if provided
            assignedDevices: (role === 'customer' && Array.isArray(assignedDevices)) ? assignedDevices.filter(id => mongoose.Types.ObjectId.isValid(id)) : []
        });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();

        // If devices are assigned, update their assignedToUser field
        if (user.role === 'customer' && user.assignedDevices && user.assignedDevices.length > 0) {
            console.log(`[userController] Assigning devices ${user.assignedDevices.join(', ')} to new user ${user._id}`);
            await Device.updateMany(
                { _id: { $in: user.assignedDevices } },
                { $set: { assignedToUser: user._id } }
            );
        }

        const userResponse = user.toObject();
        delete userResponse.password;

        // Populate assigned devices for the response
        const populatedUser = await User.findById(user._id).select('-password').populate('assignedDevices', 'meterId status');

        res.status(201).json(populatedUser || userResponse);
    } catch (error) {
        console.error('[userController] Error creating user:', error.message, error.stack);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ msg: 'Server Error creating user' });
    }
};

// @desc    Get all users with pagination and sorting
// @route   GET /api/users
// @access  Private/Admin
const getAllUsers = async (req, res) => {
    console.log('--- [BACKEND userController] getAllUsers: Handler called ---');
    console.log('[BACKEND userController] getAllUsers: Request query:', req.query);

    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const sortField = req.query.sort || 'name';
        const sortOrder = req.query.order === 'desc' ? -1 : 1;

        const query = {};
        // Optional: Add filtering by role if query param 'role' is present
        if (req.query.role) {
            query.role = req.query.role;
            console.log(`[BACKEND userController] getAllUsers: Filtering by role: ${req.query.role}`);
        }
        // Optional: Add filtering by search term if query param 'search' is present
        if (req.query.search) {
            // Example: basic case-insensitive search on name or email
            const searchRegex = new RegExp(req.query.search, 'i');
            query.$or = [{ name: searchRegex }, { email: searchRegex }];
            console.log(`[BACKEND userController] getAllUsers: Filtering by search term: ${req.query.search}`);
        }


        const startIndex = (page - 1) * limit;

        console.log(`[BACKEND userController] getAllUsers: Mongoose find with query: ${JSON.stringify(query)}, sort: {${sortField}: ${sortOrder}}, skip: ${startIndex}, limit: ${limit}`);

        // Get total count of documents matching the query (for pagination)
        const totalUsers = await User.countDocuments(query);

        // Fetch users with pagination and sorting
        const users = await User.find(query)
             .select('-password') // Exclude password field
            .sort({ [sortField]: sortOrder }) // Apply sorting
            .skip(startIndex) // Apply pagination skip
            .limit(limit) // Apply pagination limit
             // Populate assignedDevices if needed, selecting specific fields
            .populate('assignedDevices', 'meterId status');

        console.log(`[BACKEND userController] getAllUsers: Found ${users.length} users for this page. Total matching query: ${totalUsers}`);

        // Set the X-Total-Count header for frontend pagination
        res.setHeader('X-Total-Count', totalUsers);
        // Send the paginated users and the total count in the response body
        res.status(200).json({ users, totalUsers });
    } catch (error) {
         console.error('--- [BACKEND userController] getAllUsers: ERROR ---', error);
         res.status(500).json({ msg: 'Server Error fetching users', errorDetails: error.message });
    }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password').populate('assignedDevices', 'meterId status');
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error(error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'User not found (invalid ID format)' });
        }
        res.status(500).json({ msg: 'Server Error fetching user' });
    }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
    console.log(`[userController] updateUser called for ID: ${req.params.id}. Body:`, req.body);
    const { name, email, role, password } = req.body;
    // Ensure assignedDevices is treated as an array, even if undefined or null from frontend
    const newAssignedDeviceIds = (role === 'customer' && Array.isArray(req.body.assignedDevices))
        ? req.body.assignedDevices.filter(id => mongoose.Types.ObjectId.isValid(id))
        : [];

    try {
        let user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        const originalAssignedDeviceIds = user.assignedDevices.map(id => id.toString());

        if (email && email !== user.email) {
            const lowercasedEmail = email.toLowerCase().trim();
            const existingUser = await User.findOne({ email: lowercasedEmail });
            if (existingUser && existingUser._id.toString() !== user._id.toString()) {
                return res.status(400).json({ msg: 'Email already in use by another account' });
            }
            user.email = lowercasedEmail;
        }

        if (name) user.name = name;
        if (role) user.role = role;

        if (password) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, salt);
        }

        // Handle device assignment changes
        if (user.role === 'customer') {
            const devicesToAdd = newAssignedDeviceIds.filter(id => !originalAssignedDeviceIds.includes(id));
            const devicesToRemove = originalAssignedDeviceIds.filter(id => !newAssignedDeviceIds.includes(id));

            if (devicesToRemove.length > 0) {
                console.log(`[userController] Unassigning devices ${devicesToRemove.join(', ')} from user ${user._id}`);
                await Device.updateMany(
                    { _id: { $in: devicesToRemove }, assignedToUser: user._id }, // Ensure we only unassign if currently assigned to this user
                    { $set: { assignedToUser: null } }
                );
            }

            if (devicesToAdd.length > 0) {
                console.log(`[userController] Assigning devices ${devicesToAdd.join(', ')} to user ${user._id}`);
                // First, unassign these devices from any other user they might be currently assigned to
                await Device.updateMany(
                    { _id: { $in: devicesToAdd }, assignedToUser: { $ne: null, $ne: user._id } },
                    { $set: { assignedToUser: null } }
                );
                // Then, assign them to the current user
                await Device.updateMany(
                    { _id: { $in: devicesToAdd } },
                    { $set: { assignedToUser: user._id } }
                );
            }
            user.assignedDevices = newAssignedDeviceIds;
        } else {
            // If role is not customer, unassign all currently assigned devices
            if (originalAssignedDeviceIds.length > 0) {
                console.log(`[userController] Role changed from customer. Unassigning devices ${originalAssignedDeviceIds.join(', ')} from user ${user._id}`);
                await Device.updateMany(
                    { _id: { $in: originalAssignedDeviceIds }, assignedToUser: user._id },
                    { $set: { assignedToUser: null } }
                );
            }
            user.assignedDevices = [];
        }

        const updatedUser = await user.save();
        const populatedUser = await User.findById(updatedUser._id).select('-password').populate('assignedDevices', 'meterId status');

        res.json(populatedUser || updatedUser.toObject({ transform: (doc, ret) => { delete ret.password; return ret; }}));
    } catch (error) {
        console.error('[userController] Error updating user:', error.message, error.stack);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ msg: 'Server Error updating user' });
    }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // If the user is a customer and has assigned devices, unassign them
        if (user.role === 'customer' && user.assignedDevices && user.assignedDevices.length > 0) {
            console.log(`[userController] Unassigning devices from user ${user._id} before deletion.`);
            await Device.updateMany(
                { _id: { $in: user.assignedDevices }, assignedToUser: user._id },
                { $set: { assignedToUser: null } }
            );
        }

        await User.findByIdAndRemove(req.params.id);

        res.json({ msg: 'User removed' });
    } catch (error) {
        console.error(error.message);
        if (error.kind === 'ObjectId' || error.name === 'CastError') {
            return res.status(404).json({ msg: 'User not found (invalid ID format)' });
        }
        res.status(500).json({ msg: 'Server Error deleting user' });
    }
};

module.exports = {
    createUser,
    getAllUsers, // Export the paginated version
    getUserById,
    updateUser,
    deleteUser
};
