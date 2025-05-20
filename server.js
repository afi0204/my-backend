// backend/server.js

require('dotenv').config(); // Load environment variables
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// Connect to Database
connectDB();

const app = express();

// Init Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json({ extended: false })); // For JSON payloads
app.use(express.text()); // <<< ADD THIS to handle plain text bodies
app.use(express.urlencoded({ extended: true }));

// Define a simple root route
app.get('/', (req, res) => res.send('Digital Water Meter API Running'));

// Define Routes (We'll create these files next)
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/devices', require('./routes/deviceRoutes'));
app.use('/api/bills', require('./routes/billRoutes'));
app.use('/api/sms', require('./routes/smsRoutes')); // For technician app's simulated SMS
app.use('/api/meter-data', require('./routes/meterDataRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));