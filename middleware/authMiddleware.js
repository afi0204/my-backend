// backend/middleware/authMiddleware.js

const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password'); // Attach user to request, exclude password

      if (!req.user) {
        return res.status(401).json({ msg: 'Not authorized, user not found' });
      }
      next();
    } catch (error) {
      console.error('Token verification failed:', error.message);
      res.status(401).json({ msg: 'Not authorized, token failed' });
    }
  } else {
    // This else block handles the case where the Authorization header is missing or not in Bearer format
    // The 'if (!token)' check inside the try block is effectively covered by this structure.
    return res.status(401).json({ msg: 'Not authorized, no token provided or invalid format' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ msg: 'User role not authorized' });
    }
    next();
  };
};

module.exports = { protect, authorize };