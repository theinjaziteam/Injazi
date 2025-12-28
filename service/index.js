import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { User } from './models.js';

dotenv.config();

const app = express();

// Config
const JWT_SECRET = process.env.JWT_SECRET || 'injazi-secret-change-me';
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const RESEND_API_KEY = process.env.RESEND_API_KEY; // Email service
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@injazi.app';

// AdGem Config
const ADGEM_APP_ID = process.env.ADGEM_APP_ID;
const ADGEM_POSTBACK_KEY = process.env.ADGEM_POSTBACK_KEY;

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

// MongoDB Connection
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// Generate Token
const generateToken = (userId) => jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30d' });

// Generate 6-digit verification code
const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// ============================================
// EMAIL SENDING FUNCTION (using Resend)
// ============================================
async function sendEmail(to, subject, html) {
    if (!RESEND_API_KEY) {
        console.log('⚠️ No RESEND_API_KEY - Email not sent');
        console.log(`📧 Would send to ${to}: ${subject}`);
        return { success: true, mock: true };
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to: [to],
                subject: subject,
                html: html
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('❌ Email send failed:', data);
            return { success: false, error: data };
        }

        console.log('✅ Email sent to:', to);
        return { success: true, data };
    } catch (error) {
        console.error('❌ Email error:', error);
        return { success: false, error: error.message };
    }
}

// Email templates
const getVerificationEmailHtml = (code, name) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Inter', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: #171738; padding: 40px 30px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 32px; font-weight: 900; letter-spacing: -1px; }
        .header p { color: rgba(255,255,255,0.6); margin: 10px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; }
        .content { padding: 40px 30px; text-align: center; }
        .code { background: linear-gradient(135deg, #171738 0%, #3423A6 100%); color: white; font-size: 36px; font-weight: 900; letter-spacing: 8px; padding: 20px 40px; border-radius: 16px; display: inline-block; margin: 20px 0; }
        .text { color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 20px; }
        .footer { background: #f9f9f9; padding: 20px 30px; text-align: center; color: #999; font-size: 11px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>INJAZI</h1>
            <p>Success Architecture AI</p>
        </div>
        <div class="content">
            <p class="text">Hey ${name || 'there'}! 👋</p>
            <p class="text">Welcome to InJazi! Use this code to verify your email:</p>
            <div class="code">${code}</div>
            <p class="text">This code expires in <strong>15 minutes</strong>.</p>
            <p class="text" style="color: #999; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
        <div class="footer">
            © ${new Date().getFullYear()} InJazi. All rights reserved.
        </div>
    </div>
</body>
</html>
`;

const getPasswordResetEmailHtml = (code, name) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Inter', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: #171738; padding: 40px 30px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 32px; font-weight: 900; letter-spacing: -1px; }
        .header p { color: rgba(255,255,255,0.6); margin: 10px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; }
        .content { padding: 40px 30px; text-align: center; }
        .code { background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); color: white; font-size: 36px; font-weight: 900; letter-spacing: 8px; padding: 20px 40px; border-radius: 16px; display: inline-block; margin: 20px 0; }
        .text { color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 20px; }
        .footer { background: #f9f9f9; padding: 20px 30px; text-align: center; color: #999; font-size: 11px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>INJAZI</h1>
            <p>Password Reset</p>
        </div>
        <div class="content">
            <p class="text">Hey ${name || 'there'},</p>
            <p class="text">You requested a password reset. Use this code:</p>
            <div class="code">${code}</div>
            <p class="text">This code expires in <strong>15 minutes</strong>.</p>
            <p class="text" style="color: #EF4444; font-size: 12px;">⚠️ If you didn't request this, please secure your account.</p>
        </div>
        <div class="footer">
            © ${new Date().getFullYear()} InJazi. All rights reserved.
        </div>
    </div>
</body>
</html>
`;

// ============================================
// HEALTH ENDPOINTS
// ============================================
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'InJazi API Running',
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        emailConfigured: !!RESEND_API_KEY
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// ============================================
// AUTH ENDPOINT - UPDATED WITH VERIFICATION
// ============================================
app.post('/api/auth', async (req, res) => {
    try {
        const { email, password, name, country, isRegister } = req.body;

        if (isRegister) {
            // REGISTRATION
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ message: 'User already exists' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const verificationCode = generateVerificationCode();
            
            const user = new User({
                email,
                password: hashedPassword,
                name: name || 'Architect',
                country: country || 'Unknown',
                createdAt: Date.now(),
                isEmailVerified: false,
                emailVerificationCode: verificationCode,
                emailVerificationExpires: Date.now() + 15 * 60 * 1000 // 15 minutes
            });

            await user.save();

            // Send verification email
            await sendEmail(
                email,
                'Verify your InJazi account',
                getVerificationEmailHtml(verificationCode, name)
            );

            const token = generateToken(user._id);
            const userObj = user.toObject();
            delete userObj.password;
            delete userObj.emailVerificationCode;

            return res.json({ 
                user: userObj, 
                token,
                requiresVerification: true,
                message: 'Verification code sent to your email'
            });
        } else {
            // LOGIN
            const user = await User.findOne({ email });
            if (!user) {
                return res.status(400).json({ message: 'User not found' });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: 'Invalid credentials' });
            }

            const token = generateToken(user._id);
            const userObj = user.toObject();
            delete userObj.password;
            delete userObj.emailVerificationCode;
            delete userObj.passwordResetCode;

            return res.json({ 
                user: userObj, 
                token,
                requiresVerification: !user.isEmailVerified
            });
        }
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ message: error.message });
    }
});

// ============================================
// VERIFY EMAIL ENDPOINT
// ============================================
app.post('/api/auth/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        if (user.isEmailVerified) {
            return res.json({ success: true, message: 'Email already verified' });
        }

        if (user.emailVerificationCode !== code) {
            return res.status(400).json({ message: 'Invalid verification code' });
        }

        if (user.emailVerificationExpires < Date.now()) {
            return res.status(400).json({ message: 'Verification code expired. Request a new one.' });
        }

        // Mark as verified
        user.isEmailVerified = true;
        user.emailVerificationCode = undefined;
        user.emailVerificationExpires = undefined;
        await user.save();

        console.log('✅ Email verified for:', email);

        res.json({ success: true, message: 'Email verified successfully' });
    } catch (error) {
        console.error('Verify email error:', error);
        res.status(500).json({ message: error.message });
    }
});

// ============================================
// RESEND VERIFICATION CODE
// ============================================
app.post('/api/auth/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        if (user.isEmailVerified) {
            return res.json({ success: true, message: 'Email already verified' });
        }

        const newCode = generateVerificationCode();
        user.emailVerificationCode = newCode;
        user.emailVerificationExpires = Date.now() + 15 * 60 * 1000;
        await user.save();

        await sendEmail(
            email,
            'Your new InJazi verification code',
            getVerificationEmailHtml(newCode, user.name)
        );

        res.json({ success: true, message: 'New verification code sent' });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ message: error.message });
    }
});

// ============================================
// FORGOT PASSWORD - REQUEST RESET
// ============================================
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            // Don't reveal if user exists
            return res.json({ success: true, message: 'If this email exists, a reset code was sent.' });
        }

        const resetCode = generateVerificationCode();
        user.passwordResetCode = resetCode;
        user.passwordResetExpires = Date.now() + 15 * 60 * 1000;
        await user.save();

        await sendEmail(
            email,
            'Reset your InJazi password',
            getPasswordResetEmailHtml(resetCode, user.name)
        );

        res.json({ success: true, message: 'If this email exists, a reset code was sent.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: error.message });
    }
});

// ============================================
// RESET PASSWORD WITH CODE
// ============================================
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        if (user.passwordResetCode !== code) {
            return res.status(400).json({ message: 'Invalid reset code' });
        }

        if (user.passwordResetExpires < Date.now()) {
            return res.status(400).json({ message: 'Reset code expired. Request a new one.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        user.passwordResetCode = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        console.log('✅ Password reset for:', email);

        res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: error.message });
    }
});

// ============================================
// SYNC ENDPOINT (existing)
// ============================================
app.post('/api/sync', async (req, res) => {
    try {
        const userData = req.body;
        if (!userData.email) {
            return res.status(400).json({ message: 'Email required' });
        }

        const updateData = { ...userData };
        delete updateData._id;
        delete updateData.password;
        delete updateData.__v;
        delete updateData.emailVerificationCode;
        delete updateData.passwordResetCode;

        Object.keys(updateData).forEach(key => {
            if (updateData[key] === undefined) delete updateData[key];
        });

        await User.findOneAndUpdate(
            { email: userData.email },
            updateData,
            { upsert: false, new: true }
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ message: error.message });
    }
});

// ============================================
// USER ENDPOINT (existing)
// ============================================
app.get('/api/user/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const userObj = user.toObject();
        delete userObj.password;
        delete userObj.emailVerificationCode;
        delete userObj.passwordResetCode;
        res.json(userObj);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ... rest of your existing endpoints (AdGem, etc.) ...

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📧 Email service: ${RESEND_API_KEY ? 'Configured' : 'Not configured'}`);
});
