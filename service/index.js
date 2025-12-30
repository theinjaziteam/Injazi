import express from 'express';
import ecommerceRouter from './ecommerceAgent.js';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { User } from './models.js';

dotenv.config();

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'injazi-secret-change-me';
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

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

// Cleanup old entries
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimits.entries()) {
        if (now - entry.windowStart > 5 * 60 * 1000) {
            rateLimits.delete(key);
        }
    }
}, 5 * 60 * 1000);

// ============================================
// PENDING USERS (Email Verification)
// ============================================

const pendingUsers = new Map();
const RESEND_COOLDOWN = 5 * 60 * 1000;
const CODE_EXPIRY = 15 * 60 * 1000;

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
        if (!origin) return callback(null, true);
        if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/\/$/, '')))) {
            return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));

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

// ============================================
// DATABASE
// ============================================

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

const generateToken = (userId) => jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30d' });
const generateVerificationCode = () => Math.floor(100000 + Math.random() * 900000).toString();
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// ============================================
// HEALTH CHECK
// ============================================

app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'InJazi API Running' });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        ai: GROQ_API_KEY ? 'configured' : 'not configured'
    });
});

// ============================================
// ADMOB REWARDED ADS CALLBACK
// ============================================

// Secret key for verifying AdMob callbacks (set in your .env)
const ADMOB_SSV_SECRET = process.env.ADMOB_SSV_SECRET || 'your-admob-ssv-secret';

// Verify AdMob SSV (Server-Side Verification) signature
const crypto = await import('crypto');

const verifyAdMobSignature = (queryParams, signature, keyId) => {
    // For production, you should fetch Google's public keys and verify
    // For now, we'll use a simpler custom_data verification
    return true; // Implement proper verification in production
};

// AdMob Rewarded Ad Callback Endpoint
app.get('/api/admob/reward-callback', async (req, res) => {
    try {
        const {
            ad_network,
            ad_unit,
            custom_data,    // This contains user_id and reward info you pass
            reward_amount,
            reward_item,
            signature,
            key_id,
            transaction_id,
            user_id,        // If you set it in the ad request
            timestamp
        } = req.query;

        console.log('📺 AdMob Reward Callback:', {
            ad_unit,
            custom_data,
            reward_amount,
            reward_item,
            transaction_id,
            user_id,
            timestamp
        });

        // Parse custom_data (JSON string with user email and extra info)
        let customDataParsed;
        try {
            customDataParsed = JSON.parse(decodeURIComponent(custom_data || '{}'));
        } catch (e) {
            customDataParsed = { email: custom_data };
        }

        const userEmail = customDataParsed.email || user_id;
        const rewardType = customDataParsed.rewardType || reward_item || 'credits';
        const amount = parseInt(reward_amount) || customDataParsed.amount || 10;

        if (!userEmail) {
            console.error('❌ AdMob callback: No user identifier');
            return res.status(400).json({ error: 'Missing user identifier' });
        }

        // Check for duplicate transaction
        const user = await User.findOne({ email: userEmail });
        if (!user) {
            console.error('❌ AdMob callback: User not found:', userEmail);
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if this transaction was already processed
        const existingTransaction = user.adRewardTransactions?.find(
            t => t.transactionId === transaction_id
        );
        
        if (existingTransaction) {
            console.log('⚠️ Duplicate transaction, already rewarded:', transaction_id);
            return res.status(200).json({ 
                success: true, 
                message: 'Already rewarded',
                duplicate: true 
            });
        }

        // Apply reward based on type
        let rewardApplied = false;
        let rewardDetails = {};

        switch (rewardType) {
            case 'credits':
                user.credits = (user.credits || 0) + amount;
                rewardDetails = { credits: amount };
                rewardApplied = true;
                break;
            
            case 'premium_time':
                // Grant temporary premium (e.g., 24 hours)
                const premiumHours = amount || 24;
                user.premiumUntil = new Date(Date.now() + premiumHours * 60 * 60 * 1000);
                rewardDetails = { premiumHours };
                rewardApplied = true;
                break;
            
            case 'streak_freeze':
                user.streakFreezes = (user.streakFreezes || 0) + 1;
                rewardDetails = { streakFreezes: 1 };
                rewardApplied = true;
                break;
            
            case 'goal_slot':
                user.maxGoalSlots = (user.maxGoalSlots || 3) + 1;
                rewardDetails = { goalSlots: 1 };
                rewardApplied = true;
                break;

            case 'real_money':
                // Small real money reward (for cash-out features)
                const moneyAmount = amount / 1000; // e.g., 10 = $0.01
                user.realMoneyBalance = (user.realMoneyBalance || 0) + moneyAmount;
                rewardDetails = { realMoney: moneyAmount };
                rewardApplied = true;
                break;
            
            default:
                user.credits = (user.credits || 0) + amount;
                rewardDetails = { credits: amount };
                rewardApplied = true;
        }

        // Log the transaction
        if (!user.adRewardTransactions) {
            user.adRewardTransactions = [];
        }
        
        user.adRewardTransactions.push({
            transactionId: transaction_id,
            adUnit: ad_unit,
            rewardType,
            amount,
            rewardDetails,
            timestamp: Date.now(),
            adNetwork: ad_network
        });

        // Keep only last 100 transactions to prevent bloat
        if (user.adRewardTransactions.length > 100) {
            user.adRewardTransactions = user.adRewardTransactions.slice(-100);
        }

        await user.save();

        console.log('✅ AdMob reward applied:', {
            user: userEmail,
            rewardType,
            amount,
            transactionId: transaction_id
        });

        // Return success (AdMob expects 200 status)
        res.status(200).json({ 
            success: true, 
            rewardApplied,
            rewardDetails,
            newBalance: {
                credits: user.credits,
                realMoney: user.realMoneyBalance
            }
        });

    } catch (error) {
        console.error('❌ AdMob callback error:', error);
        // Still return 200 to prevent AdMob from retrying
        res.status(200).json({ success: false, error: error.message });
    }
});

// POST version for additional security
app.post('/api/admob/reward-callback', async (req, res) => {
    // Same logic as GET, but reads from body
    const params = { ...req.query, ...req.body };
    req.query = params;
    // Redirect to GET handler logic
    return app._router.handle(req, res);
});

// Endpoint to verify reward was applied (called from client after ad)
app.post('/api/admob/verify-reward', async (req, res) => {
    try {
        const { email, transactionId } = req.body;

        if (!email || !transactionId) {
            return res.status(400).json({ error: 'Missing email or transactionId' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const transaction = user.adRewardTransactions?.find(
            t => t.transactionId === transactionId
        );

        if (transaction) {
            res.json({ 
                success: true, 
                rewarded: true,
                transaction,
                currentBalance: {
                    credits: user.credits,
                    realMoney: user.realMoneyBalance
                }
            });
        } else {
            res.json({ 
                success: true, 
                rewarded: false,
                message: 'Transaction not found yet, may still be processing'
            });
        }

    } catch (error) {
        console.error('Verify reward error:', error);
        res.status(500).json({ error: error.message });
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

        const existingPending = pendingUsers.get(normalizedEmail);
        if (existingPending && existingPending.expiresAt > Date.now()) {
            const timeSinceLastSent = Date.now() - existingPending.lastSentAt;
            if (timeSinceLastSent < RESEND_COOLDOWN) {
                const timeRemaining = Math.ceil((RESEND_COOLDOWN - timeSinceLastSent) / 1000);
                return res.status(400).json({ 
                    message: `Please wait before requesting a new code.`,
                    cooldownRemaining: timeRemaining
                });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationCode = generateVerificationCode();
        
        pendingUsers.set(normalizedEmail, {
            userData: {
                email: normalizedEmail,
                password: hashedPassword,
                name: name.trim(),
                country: country || 'Unknown',
                createdAt: Date.now()
            },
            code: verificationCode,
            expiresAt: Date.now() + CODE_EXPIRY,
            lastSentAt: Date.now()
        });

        return res.json({ 
            success: true,
            code: verificationCode,
            name: name.trim(),
            email: normalizedEmail,
            message: 'Verification code generated'
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

        const pendingUser = pendingUsers.get(normalizedEmail);
        if (pendingUser && pendingUser.expiresAt > Date.now()) {
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

        const pending = pendingUsers.get(normalizedEmail);
        
        if (!pending) {
            return res.status(400).json({ message: 'No pending verification. Please register again.' });
        }

        if (pending.expiresAt < Date.now()) {
            pendingUsers.delete(normalizedEmail);
            return res.status(400).json({ message: 'Code expired. Please register again.' });
        }

        if (pending.code !== code) {
            return res.status(400).json({ message: 'Invalid verification code.' });
        }

        const user = new User({
            ...pending.userData,
            isEmailVerified: true
        });

        await user.save();
        pendingUsers.delete(normalizedEmail);

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

        const pending = pendingUsers.get(normalizedEmail);
        
        if (!pending) {
            return res.status(400).json({ message: 'No pending verification. Please register again.' });
        }

        const timeSinceLastSent = Date.now() - pending.lastSentAt;
        if (timeSinceLastSent < RESEND_COOLDOWN) {
            const timeRemaining = Math.ceil((RESEND_COOLDOWN - timeSinceLastSent) / 1000);
            return res.status(400).json({ 
                message: `Please wait ${Math.ceil(timeRemaining / 60)} minutes.`,
                cooldownRemaining: timeRemaining
            });
        }

        const newCode = generateVerificationCode();
        pending.code = newCode;
        pending.expiresAt = Date.now() + CODE_EXPIRY;
        pending.lastSentAt = Date.now();
        pendingUsers.set(normalizedEmail, pending);

        res.json({ 
            success: true, 
            code: newCode,
            name: pending.userData.name,
            email: normalizedEmail,
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

        res.json({ 
            success: true, 
            code: resetCode,
            name: user.name,
            email: normalizedEmail
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
// SYNC & USER ENDPOINTS
// ============================================

app.post('/api/sync', async (req, res) => {
    try {
        const userData = req.body;
        if (!userData.email) return res.status(400).json({ message: 'Email required' });

        const updateData = { ...userData };
        delete updateData._id;
        delete updateData.password;
        delete updateData.__v;

        await User.findOneAndUpdate({ email: userData.email }, updateData, { upsert: false, new: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/api/user/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        const userObj = user.toObject();
        delete userObj.password;
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
// CLEANUP JOBS
// ============================================

setInterval(() => {
    const now = Date.now();
    for (const [email, data] of pendingUsers.entries()) {
        if (data.expiresAt < now) pendingUsers.delete(email);
    }
}, 10 * 60 * 1000);

// ============================================
// START SERVER
// ============================================
app.use('/api/ecommerce', ecommerceRouter);
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🤖 AI: ${GROQ_API_KEY ? 'Configured' : 'NOT CONFIGURED'}`);
});
// ============================================
// ADMOB REWARDED ADS CALLBACKS
// ============================================

// Check if user can watch more ads today
app.get('/api/admob/can-watch', async (req, res) => {
    try {
        const { email } = req.query;
        
        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.json({ canWatch: true, adsRemaining: 10 });
        }

        // Reset daily count if needed
        const today = new Date().setHours(0, 0, 0, 0);
        if (!user.dailyAdCountResetAt || user.dailyAdCountResetAt < today) {
            user.dailyAdCount = 0;
            user.dailyAdCountResetAt = today;
            await user.save();
        }

        const maxDaily = 10;
        const adsRemaining = Math.max(0, maxDaily - (user.dailyAdCount || 0));
        
        res.json({
            canWatch: adsRemaining > 0,
            adsRemaining,
            dailyLimit: maxDaily
        });

    } catch (error) {
        console.error('Can watch check error:', error);
        res.json({ canWatch: true, adsRemaining: 10 });
    }
});

// Main AdMob SSV Callback Endpoint
app.get('/api/admob/reward-callback', async (req, res) => {
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
            user_id,
            timestamp
        } = req.query;

        console.log('📺 AdMob Reward Callback received:', {
            ad_unit,
            reward_amount,
            reward_item,
            transaction_id,
            user_id,
            timestamp: new Date(parseInt(timestamp) || Date.now()).toISOString()
        });

        // Parse custom_data
        let customDataParsed = {};
        try {
            customDataParsed = JSON.parse(decodeURIComponent(custom_data || '{}'));
        } catch (e) {
            if (custom_data) {
                customDataParsed = { email: custom_data };
            }
        }

        const userEmail = (customDataParsed.email || user_id || '').toLowerCase();
        const rewardType = customDataParsed.rewardType || reward_item || 'credits';
        const amount = parseInt(reward_amount) || customDataParsed.amount || 10;
        const txnId = transaction_id || customDataParsed.transactionId || `auto_${Date.now()}`;

        if (!userEmail) {
            console.error('❌ AdMob callback: No user identifier provided');
            return res.status(200).json({ success: false, error: 'Missing user identifier' });
        }

        // Find user
        const user = await User.findOne({ email: userEmail });
        if (!user) {
            console.error('❌ AdMob callback: User not found:', userEmail);
            return res.status(200).json({ success: false, error: 'User not found' });
        }

        // Initialize arrays if needed
        if (!user.adRewardTransactions) user.adRewardTransactions = [];
        if (!user.earnings) user.earnings = [];

        // Check for duplicate transaction
        const existingTxn = user.adRewardTransactions.find(t => t.transactionId === txnId);
        if (existingTxn) {
            console.log('⚠️ Duplicate transaction, already processed:', txnId);
            return res.status(200).json({
                success: true,
                message: 'Already rewarded',
                duplicate: true,
                transactionId: txnId
            });
        }

        // Apply reward based on type
        let rewardDetails = {};
        
        switch (rewardType) {
            case 'credits':
                user.credits = (user.credits || 0) + amount;
                rewardDetails = { credits: amount };
                break;

            case 'premium_time':
                const premiumHours = amount || 24;
                const currentPremiumEnd = user.premiumUntil ? new Date(user.premiumUntil) : new Date();
                const newPremiumEnd = new Date(Math.max(currentPremiumEnd.getTime(), Date.now()) + premiumHours * 60 * 60 * 1000);
                user.premiumUntil = newPremiumEnd;
                user.isPremium = true;
                rewardDetails = { premiumHours, premiumUntil: newPremiumEnd };
                break;

            case 'streak_freeze':
                user.streakFreezes = (user.streakFreezes || 0) + (amount || 1);
                rewardDetails = { streakFreezes: amount || 1 };
                break;

            case 'goal_slot':
                user.maxGoalSlots = (user.maxGoalSlots || 3) + (amount || 1);
                rewardDetails = { goalSlots: amount || 1, newTotal: user.maxGoalSlots };
                break;

            case 'real_money':
                const moneyAmount = amount / 100; // Convert cents to dollars
                user.realMoneyBalance = (user.realMoneyBalance || 0) + moneyAmount;
                user.totalEarnings = (user.totalEarnings || 0) + moneyAmount;
                rewardDetails = { realMoney: moneyAmount };
                
                // Add to earnings history
                user.earnings.push({
                    id: `earn_${Date.now()}`,
                    date: Date.now(),
                    amount: moneyAmount,
                    type: 'ad_reward',
                    status: 'completed',
                    description: 'Rewarded ad bonus',
                    reference: txnId
                });
                break;

            case 'xp_boost':
                user.totalXP = (user.totalXP || 0) + (amount * 10);
                rewardDetails = { xpAdded: amount * 10 };
                break;

            default:
                user.credits = (user.credits || 0) + amount;
                rewardDetails = { credits: amount };
        }

        // Log the transaction
        user.adRewardTransactions.push({
            transactionId: txnId,
            adUnit: ad_unit,
            adNetwork: ad_network,
            rewardType,
            amount,
            rewardDetails,
            timestamp: Date.now(),
            status: 'completed',
            ipAddress: req.headers['x-forwarded-for']?.split(',')[0] || req.ip,
            userAgent: req.headers['user-agent']
        });

        // Update ad count
        const today = new Date().setHours(0, 0, 0, 0);
        if (!user.dailyAdCountResetAt || user.dailyAdCountResetAt < today) {
            user.dailyAdCount = 1;
            user.dailyAdCountResetAt = today;
        } else {
            user.dailyAdCount = (user.dailyAdCount || 0) + 1;
        }
        
        user.totalAdsWatched = (user.totalAdsWatched || 0) + 1;
        user.lastAdWatchedAt = Date.now();

        // Keep only last 100 ad transactions
        if (user.adRewardTransactions.length > 100) {
            user.adRewardTransactions = user.adRewardTransactions.slice(-100);
        }

        await user.save();

        console.log('✅ AdMob reward applied:', {
            user: userEmail,
            rewardType,
            amount,
            transactionId: txnId,
            newBalance: {
                credits: user.credits,
                realMoney: user.realMoneyBalance,
                streakFreezes: user.streakFreezes
            }
        });

        res.status(200).json({
            success: true,
            rewardApplied: true,
            transactionId: txnId,
            rewardType,
            amount,
            rewardDetails,
            newBalance: {
                credits: user.credits,
                realMoney: user.realMoneyBalance,
                streakFreezes: user.streakFreezes,
                isPremium: user.isPremium
            }
        });

    } catch (error) {
        console.error('❌ AdMob callback error:', error);
        res.status(200).json({ success: false, error: error.message });
    }
});

// POST version of callback
app.post('/api/admob/reward-callback', async (req, res) => {
    req.query = { ...req.query, ...req.body };
    
    // Forward to GET handler
    const handler = app._router.stack.find(
        r => r.route?.path === '/api/admob/reward-callback' && r.route?.methods?.get
    );
    
    if (handler) {
        return handler.route.stack[0].handle(req, res);
    }
    
    res.status(500).json({ error: 'Handler not found' });
});

// Verify reward endpoint (called from client)
app.post('/api/admob/verify-reward', async (req, res) => {
    try {
        const { email, transactionId } = req.body;

        if (!email || !transactionId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email and transactionId are required' 
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const transaction = user.adRewardTransactions?.find(
            t => t.transactionId === transactionId
        );

        if (transaction) {
            res.json({
                success: true,
                rewarded: true,
                transaction: {
                    transactionId: transaction.transactionId,
                    rewardType: transaction.rewardType,
                    amount: transaction.amount,
                    timestamp: transaction.timestamp,
                    rewardDetails: transaction.rewardDetails
                },
                currentBalance: {
                    credits: user.credits,
                    realMoney: user.realMoneyBalance,
                    streakFreezes: user.streakFreezes,
                    isPremium: user.isPremium,
                    premiumUntil: user.premiumUntil
                }
            });
        } else {
            res.json({
                success: true,
                rewarded: false,
                message: 'Transaction not found yet, may still be processing'
            });
        }

    } catch (error) {
        console.error('Verify reward error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get user's ad reward history
app.get('/api/admob/history/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            totalAdsWatched: user.totalAdsWatched || 0,
            todayAdsWatched: user.dailyAdCount || 0,
            dailyLimit: 10,
            adsRemaining: Math.max(0, 10 - (user.dailyAdCount || 0)),
            lastAdWatchedAt: user.lastAdWatchedAt,
            recentTransactions: (user.adRewardTransactions || [])
                .slice(-20)
                .reverse()
                .map(t => ({
                    transactionId: t.transactionId,
                    rewardType: t.rewardType,
                    amount: t.amount,
                    timestamp: t.timestamp
                }))
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



