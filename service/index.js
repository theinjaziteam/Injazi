// service/index.js
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { User, PendingUser } from './models.js';
import oauthRoutes from './oauthRoutes.js';
import masterAgentRoutes from './masterAgentRoutes.js';

dotenv.config();

// ============================================
// EMAIL HELPERS (server-side via EmailJS REST API)
// ============================================

async function sendVerificationEmail(email, name, code) {
    try {
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service_id: process.env.EMAILJS_SERVICE_ID,
                template_id: process.env.EMAILJS_TEMPLATE_ID,
                user_id: process.env.EMAILJS_PUBLIC_KEY,
                accessToken: process.env.EMAILJS_PRIVATE_KEY,
                template_params: {
                    to_email: email,
                    to_name: name,
                    verification_code: code,
                    app_name: 'InJazi',
                    subject: 'Your InJazi Verification Code'
                }
            })
        });
        if (response.ok) {
            console.log('✅ Verification email sent to:', email);
        } else {
            const text = await response.text();
            console.error('❌ EmailJS error:', response.status, text);
        }
    } catch (error) {
        console.error('❌ Email send failed:', error);
    }
}

async function sendResetEmail(email, name, code) {
    try {
        const templateId = process.env.EMAILJS_RESET_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID;
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service_id: process.env.EMAILJS_SERVICE_ID,
                template_id: templateId,
                user_id: process.env.EMAILJS_PUBLIC_KEY,
                accessToken: process.env.EMAILJS_PRIVATE_KEY,
                template_params: {
                    to_email: email,
                    to_name: name,
                    verification_code: code,
                    app_name: 'InJazi',
                    subject: 'Reset Your InJazi Password'
                }
            })
        });
        if (response.ok) {
            console.log('✅ Reset email sent to:', email);
        } else {
            const text = await response.text();
            console.error('❌ EmailJS reset error:', response.status, text);
        }
    } catch (error) {
        console.error('❌ Reset email send failed:', error);
    }
}

// ============================================
// CONFIG
// ============================================

const app = express();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET environment variable is required');
    process.exit(1);
}

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://injazi.vercel.app';

// ============================================
// ADMOB CONFIGURATION
// ============================================
const MAX_DAILY_ADS = 25;

// ============================================
// RATE LIMITING
// ============================================

const rateLimits = new Map();

const RATE_LIMITS = {
    'ai/completion': { windowMs: 60 * 1000, maxRequests: 20 },
    'ai/generate-tasks': { windowMs: 60 * 1000, maxRequests: 10 },
    'ai/chat': { windowMs: 60 * 1000, maxRequests: 30 },
    'ai/curriculum': { windowMs: 60 * 1000, maxRequests: 5 },
    'default': { windowMs: 60 * 1000, maxRequests: 60 }
};

const rateLimiter = (endpoint) => {
    return (req, res, next) => {
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown';
        const email = req.body?.email || 'anon';
        const identifier = `${ip}:${email}:${endpoint}`;
        
        const limits = RATE_LIMITS[endpoint] || RATE_LIMITS['default'];
        const now = Date.now();
        
        let entry = rateLimits.get(identifier);
        
        if (!entry || now - entry.windowStart > limits.windowMs) {
            entry = { windowStart: now, count: 1 };
            rateLimits.set(identifier, entry);
        } else {
            entry.count++;
        }
        
        if (entry.count > limits.maxRequests) {
            const retryAfter = Math.ceil((entry.windowStart + limits.windowMs - now) / 1000);
            console.log(`⚠️ Rate limited: ${identifier} (${entry.count}/${limits.maxRequests})`);
            
            return res.status(429).json({ 
                error: 'Too many requests. Please slow down.',
                retryAfter,
                limit: limits.maxRequests
            });
        }
        
        res.setHeader('X-RateLimit-Limit', limits.maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, limits.maxRequests - entry.count));
        res.setHeader('X-RateLimit-Reset', Math.ceil((entry.windowStart + limits.windowMs) / 1000));
        
        next();
    };
};

// Cleanup old rate limit entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimits.entries()) {
        if (now - entry.windowStart > 5 * 60 * 1000) {
            rateLimits.delete(key);
        }
    }
}, 5 * 60 * 1000);

// ============================================
// CONSTANTS
// ============================================

const RESEND_COOLDOWN = 5 * 60 * 1000;  // 5 minutes
const CODE_EXPIRY = 15 * 60 * 1000;     // 15 minutes

// ============================================
// MIDDLEWARE
// ============================================

const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:5173',
    'https://injazi.vercel.app'
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow server-to-server requests (no origin header)
        if (!origin) return callback(null, true);
        if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/\/$/, '')))) {
            return callback(null, true);
        }
        console.warn(`⚠️ CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Authentication middleware — extracts userId from JWT if present
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        try {
            const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
            req.userId = decoded.id;
        } catch {}
    }
    next();
};

// Strict authentication middleware — rejects if no valid JWT
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    try {
        const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

// ============================================
// DATABASE
// ============================================

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => {
        console.error('❌ MongoDB Error:', err);
        process.exit(1);
    });

const generateToken = (userId) => jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30d' });
const generateVerificationCode = () => Math.floor(100000 + Math.random() * 900000).toString();
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// ============================================
// HEALTH CHECK
// ============================================

app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'InJazi API Running', version: '3.0.0' });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        ai: GROQ_API_KEY ? 'configured' : 'not configured',
        oauth: 'enabled'
    });
});

// ============================================
// OAUTH ROUTES
// ============================================

app.use('/api/oauth', oauthRoutes);
app.use('/api/master-agent', masterAgentRoutes);

// ============================================
// ADMOB REWARDED ADS CALLBACKS
// ============================================

app.get('/api/admob/health', (req, res) => {
    res.status(200).json({
        success: true,
        status: 'active',
        message: 'AdMob callback endpoint is healthy',
        dailyAdLimit: MAX_DAILY_ADS,
        timestamp: Date.now()
    });
});

app.get('/api/admob/can-watch', async (req, res) => {
    try {
        const { email } = req.query;
        
        if (!email) {
            return res.status(200).json({ canWatch: true, adsRemaining: MAX_DAILY_ADS, dailyLimit: MAX_DAILY_ADS });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(200).json({ canWatch: true, adsRemaining: MAX_DAILY_ADS, dailyLimit: MAX_DAILY_ADS });
        }

        const today = new Date().setHours(0, 0, 0, 0);
        if (!user.dailyAdCountResetAt || user.dailyAdCountResetAt < today) {
            user.dailyAdCount = 0;
            user.dailyAdCountResetAt = today;
            await user.save();
        }

        const adsRemaining = Math.max(0, MAX_DAILY_ADS - (user.dailyAdCount || 0));
        
        res.status(200).json({
            canWatch: adsRemaining > 0,
            adsRemaining,
            dailyLimit: MAX_DAILY_ADS,
            adsWatchedToday: user.dailyAdCount || 0
        });

    } catch (error) {
        console.error('Can watch check error:', error);
        res.status(200).json({ canWatch: true, adsRemaining: MAX_DAILY_ADS, dailyLimit: MAX_DAILY_ADS });
    }
});

app.get('/api/admob/reward-callback', async (req, res) => {
    console.log('📺 AdMob GET Callback received:', JSON.stringify(req.query));
    
    try {
        const {
            ad_network,
            ad_unit,
            custom_data,
            reward_amount,
            reward_item,
            signature,
            key_id,
            transaction_id,
            user_id
        } = req.query;

        if (Object.keys(req.query).length === 0) {
            console.log('✅ AdMob empty verification ping');
            return res.status(200).json({ 
                success: true, 
                message: 'Callback endpoint verified',
                timestamp: Date.now()
            });
        }

        if (signature && key_id && !custom_data && !user_id && !transaction_id) {
            console.log('✅ AdMob signature verification request');
            return res.status(200).json({ 
                success: true, 
                message: 'Signature verification OK',
                timestamp: Date.now()
            });
        }

        if (!custom_data && !user_id) {
            console.log('✅ AdMob verification (no user data)');
            return res.status(200).json({ 
                success: true, 
                message: 'Endpoint active',
                timestamp: Date.now()
            });
        }

        let customDataParsed = {};
        try {
            if (custom_data) {
                const decoded = decodeURIComponent(custom_data);
                customDataParsed = JSON.parse(decoded);
            }
        } catch (e) {
            console.log('Custom data parse error, treating as email:', custom_data);
            if (custom_data) {
                customDataParsed = { email: decodeURIComponent(custom_data) };
            }
        }

        const userEmail = (
            customDataParsed.email || 
            user_id || 
            ''
        ).toLowerCase().trim();

        if (!userEmail) {
            console.log('⚠️ No user identifier provided');
            return res.status(200).json({ 
                success: true, 
                message: 'No user to reward',
                timestamp: Date.now()
            });
        }

        const rewardType = customDataParsed.rewardType || reward_item || 'credits';
        const amount = parseInt(reward_amount) || customDataParsed.amount || 10;
        const txnId = transaction_id || customDataParsed.transactionId || `auto_${Date.now()}`;

        const user = await User.findOne({ email: userEmail });
        if (!user) {
            console.log('⚠️ User not found:', userEmail);
            return res.status(200).json({ 
                success: true, 
                message: 'User not found',
                timestamp: Date.now()
            });
        }

        if (!user.adRewardTransactions) user.adRewardTransactions = [];
        if (!user.earnings) user.earnings = [];

        const existingTxn = user.adRewardTransactions.find(t => t.transactionId === txnId);
        if (existingTxn) {
            console.log('⚠️ Duplicate transaction:', txnId);
            return res.status(200).json({
                success: true,
                duplicate: true,
                transactionId: txnId
            });
        }

        const today = new Date().setHours(0, 0, 0, 0);
        if (!user.dailyAdCountResetAt || user.dailyAdCountResetAt < today) {
            user.dailyAdCount = 0;
            user.dailyAdCountResetAt = today;
        }
        
        if ((user.dailyAdCount || 0) >= MAX_DAILY_ADS) {
            console.log('⚠️ Daily ad limit reached for:', userEmail);
            return res.status(200).json({
                success: true,
                limitReached: true,
                message: `Daily limit of ${MAX_DAILY_ADS} ads reached`,
                timestamp: Date.now()
            });
        }

        let rewardDetails = {};
        
        switch (rewardType) {
            case 'credits':
                user.credits = (user.credits || 0) + amount;
                rewardDetails = { credits: amount };
                break;
            case 'premium_time':
                const hours = amount || 24;
                user.premiumUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
                user.isPremium = true;
                rewardDetails = { premiumHours: hours };
                break;
            case 'streak_freeze':
                user.streakFreezes = (user.streakFreezes || 0) + 1;
                rewardDetails = { streakFreezes: 1 };
                break;
            case 'goal_slot':
                user.maxGoalSlots = (user.maxGoalSlots || 3) + 1;
                rewardDetails = { goalSlots: 1 };
                break;
            case 'real_money':
                const money = amount / 100;
                user.realMoneyBalance = (user.realMoneyBalance || 0) + money;
                rewardDetails = { realMoney: money };
                break;
            default:
                user.credits = (user.credits || 0) + amount;
                rewardDetails = { credits: amount };
        }

        user.adRewardTransactions.push({
            transactionId: txnId,
            adUnit: ad_unit || 'unknown',
            adNetwork: ad_network || 'admob',
            rewardType,
            amount,
            rewardDetails,
            timestamp: Date.now(),
            status: 'completed'
        });

        user.totalAdsWatched = (user.totalAdsWatched || 0) + 1;
        user.lastAdWatchedAt = Date.now();
        user.dailyAdCount = (user.dailyAdCount || 0) + 1;

        if (user.adRewardTransactions.length > 100) {
            user.adRewardTransactions = user.adRewardTransactions.slice(-100);
        }

        await user.save();

        console.log('✅ Reward applied:', { user: userEmail, rewardType, amount, txnId, dailyCount: user.dailyAdCount });

        return res.status(200).json({
            success: true,
            rewardApplied: true,
            transactionId: txnId,
            rewardType,
            amount,
            adsWatchedToday: user.dailyAdCount,
            adsRemaining: MAX_DAILY_ADS - user.dailyAdCount
        });

    } catch (error) {
        console.error('❌ AdMob callback error:', error);
        return res.status(200).json({ 
            success: false, 
            error: error.message,
            timestamp: Date.now()
        });
    }
});

app.post('/api/admob/reward-callback', async (req, res) => {
    console.log('📺 AdMob POST Callback received');
    console.log('Query:', req.query);
    console.log('Body:', req.body);
    
    const params = { ...req.query, ...req.body };
    
    if (Object.keys(params).length === 0) {
        return res.status(200).json({ 
            success: true, 
            message: 'POST endpoint verified',
            timestamp: Date.now()
        });
    }
    
    return res.status(200).json({ 
        success: true, 
        message: 'POST callback received',
        timestamp: Date.now()
    });
});

app.post('/api/admob/verify-reward', async (req, res) => {
    try {
        const { email, transactionId } = req.body;

        if (!email || !transactionId) {
            return res.status(200).json({ 
                success: false, 
                rewarded: false,
                error: 'Missing parameters' 
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(200).json({ 
                success: false,
                rewarded: false, 
                error: 'User not found' 
            });
        }

        const transaction = user.adRewardTransactions?.find(
            t => t.transactionId === transactionId
        );

        if (transaction) {
            return res.status(200).json({
                success: true,
                rewarded: true,
                transaction,
                currentBalance: {
                    credits: user.credits,
                    realMoney: user.realMoneyBalance
                },
                adsWatchedToday: user.dailyAdCount || 0,
                adsRemaining: MAX_DAILY_ADS - (user.dailyAdCount || 0)
            });
        } else {
            return res.status(200).json({
                success: true,
                rewarded: false,
                message: 'Transaction not found yet'
            });
        }

    } catch (error) {
        console.error('Verify error:', error);
        return res.status(200).json({ 
            success: false,
            rewarded: false, 
            error: error.message 
        });
    }
});

app.get('/api/admob/history/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email.toLowerCase() });
        if (!user) {
            return res.status(200).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        return res.status(200).json({
            success: true,
            totalAdsWatched: user.totalAdsWatched || 0,
            todayAdsWatched: user.dailyAdCount || 0,
            dailyLimit: MAX_DAILY_ADS,
            adsRemaining: MAX_DAILY_ADS - (user.dailyAdCount || 0),
            recentTransactions: (user.adRewardTransactions || []).slice(-20).reverse()
        });

    } catch (error) {
        return res.status(200).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ============================================
// AUTH ENDPOINTS
// ============================================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name, country } = req.body;
        
        if (!email || !password || !name) {
            return res.status(400).json({ message: 'Email, password, and name are required.' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        if (!isValidEmail(normalizedEmail)) {
            return res.status(400).json({ message: 'Please enter a valid email address.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters.' });
        }

        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists. Please log in.' });
        }

        // Check for existing pending registration (persisted in MongoDB)
        const existingPending = await PendingUser.findOne({ email: normalizedEmail });
        if (existingPending) {
            const timeSinceLastSent = Date.now() - existingPending.lastSentAt.getTime();
            if (timeSinceLastSent < RESEND_COOLDOWN) {
                const timeRemaining = Math.ceil((RESEND_COOLDOWN - timeSinceLastSent) / 1000);
                return res.status(400).json({ 
                    message: 'Please wait before requesting a new code.',
                    cooldownRemaining: timeRemaining
                });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationCode = generateVerificationCode();
        
        // Persist pending user in MongoDB (survives server restarts)
        await PendingUser.findOneAndUpdate(
            { email: normalizedEmail },
            {
                email: normalizedEmail,
                hashedPassword: hashedPassword,
                name: name.trim(),
                country: country || 'Unknown',
                code: verificationCode,
                lastSentAt: new Date(),
                createdAt: new Date()  // Resets the TTL
            },
            { upsert: true, new: true }
        );

        // Send email server-side — code NEVER sent to client
        await sendVerificationEmail(normalizedEmail, name.trim(), verificationCode);

        return res.json({ 
            success: true,
            email: normalizedEmail,
            message: 'Verification code sent to your email'
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Server error. Please try again.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check if user has a pending verification
        const pendingUser = await PendingUser.findOne({ email: normalizedEmail });
        if (pendingUser) {
            return res.status(400).json({ 
                message: 'Please verify your email first.',
                requiresVerification: true
            });
        }

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(400).json({ message: 'User not found. Please sign up.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        user.lastLoginAt = Date.now();
        await user.save();

        const token = generateToken(user._id);
        const userObj = user.toObject();
        delete userObj.password;

        return res.json({ user: userObj, token });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error. Please try again.' });
    }
});

app.post('/api/auth/verify', async (req, res) => {
    try {
        const { email, code } = req.body;
        const normalizedEmail = email.toLowerCase().trim();

        const pending = await PendingUser.findOne({ email: normalizedEmail });
        
        if (!pending) {
            return res.status(400).json({ message: 'No pending verification. Please register again.' });
        }

        if (pending.code !== code) {
            return res.status(400).json({ message: 'Invalid verification code.' });
        }

        // Create the real user from pending data
        const user = new User({
            email: pending.email,
            password: pending.hashedPassword,
            name: pending.name,
            country: pending.country,
            createdAt: Date.now(),
            isEmailVerified: true
        });

        await user.save();
        await PendingUser.deleteOne({ email: normalizedEmail });

        const token = generateToken(user._id);
        const userObj = user.toObject();
        delete userObj.password;

        res.json({ success: true, user: userObj, token });

    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ message: 'Server error. Please try again.' });
    }
});

app.post('/api/auth/resend', async (req, res) => {
    try {
        const { email } = req.body;
        const normalizedEmail = email.toLowerCase().trim();

        const pending = await PendingUser.findOne({ email: normalizedEmail });
        
        if (!pending) {
            return res.status(400).json({ message: 'No pending verification. Please register again.' });
        }

        const timeSinceLastSent = Date.now() - pending.lastSentAt.getTime();
        if (timeSinceLastSent < RESEND_COOLDOWN) {
            const timeRemaining = Math.ceil((RESEND_COOLDOWN - timeSinceLastSent) / 1000);
            return res.status(400).json({ 
                message: `Please wait ${Math.ceil(timeRemaining / 60)} minutes.`,
                cooldownRemaining: timeRemaining
            });
        }

        const newCode = generateVerificationCode();
        pending.code = newCode;
        pending.lastSentAt = new Date();
        pending.createdAt = new Date();  // Reset TTL
        await pending.save();

        // Send email server-side — code NEVER sent to client
        await sendVerificationEmail(normalizedEmail, pending.name, newCode);

        res.json({ 
            success: true,
            email: normalizedEmail,
            message: 'New code sent to your email',
            cooldownRemaining: RESEND_COOLDOWN / 1000
        });

    } catch (error) {
        console.error('Resend error:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});

app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const normalizedEmail = email.toLowerCase().trim();

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            // Don't reveal whether email exists
            return res.json({ success: true, message: 'If email exists, code was sent.' });
        }

        if (user.passwordResetLastSent && Date.now() - user.passwordResetLastSent < RESEND_COOLDOWN) {
            const timeRemaining = Math.ceil((RESEND_COOLDOWN - (Date.now() - user.passwordResetLastSent)) / 1000);
            return res.status(400).json({ 
                message: `Please wait ${Math.ceil(timeRemaining / 60)} minutes.`,
                cooldownRemaining: timeRemaining
            });
        }

        const resetCode = generateVerificationCode();
        user.passwordResetCode = resetCode;
        user.passwordResetExpires = Date.now() + CODE_EXPIRY;
        user.passwordResetLastSent = Date.now();
        await user.save();

        // Send email server-side — code NEVER sent to client
        await sendResetEmail(normalizedEmail, user.name, resetCode);

        res.json({ 
            success: true,
            email: normalizedEmail,
            message: 'Reset code sent to your email'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        const normalizedEmail = email.toLowerCase().trim();

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters.' });
        }

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(400).json({ message: 'User not found.' });
        }

        if (user.passwordResetCode !== code) {
            return res.status(400).json({ message: 'Invalid reset code.' });
        }

        if (user.passwordResetExpires < Date.now()) {
            return res.status(400).json({ message: 'Code expired. Request a new one.' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.passwordResetCode = undefined;
        user.passwordResetExpires = undefined;
        user.passwordResetLastSent = undefined;
        await user.save();

        res.json({ success: true, message: 'Password reset successfully.' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});

// ============================================
// SYNC & USER ENDPOINTS (now secured)
// ============================================

app.post('/api/sync', requireAuth, async (req, res) => {
    try {
        const userData = req.body;
        if (!userData.email) return res.status(400).json({ message: 'Email required' });

        // Verify the authenticated user matches the email being synced
        const authUser = await User.findById(req.userId);
        if (!authUser || authUser.email !== userData.email.toLowerCase().trim()) {
            return res.status(403).json({ message: 'Not authorized to sync this account' });
        }

        const updateData = { ...userData };
        // Strip fields that must never be overwritten via sync
        delete updateData._id;
        delete updateData.email;
        delete updateData.password;
        delete updateData.__v;
        delete updateData.connectedAccounts;
        delete updateData.adRewardTransactions;
        delete updateData.realMoneyBalance;
        delete updateData.isPremium;
        delete updateData.premiumUntil;
        delete updateData.isEmailVerified;

        await User.findOneAndUpdate(
            { email: authUser.email }, 
            updateData, 
            { upsert: false, new: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/api/user/:email', requireAuth, async (req, res) => {
    try {
        // Verify the authenticated user matches the requested email
        const authUser = await User.findById(req.userId);
        if (!authUser || authUser.email !== req.params.email.toLowerCase().trim()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const userObj = authUser.toObject();
        delete userObj.password;
        
        // Sanitize connected accounts (remove tokens)
        if (userObj.connectedAccounts) {
            userObj.connectedAccounts = userObj.connectedAccounts.map(acc => ({
                platform: acc.platform,
                platformUsername: acc.platformUsername,
                platformEmail: acc.platformEmail,
                platformAvatar: acc.platformAvatar,
                isConnected: acc.isConnected,
                connectedAt: acc.connectedAt,
                lastSyncAt: acc.lastSyncAt,
                expiresAt: acc.expiresAt,
                isExpired: acc.expiresAt ? Date.now() > acc.expiresAt : false
            }));
        }
        
        res.json(userObj);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ============================================
// AI ENDPOINTS (with rate limiting)
// ============================================

app.post('/api/ai/completion', optionalAuth, rateLimiter('ai/completion'), async (req, res) => {
    try {
        if (!GROQ_API_KEY) {
            return res.status(500).json({ error: 'AI service not configured' });
        }

        const { messages, jsonMode = false, maxTokens = 4096, temperature = 0.7 } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array required' });
        }

        if (messages.length > 20) {
            return res.status(400).json({ error: 'Too many messages. Maximum 20 allowed.' });
        }

        const totalLength = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
        if (totalLength > 50000) {
            return res.status(400).json({ error: 'Content too long.' });
        }

        const response = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages,
                temperature: Math.min(Math.max(temperature, 0), 1),
                max_tokens: Math.min(maxTokens, 4096),
                ...(jsonMode && { response_format: { type: "json_object" } })
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error('Groq API error:', data.error);
            return res.status(500).json({ error: data.error.message || 'AI request failed' });
        }

        res.json({ content: data.choices?.[0]?.message?.content || '' });

    } catch (error) {
        console.error('AI completion error:', error);
        res.status(500).json({ error: 'AI service unavailable' });
    }
});

app.post('/api/ai/generate-tasks', optionalAuth, rateLimiter('ai/generate-tasks'), async (req, res) => {
    try {
        if (!GROQ_API_KEY) {
            return res.status(500).json({ error: 'AI service not configured' });
        }

        const { goal, day, userProfile = '', checkIn = '' } = req.body;

        if (!goal || !day) {
            return res.status(400).json({ error: 'Goal and day required' });
        }

        if (day < 1 || day > 365) {
            return res.status(400).json({ error: 'Invalid day number' });
        }

        const safeGoalTitle = (goal.title || 'Goal').slice(0, 200);
        const safeGoalCategory = (goal.category || 'General').slice(0, 50);
        const safeUserProfile = (userProfile || '').slice(0, 500);
        const safeCheckIn = (checkIn || '').slice(0, 1000);

        const systemPrompt = `You are an expert task coach creating highly actionable daily tasks. 

RULES FOR GOOD TASKS:
1. Title: Clear, specific action (e.g., "Create Emergency Fund Spreadsheet" not "Check finances")
2. Description: MUST include exact steps, specific tools/apps/resources, and success criteria.

Be specific. Be actionable. Include real tools and steps.`;

        const userPrompt = `Create 3 highly detailed tasks for Day ${day} of: "${safeGoalTitle}" (${safeGoalCategory}).
${safeCheckIn ? `\nUser's update: "${safeCheckIn}"` : ''}
${safeUserProfile ? `\nAbout user: ${safeUserProfile}` : ''}

Requirements:
- Task 1: Quick win (15-20 min, EASY)
- Task 2: Core work (30-45 min, MEDIUM)  
- Task 3: Deep work (45-60 min, HARD)

Return ONLY valid JSON:
{"tasks": [
  {"title": "Task Title", "description": "Detailed steps...", "estimatedTimeMinutes": 15, "difficulty": "EASY"},
  {"title": "Task Title", "description": "Detailed steps...", "estimatedTimeMinutes": 35, "difficulty": "MEDIUM"},
  {"title": "Task Title", "description": "Detailed steps...", "estimatedTimeMinutes": 50, "difficulty": "HARD"}
]}`;

        const response = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 4096,
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error('Groq task error:', data.error);
            return res.status(500).json({ error: 'Task generation failed' });
        }

        const content = data.choices?.[0]?.message?.content || '';
        
        try {
            const parsed = JSON.parse(content);
            res.json({ tasks: Array.isArray(parsed.tasks || parsed) ? (parsed.tasks || parsed) : [] });
        } catch {
            res.status(500).json({ error: 'Failed to parse AI response' });
        }

    } catch (error) {
        console.error('Task generation error:', error);
        res.status(500).json({ error: 'Task generation unavailable' });
    }
});

app.post('/api/ai/chat', optionalAuth, rateLimiter('ai/chat'), async (req, res) => {
    try {
        if (!GROQ_API_KEY) {
            return res.status(500).json({ error: 'AI service not configured' });
        }

        const { goal, history = [], message, userProfile = '', currentTasks = [] } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message required' });
        }

        const safeMessage = message.slice(0, 2000);
        const safeHistory = history.slice(-10);
        const safeGoalTitle = goal?.title?.slice(0, 200) || 'their goal';
        const taskList = currentTasks.slice(0, 10).map(t => `- ${(t.title || '').slice(0, 100)} (${t.status || 'pending'})`).join('\n');

        const systemPrompt = `You are "The Guide" - a supportive AI coach helping someone achieve "${safeGoalTitle}".

Personality: Warm, encouraging, practical. Give specific actionable advice. Keep responses concise (2-4 sentences).

User's tasks:
${taskList || 'No tasks yet'}`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...safeHistory.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: (msg.text || '').slice(0, 2000)
            })),
            { role: 'user', content: safeMessage }
        ];

        const response = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages,
                temperature: 0.7,
                max_tokens: 1024
            })
        });

        const data = await response.json();

        if (data.error) {
            return res.status(500).json({ error: 'Chat failed' });
        }

        res.json({ response: data.choices?.[0]?.message?.content || "I'm here to help. What would you like to work on?" });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Chat unavailable' });
    }
});

app.post('/api/ai/curriculum', optionalAuth, rateLimiter('ai/curriculum'), async (req, res) => {
    try {
        if (!GROQ_API_KEY) {
            return res.status(500).json({ error: 'AI service not configured' });
        }

        const { goal } = req.body;

        if (!goal) {
            return res.status(400).json({ error: 'Goal required' });
        }

        const safeGoalTitle = (goal.title || 'Goal').slice(0, 200);

        const prompt = `Create a 4-phase learning curriculum for: "${safeGoalTitle}"

Each phase has exactly 3 lessons. Return ONLY valid JSON:
{"chapters": [
  {"id": "ch-1", "title": "Phase 1: Foundation", "lessons": [{"id": "l1", "title": "Lesson", "duration": "10 min", "isLocked": false, "description": "Description"}, {"id": "l2", "title": "Lesson", "duration": "12 min", "isLocked": false, "description": "Description"}, {"id": "l3", "title": "Lesson", "duration": "10 min", "isLocked": false, "description": "Description"}], "quiz": []},
  {"id": "ch-2", "title": "Phase 2: Building Skills", "lessons": [{"id": "l4", "title": "Lesson", "duration": "15 min", "isLocked": false, "description": "Description"}, {"id": "l5", "title": "Lesson", "duration": "12 min", "isLocked": false, "description": "Description"}, {"id": "l6", "title": "Lesson", "duration": "10 min", "isLocked": false, "description": "Description"}], "quiz": []},
  {"id": "ch-3", "title": "Phase 3: Advanced Techniques", "lessons": [{"id": "l7", "title": "Lesson", "duration": "15 min", "isLocked": false, "description": "Description"}, {"id": "l8", "title": "Lesson", "duration": "12 min", "isLocked": false, "description": "Description"}, {"id": "l9", "title": "Lesson", "duration": "15 min", "isLocked": false, "description": "Description"}], "quiz": []},
  {"id": "ch-4", "title": "Phase 4: Mastery", "lessons": [{"id": "l10", "title": "Lesson", "duration": "10 min", "isLocked": false, "description": "Description"}, {"id": "l11", "title": "Lesson", "duration": "12 min", "isLocked": false, "description": "Description"}, {"id": "l12", "title": "Lesson", "duration": "10 min", "isLocked": false, "description": "Description"}], "quiz": []}
]}`;

        const response = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: 'You are an expert curriculum designer.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 4096,
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();

        if (data.error) {
            return res.status(500).json({ error: 'Curriculum generation failed' });
        }

        const content = data.choices?.[0]?.message?.content || '';
        
        try {
            const parsed = JSON.parse(content);
            res.json({ chapters: Array.isArray(parsed.chapters || parsed) ? (parsed.chapters || parsed) : [] });
        } catch {
            res.json({ chapters: [] });
        }

    } catch (error) {
        console.error('Curriculum error:', error);
        res.status(500).json({ error: 'Curriculum generation unavailable' });
    }
});

app.get('/api/ai/rate-limit-status', (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown';
    const status = {};
    
    for (const endpoint of Object.keys(RATE_LIMITS)) {
        const entry = rateLimits.get(`${ip}:anon:${endpoint}`);
        const limits = RATE_LIMITS[endpoint];
        status[endpoint] = entry 
            ? { used: entry.count, limit: limits.maxRequests, remaining: Math.max(0, limits.maxRequests - entry.count) }
            : { used: 0, limit: limits.maxRequests, remaining: limits.maxRequests };
    }
    
    res.json({ ip, status });
});

// ============================================
// 404 CATCH-ALL
// ============================================

app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.path });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🤖 AI: ${GROQ_API_KEY ? 'Configured' : 'NOT CONFIGURED'}`);
    console.log(`🔐 OAuth: Enabled at /api/oauth`);
    console.log(`📺 AdMob callback: /api/admob/reward-callback`);
    console.log(`📺 Daily ad limit: ${MAX_DAILY_ADS} ads per user`);
});


