import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { User } from './models.js';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

dotenv.config();

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'injazi-secret-change-me';
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const ADGEM_APP_ID = process.env.ADGEM_APP_ID;
const ADGEM_POSTBACK_KEY = process.env.ADGEM_POSTBACK_KEY;

// ============================================
// AI PROXY ENDPOINTS
// ============================================

// Generic Groq completion endpoint
app.post('/api/ai/completion', async (req, res) => {
    try {
        if (!GROQ_API_KEY) {
            return res.status(500).json({ error: 'AI service not configured' });
        }

        const { messages, jsonMode = false, maxTokens = 4096, temperature = 0.7 } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array required' });
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
                temperature,
                max_tokens: maxTokens,
                ...(jsonMode && { response_format: { type: "json_object" } })
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error('Groq API error:', data.error);
            return res.status(500).json({ error: data.error.message || 'AI request failed' });
        }

        const content = data.choices?.[0]?.message?.content || '';
        res.json({ content });

    } catch (error) {
        console.error('AI completion error:', error);
        res.status(500).json({ error: 'AI service unavailable' });
    }
});

// Convenience endpoint for task generation
app.post('/api/ai/generate-tasks', async (req, res) => {
    try {
        if (!GROQ_API_KEY) {
            return res.status(500).json({ error: 'AI service not configured' });
        }

        const { goal, day, userProfile = '', checkIn = '' } = req.body;

        if (!goal || !day) {
            return res.status(400).json({ error: 'Goal and day required' });
        }

        const systemPrompt = `You are an expert task coach creating highly actionable daily tasks. 

RULES FOR GOOD TASKS:
1. Title: Clear, specific action (e.g., "Create Emergency Fund Spreadsheet" not "Check finances")
2. Description: MUST include:
   - Exact steps to complete the task
   - Specific tools, apps, websites, or resources to use
   - What "done" looks like (success criteria)
   - Pro tips if relevant

Be specific. Be actionable. Include real tools and steps.`;

        const userPrompt = `Create 3 highly detailed tasks for Day ${day} of: "${goal.title}" (${goal.category}).
${checkIn ? `\nUser's update: "${checkIn}"` : ''}
${userProfile ? `\nAbout user: ${userProfile}` : ''}

Requirements:
- Task 1: Quick win (15-20 min, EASY) - Something they can start immediately
- Task 2: Core work (30-45 min, MEDIUM) - Main progress task for the day  
- Task 3: Deep work (45-60 min, HARD) - Challenging task that moves the needle

Each description must have specific steps and tools/resources.

Return ONLY valid JSON:
{"tasks": [
  {"title": "Quick Win Task", "description": "Detailed steps...", "estimatedTimeMinutes": 15, "difficulty": "EASY"},
  {"title": "Core Work Task", "description": "Detailed steps...", "estimatedTimeMinutes": 35, "difficulty": "MEDIUM"},
  {"title": "Deep Work Task", "description": "Detailed steps...", "estimatedTimeMinutes": 50, "difficulty": "HARD"}
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
            console.error('Groq task generation error:', data.error);
            return res.status(500).json({ error: 'Task generation failed' });
        }

        const content = data.choices?.[0]?.message?.content || '';
        
        try {
            const parsed = JSON.parse(content);
            const tasks = parsed.tasks || parsed;
            res.json({ tasks: Array.isArray(tasks) ? tasks : [] });
        } catch {
            res.status(500).json({ error: 'Failed to parse AI response' });
        }

    } catch (error) {
        console.error('Task generation error:', error);
        res.status(500).json({ error: 'Task generation unavailable' });
    }
});

// Chat endpoint
app.post('/api/ai/chat', async (req, res) => {
    try {
        if (!GROQ_API_KEY) {
            return res.status(500).json({ error: 'AI service not configured' });
        }

        const { goal, history = [], message, userProfile = '', currentTasks = [] } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message required' });
        }

        const taskList = currentTasks.map(t => `- ${t.title} (${t.status})`).join('\n');

        const systemPrompt = `You are "The Guide" - a supportive AI coach helping someone achieve "${goal?.title || 'their goal'}".

Your personality:
- Warm, encouraging, but practical
- Give specific actionable advice, not generic motivation
- Keep responses concise (2-4 sentences unless they ask for detail)
- Reference their specific tasks and goal when relevant
- Ask follow-up questions to understand their challenges

User's current tasks:
${taskList || 'No tasks yet'}

${userProfile ? `About them: ${userProfile}` : ''}`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-8).map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.text
            })),
            { role: 'user', content: message }
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

        const content = data.choices?.[0]?.message?.content || "I'm here to help. What would you like to work on?";
        res.json({ response: content });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Chat unavailable' });
    }
});

// Curriculum generation endpoint
app.post('/api/ai/curriculum', async (req, res) => {
    try {
        if (!GROQ_API_KEY) {
            return res.status(500).json({ error: 'AI service not configured' });
        }

        const { goal } = req.body;

        if (!goal) {
            return res.status(400).json({ error: 'Goal required' });
        }

        const prompt = `Create a 4-phase learning curriculum for: "${goal.title}"

Each phase should have exactly 3 lessons. Make lessons specific and practical.

Return ONLY this JSON:
{"chapters": [
  {
    "id": "ch-1",
    "title": "Phase 1: Foundation",
    "lessons": [
      {"id": "l1", "title": "Specific Lesson Title", "duration": "10 min", "isLocked": false, "description": "What you'll learn"},
      {"id": "l2", "title": "Specific Lesson Title", "duration": "12 min", "isLocked": false, "description": "What you'll learn"},
      {"id": "l3", "title": "Specific Lesson Title", "duration": "10 min", "isLocked": false, "description": "What you'll learn"}
    ],
    "quiz": []
  },
  {
    "id": "ch-2", 
    "title": "Phase 2: Building Skills",
    "lessons": [
      {"id": "l4", "title": "Lesson Title", "duration": "15 min", "isLocked": false, "description": "Description"},
      {"id": "l5", "title": "Lesson Title", "duration": "12 min", "isLocked": false, "description": "Description"},
      {"id": "l6", "title": "Lesson Title", "duration": "10 min", "isLocked": false, "description": "Description"}
    ],
    "quiz": []
  },
  {
    "id": "ch-3",
    "title": "Phase 3: Advanced Techniques",
    "lessons": [
      {"id": "l7", "title": "Lesson Title", "duration": "15 min", "isLocked": false, "description": "Description"},
      {"id": "l8", "title": "Lesson Title", "duration": "12 min", "isLocked": false, "description": "Description"},
      {"id": "l9", "title": "Lesson Title", "duration": "15 min", "isLocked": false, "description": "Description"}
    ],
    "quiz": []
  },
  {
    "id": "ch-4",
    "title": "Phase 4: Mastery & Beyond",
    "lessons": [
      {"id": "l10", "title": "Lesson Title", "duration": "10 min", "isLocked": false, "description": "Description"},
      {"id": "l11", "title": "Lesson Title", "duration": "12 min", "isLocked": false, "description": "Description"},
      {"id": "l12", "title": "Lesson Title", "duration": "10 min", "isLocked": false, "description": "Description"}
    ],
    "quiz": []
  }
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
                    { role: 'system', content: 'You are an expert curriculum designer. Create structured learning paths with practical lessons.' },
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
            const chapters = parsed.chapters || parsed;
            res.json({ chapters: Array.isArray(chapters) ? chapters : [] });
        } catch {
            res.json({ chapters: [] });
        }

    } catch (error) {
        console.error('Curriculum error:', error);
        res.status(500).json({ error: 'Curriculum generation unavailable' });
    }
});

// Temporary storage for pending verifications
const pendingUsers = new Map();
const RESEND_COOLDOWN = 5 * 60 * 1000; // 5 minutes
const CODE_EXPIRY = 15 * 60 * 1000; // 15 minutes

// CORS setup
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

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

const generateToken = (userId) => jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30d' });

const generateVerificationCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'InJazi API Running',
        pendingRegistrations: pendingUsers.size
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// ============================================
// REGISTER - Creates pending user & returns code
// Email is sent from FRONTEND via EmailJS
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

        // Check if user exists
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists. Please log in.' });
        }

        // Check cooldown
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
        
        // Store pending user
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

        console.log(`📝 Pending: ${normalizedEmail}, code: ${verificationCode}`);

        // Return code to frontend - frontend will send email via EmailJS
        return res.json({ 
            success: true,
            code: verificationCode, // Frontend needs this to send email
            name: name.trim(),
            email: normalizedEmail,
            message: 'Verification code generated'
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Server error. Please try again.' });
    }
});

// ============================================
// LOGIN
// ============================================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check if pending verification
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

// ============================================
// VERIFY EMAIL
// ============================================
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

        // Create user in database
        const user = new User({
            ...pending.userData,
            isEmailVerified: true
        });

        await user.save();
        pendingUsers.delete(normalizedEmail);

        console.log('✅ User verified:', normalizedEmail);

        const token = generateToken(user._id);
        const userObj = user.toObject();
        delete userObj.password;

        res.json({ success: true, user: userObj, token });

    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ message: 'Server error. Please try again.' });
    }
});

// ============================================
// RESEND CODE
// ============================================
app.post('/api/auth/resend', async (req, res) => {
    try {
        const { email } = req.body;
        const normalizedEmail = email.toLowerCase().trim();

        const pending = pendingUsers.get(normalizedEmail);
        
        if (!pending) {
            return res.status(400).json({ message: 'No pending verification. Please register again.' });
        }

        // Check cooldown
        const timeSinceLastSent = Date.now() - pending.lastSentAt;
        if (timeSinceLastSent < RESEND_COOLDOWN) {
            const timeRemaining = Math.ceil((RESEND_COOLDOWN - timeSinceLastSent) / 1000);
            return res.status(400).json({ 
                message: `Please wait ${Math.ceil(timeRemaining / 60)} minutes.`,
                cooldownRemaining: timeRemaining
            });
        }

        // Generate new code
        const newCode = generateVerificationCode();
        pending.code = newCode;
        pending.expiresAt = Date.now() + CODE_EXPIRY;
        pending.lastSentAt = Date.now();
        pendingUsers.set(normalizedEmail, pending);

        console.log(`📝 Resend: ${normalizedEmail}, code: ${newCode}`);

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

// ============================================
// FORGOT PASSWORD
// ============================================
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const normalizedEmail = email.toLowerCase().trim();

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.json({ success: true, message: 'If email exists, code was sent.' });
        }

        // Check cooldown
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

        console.log(`📝 Password reset: ${normalizedEmail}, code: ${resetCode}`);

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

// ============================================
// RESET PASSWORD
// ============================================
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

        console.log('✅ Password reset:', normalizedEmail);

        res.json({ success: true, message: 'Password reset successfully.' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});

// ============================================
// SYNC & USER ENDPOINTS (keep existing)
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

// Cleanup expired pending users
setInterval(() => {
    const now = Date.now();
    for (const [email, data] of pendingUsers.entries()) {
        if (data.expiresAt < now) {
            pendingUsers.delete(email);
        }
    }
}, 10 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

