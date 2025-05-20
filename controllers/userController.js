// backend/controllers/userController.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// @desc    Create a new user (by admin)
// @route   POST /api/users
// @access  Private/Admin
const createUser = async (req, res) => {
    const { name, email, password, role, assignedDevices } = req.body;

    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User already exists with this email' });
        }

        user = new User({
            name,
            email,
            role,
            password, // Will be hashed
            assignedDevices: role === 'customer' ? assignedDevices : []
        });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();

        // Don't send password back
        const userResponse = user.toObject();
        delete userResponse.password;

        res.status(201).json(userResponse);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ msg: 'Server Error creating user' });
    }
};

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password').populate('assignedDevices', 'meterId status');
        res.json(users);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ msg: 'Server Error fetching users' });
    }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
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

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
    const { name, email, role, assignedDevices, password } = req.body;
    const updateFields = { name, email, role, assignedDevices };

    try {
        let user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // Check if email is being changed and if the new email already exists for another user
        if (email && email !== user.email) {
            const existingUser = await User.findOne({ email });
            if (existingUser && existingUser._id.toString() !== user._id.toString()) {
                return res.status(400).json({ msg: 'Email already in use by another account' });
            }
        }

        if (password) { // If password is being updated
            const salt = await bcrypt.genSalt(10);
            updateFields.password = await bcrypt.hash(password, salt);
        }

        user = await User.findByIdAndUpdate(
            req.params.id,
            { $set: updateFields },
            { new: true, runValidators: true }
        ).select('-password');

        res.json(user);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ msg: 'Server Error updating user' });
    }
};


// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // Add any pre-deletion logic here (e.g., unassign devices)
        if (user.role === 'customer' && user.assignedDevices && user.assignedDevices.length > 0) {
            // Example: Unassign devices or prevent deletion if devices are assigned
            // For now, we'll just remove the user
        }

        await User.findByIdAndRemove(req.params.id);

        res.json({ msg: 'User removed' });
    } catch (error) {
        console.error(error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'User not found (invalid ID format)' });
        }
        res.status(500).json({ msg: 'Server Error deleting user' });
    }
};

module.exports = {
    createUser,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser
};