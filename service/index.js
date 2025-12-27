import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from './models.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'injazi-secret';

// --- CORS Configuration ---
const allowedOrigins = [process.env.FRONTEND_URL, 'http://localhost:3000', 'https://injazi.vercel.app'].filter(Boolean);

app.use(cors({ 
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    console.warn(`❌ CORS blocked origin: ${origin}`);
    return callback(new Error('CORS policy: This origin is not allowed.'));
  },
  credentials: true
}));

app.options('*', cors());
app.use(express.json({ limit: '50mb' }));

// --- DATABASE ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

const generateToken = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });

// --- HEALTH CHECK ---
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

// --- IMPROVED SYNC ROUTE ---
app.post('/api/sync', async (req, res) => {
  const { email, ...updates } = req.body;
  
  if (!email) {
    return res.status(400).json({ message: 'No email provided' });
  }

  try {
    console.log("📥 Sync request for:", email);
    
    // Build the update object properly for nested fields
    const updateFields = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && value !== null) {
        updateFields[key] = value;
      }
    }

    // Log what we're saving (for debugging)
    if (updateFields.goal) {
      console.log("📚 Syncing goal with curriculum:", 
        updateFields.goal.savedCurriculum?.length || 0, "chapters");
    }

    const updatedUser = await User.findOneAndUpdate(
      { email },
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log("✅ Sync successful for:", email);
    res.json({ success: true, message: 'Data synced successfully' });

  } catch (error) {
    console.error('❌ Sync Error:', error);
    res.status(500).json({ message: 'Sync failed', error: error.message });
  }
});

// --- GET USER DATA (for refreshing from server) ---
app.get('/api/user/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const userData = user.toObject();
    delete userData.password;
    res.json({ user: userData });
  } catch (error) {
    console.error('Get User Error:', error);
    res.status(500).json({ message: 'Server error' });
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
