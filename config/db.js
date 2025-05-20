// backend/config/db.js

const mongoose = require('mongoose');
require('dotenv').config(); // Ensure this is at the top if you use process.env directly here

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // Mongoose 6 always behaves as if `useCreateIndex` is true and `useFindAndModify` is false, so they are no longer needed.
    });
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error('MongoDB Connection Error:', err.message);
    // Exit process with failure
    process.exit(1);
  }
};

module.exports = connectDB;