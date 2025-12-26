import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from './models.js';

dotenv.config();

const app = express();
// Use environment PORT for Railway, fallback to 5000 for local
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'injazi-secret';

// --- CORS Configuration ---
// Allow frontend origin (update after Vercel deployment)
const allowedOrigins = process.env.FRONTEND_URL 
  ? [process.env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173']
  : ['*'];

app.use(cors({ 
  origin: allowedOrigins,
  credentials: true 
}));

app.use(express.json({ limit: '50mb' }));

// --- DATABASE ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

const generateToken = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });

// --- HEALTH CHECK ROUTE ---
app.get('/', (req, res) => {
  res.json({ 
    message: 'InJazi API is running!',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// --- AUTH ROUTE ---
app.post('/api/auth', async (req, res) => {
  console.log("📥 Login Request:", req.body.email);
  const { email, password, name, country, isRegister } = req.body;

  try {
    let user = await User.findOne({ email });

    if (isRegister) {
      if (user) return res.status(400).json({ message: 'User already exists' });
      const hashedPassword = await bcrypt.hash(password, 10);
      user = new User({ email, password: hashedPassword, name, country });
      await user.save();
      console.log("✅ New User Created:", email);
    } else {
      if (!user) return res.status(404).json({ message: 'User not found' });
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);
    const userData = user.toObject();
    delete userData.password;
    res.json({ user: userData, token });

  } catch (error) {
    console.error('Auth Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- SYNC ROUTE ---
app.post('/api/sync', async (req, res) => {
  const { email, ...updates } = req.body;
  if (!email) return res.status(400).json({ message: 'No email provided' });
  try {
    await User.findOneAndUpdate({ email }, { $set: updates }, { new: true });
    res.json({ success: true });
  } catch (error) {
    console.error('Sync Error:', error);
    res.status(500).json({ message: 'Sync failed' });
  }
});

// --- ERROR HANDLING ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

// --- START SERVER ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
