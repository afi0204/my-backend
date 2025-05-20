// backend/controllers/authController.js

const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config(); // Ensures JWT_SECRET is loaded

// Generate JWT
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '30d', // Token expires in 30 days
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public (can be restricted later, e.g., by admin for certain roles)
const registerUser = async (req, res) => {
  const { name, password, role } = req.body;
  let { email } = req.body; // Make email mutable for lowercase conversion

  // Basic validation
  if (!name || !email || !password) {
    return res.status(400).json({ msg: 'Please enter all fields: name, email, and password' });
  }

  email = email.toLowerCase().trim(); // Convert to lowercase and trim whitespace

  // Validate email format (simple regex, consider a library for production)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
      return res.status(400).json({ msg: 'Please enter a valid email address' });
  }

  // Validate password length (example)
  if (password.length < 6) {
      return res.status(400).json({ msg: 'Password must be at least 6 characters long' });
  }


  try {
    // Check if user already exists with this email
    let user = await User.findOne({ email }); // Query with lowercase email
    if (user) {
      return res.status(400).json({ msg: 'User already exists with this email' });
    }

    // Create new user instance
    user = new User({
      name,
      email, // Stored as lowercase due to schema and this conversion
      password, // Will be hashed below
      role: role || 'customer', // Default role to customer if not provided
    });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Save the user to the database
    await user.save();

    // Respond with user data and token (excluding password)
    res.status(201).json({
      _id: user.id, // MongoDB's default _id
      userId: user.userId, // Custom user ID from schema
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id, user.role),
    });

  } catch (err) {
    console.error('Registration Error:', err.message);
    // Check for MongoDB unique index violation (code 11000) more specifically
    if (err.code === 11000 && err.keyPattern && err.keyPattern.email) {
        return res.status(400).json({ msg: 'User already exists with this email (database constraint).' });
    }
    res.status(500).send('Server error during registration');
  }
};

// @desc    Authenticate user & get token (Login)
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const { password } = req.body;
  let { email } = req.body; // Make email mutable

  // Check if email is provided
  if (!email) {
    return res.status(400).json({ msg: 'Email is required for login' });
  }
  email = email.toLowerCase().trim(); // Convert to lowercase and trim whitespace

  if (!password) {
    return res.status(400).json({ msg: 'Password is required for login' });
  }

  try {
    // Check for user by email
    const user = await User.findOne({ email }); // Query with lowercase email
    if (!user) {
      // Generic message for security (don't reveal if email exists or not)
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Check if password matches
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Generic message for security
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // User authenticated, respond with user data and token
    res.json({
      _id: user.id,
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id, user.role),
    });

  } catch (err) {
    console.error('Login Error:', err.message);
    res.status(500).send('Server error during login');
  }
};

// @desc    Get current logged-in user details
// @route   GET /api/auth/me
// @access  Private (requires token)
const getMe = async (req, res) => {
  // req.user is attached by the 'protect' middleware
  if (!req.user) {
    // This case should ideally be caught by the protect middleware itself,
    // but as a safeguard:
    return res.status(401).json({ msg: 'Not authorized, user data unavailable' });
  }

  try {
    // Optionally, you could re-fetch the user from DB if you want the absolute latest data,
    // but req.user (populated by middleware without password) is usually sufficient.
    // const user = await User.findById(req.user.id).select('-password');
    // if (!user) {
    //   return res.status(404).json({ msg: 'User not found' });
    // }

    res.json({
      _id: req.user.id,
      userId: req.user.userId,
      name: req.user.name,
      email: req.user.email, // Already lowercase from req.user
      role: req.user.role,
      assignedDevices: req.user.assignedDevices // If populated by middleware or needed here
    });
  } catch (error) {
      console.error('GetMe Error:', error.message);
      res.status(500).send('Server error fetching user details');
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
};