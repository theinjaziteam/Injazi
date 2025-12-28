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
const allowedOrigins = [
  process.env.FRONTEND_URL, 
  'http://localhost:3000',
  'https://api.groq.com/openai/v1/chat/completions',
  'http://localhost:5173',  // Vite default
  'https://injazi.vercel.app'
].filter(Boolean);

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
  console.log("📥 Auth Request:", req.body.email, req.body.isRegister ? "(Register)" : "(Login)");
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
      console.log("✅ User Logged In:", email);
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
  const { email, password, ...updates } = req.body; // Exclude password from updates
  
  if (!email) {
    return res.status(400).json({ message: 'No email provided' });
  }

  try {
    // Debug logging
    console.log("📥 Sync request for:", email);
    
    if (updates.goal) {
      console.log("📚 Goal data:", {
        title: updates.goal.title,
        hasCurriculum: !!updates.goal.savedCurriculum,
        curriculumLength: updates.goal.savedCurriculum?.length || 0,
        hasCourses: !!updates.goal.savedCourses,
        coursesLength: updates.goal.savedCourses?.length || 0
      });
    }

    // Remove undefined values to prevent overwriting with null
    const cleanUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }

    const updatedUser = await User.findOneAndUpdate(
      { email },
      { $set: cleanUpdates },
      { new: true, runValidators: false } // Disable validators for flexibility
    );

    if (!updatedUser) {
      console.error("❌ User not found:", email);
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify the save worked
    if (updates.goal?.savedCurriculum) {
      const verified = await User.findOne({ email });
      console.log("✅ Verified curriculum saved:", 
        verified?.goal?.savedCurriculum?.length || 0, "chapters");
    }

    console.log("✅ Sync successful for:", email);
    res.json({ success: true });

  } catch (error) {
    console.error('❌ Sync Error:', error);
    res.status(500).json({ message: 'Sync failed', error: error.message });
  }
});

// --- GET USER (to refresh data from server) ---
app.get('/api/user/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const userData = user.toObject();
    delete userData.password;
    
    console.log("📤 Sending user data:", {
      email: userData.email,
      hasGoal: !!userData.goal,
      curriculumLength: userData.goal?.savedCurriculum?.length || 0
    });
    
    res.json({ user: userData });
  } catch (error) {
    console.error('Get User Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- DEBUG ROUTE (remove in production) ---
app.get('/api/debug/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      email: user.email,
      hasGoal: !!user.goal,
      goalTitle: user.goal?.title,
      savedCurriculumLength: user.goal?.savedCurriculum?.length || 0,
      savedCoursesLength: user.goal?.savedCourses?.length || 0,
      savedFeedLength: user.goal?.savedFeed?.length || 0,
      savedProductsLength: user.goal?.savedProducts?.length || 0,
      savedVideosLength: user.goal?.savedVideos?.length || 0,
      allGoalsCount: user.allGoals?.length || 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Error', error: error.message });
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
  console.log(`📡 Allowed Origins: ${allowedOrigins.join(', ')}`);
});

// ============================================
// ADGEM POSTBACK ENDPOINT
// ============================================

// AdGem Postback Handler - receives conversion notifications
app.get('/api/adgem/postback', async (req, res) => {
    try {
        console.log('📥 AdGem Postback Received:', req.query);

        // Extract parameters from AdGem
        const {
            player_id,      // User's email (we pass this as player_id)
            amount,         // Virtual currency amount to reward
            payout,         // Actual USD earned
            transaction_id, // Unique transaction ID from AdGem
            campaign_id,    // Offer/campaign ID
            offer_name,     // Name of the completed offer
            verifier,       // Security hash (optional but recommended)
            request_id      // Unique request ID
        } = req.query;

        // Validate required fields
        if (!player_id || !amount || !transaction_id) {
            console.error('❌ Missing required fields');
            return res.status(400).send('Missing required fields');
        }

        // Optional: Verify the postback hash (recommended for production)
        // You would need to store ADGEM_POSTBACK_KEY in your env variables
        if (process.env.ADGEM_POSTBACK_KEY && verifier) {
            const crypto = require('crypto');
            
            // Rebuild URL without verifier
            const url = new URL(`${req.protocol}://${req.get('host')}${req.originalUrl}`);
            url.searchParams.delete('verifier');
            
            const expectedHash = crypto
                .createHmac('sha256', process.env.ADGEM_POSTBACK_KEY)
                .update(url.toString())
                .digest('hex');
            
            if (expectedHash !== verifier) {
                console.error('❌ Invalid verifier hash');
                return res.status(403).send('Invalid verifier');
            }
        }

        // Find the user by email (player_id)
        const user = await User.findOne({ email: player_id });
        
        if (!user) {
            console.error('❌ User not found:', player_id);
            return res.status(404).send('User not found');
        }

        // Check for duplicate transaction (prevent double crediting)
        const existingTransaction = user.adgemTransactions?.find(
            t => t.transactionId === transaction_id
        );
        
        if (existingTransaction) {
            console.log('⚠️ Duplicate transaction, already processed:', transaction_id);
            return res.status(200).send('OK'); // Return OK to stop AdGem retries
        }

        // Credit the user
        const creditsToAdd = parseInt(amount) || 0;
        const payoutAmount = parseFloat(payout) || 0;

        await User.findOneAndUpdate(
            { email: player_id },
            {
                $inc: { credits: creditsToAdd },
                $push: {
                    adgemTransactions: {
                        transactionId: transaction_id,
                        campaignId: campaign_id,
                        offerName: offer_name,
                        credits: creditsToAdd,
                        payout: payoutAmount,
                        completedAt: Date.now()
                    }
                }
            }
        );

        console.log(`✅ Credited ${creditsToAdd} credits to ${player_id} for offer: ${offer_name}`);
        
        // AdGem expects "OK" or "1" as success response
        res.status(200).send('OK');

    } catch (error) {
        console.error('❌ AdGem Postback Error:', error);
        res.status(500).send('Server error');
    }
});

// Health check for AdGem endpoint
app.get('/api/adgem/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'adgem-postback' });
});



