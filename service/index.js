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
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'InJazi <noreply@injazi.app>';

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
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
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
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
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
        emailConfigured: !!RESEND_API_KEY,
        adgemConfigured: !!ADGEM_APP_ID
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' 
    });
});

// ============================================
// AUTH ENDPOINT - WITH EMAIL VERIFICATION
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
            delete userObj.passwordResetCode;

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
// SYNC ENDPOINT
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
// USER ENDPOINT
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

// ============================================
// ADGEM OFFERS API - Fetch offers from AdGem
// ============================================
app.get('/api/adgem/offers', async (req, res) => {
    try {
        const { email } = req.query;
        
        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }

        if (!ADGEM_APP_ID) {
            console.log('⚠️ AdGem not configured');
            return res.json({ status: 'success', offers: [], message: 'AdGem not configured' });
        }

        // Get user's IP and user agent for AdGem API
        const userIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '0.0.0.0';
        const userAgent = req.headers['user-agent'] || '';
        
        // Detect platform
        let platform = 'web';
        if (/android/i.test(userAgent)) platform = 'android';
        else if (/iphone|ipad|ipod/i.test(userAgent)) platform = 'ios';

        // Build AdGem API URL
        const adgemUrl = new URL('https://api.adgem.com/v1/wall/json');
        adgemUrl.searchParams.append('appid', ADGEM_APP_ID);
        adgemUrl.searchParams.append('playerid', email);
        adgemUrl.searchParams.append('ip', userIp);
        adgemUrl.searchParams.append('useragent', userAgent);
        adgemUrl.searchParams.append('platform', platform);
        adgemUrl.searchParams.append('limit', '15');

        console.log('📡 Fetching AdGem offers for:', email);

        const response = await fetch(adgemUrl.toString());
        const data = await response.json();

        if (data.status !== 'success' || !data.data?.[0]?.data) {
            console.log('⚠️ AdGem API returned no offers');
            return res.json({ status: 'success', offers: [] });
        }

        // Transform AdGem offers to our format
        const offers = data.data[0].data.map(offer => ({
            id: `adgem-${offer.store_id || offer.name?.replace(/\s+/g, '-').toLowerCase() || Date.now()}`,
            storeId: offer.store_id,
            trackingType: offer.tracking_type,
            epc: offer.epc,
            icon: offer.icon,
            name: offer.name,
            clickUrl: offer.url,
            instructions: offer.instructions,
            description: offer.description,
            shortDescription: offer.short_description,
            category1: offer.category_1,
            category2: offer.category_2,
            amount: offer.amount,
            completionDifficulty: offer.completion_difficulty,
            renderSticker: offer.render_sticker,
            stickerText: offer.offer_sticker_text_1,
            stickerColor: offer.offer_sticker_color_1,
            os: offer.OS
        }));

        // Get user's completed transactions to filter out completed offers
        const user = await User.findOne({ email });
        const completedOfferIds = (user?.adgemTransactions || []).map(t => t.offerId);
        
        // Filter out already completed offers
        const availableOffers = offers.filter(o => !completedOfferIds.includes(o.storeId));

        // Cache offers in user document
        await User.findOneAndUpdate(
            { email },
            { 
                adgemOffers: availableOffers,
                adgemLastSync: Date.now()
            }
        );

        console.log(`✅ Fetched ${availableOffers.length} offers for ${email}`);

        res.json({ 
            status: 'success', 
            offers: availableOffers,
            wall: data.data[0].wall
        });

    } catch (error) {
        console.error('❌ AdGem offers error:', error);
        res.status(500).json({ status: 'error', offers: [], message: error.message });
    }
});

// ============================================
// ADGEM POSTBACK - Receives conversion notifications
// ============================================
app.get('/api/adgem/postback', async (req, res) => {
    try {
        console.log('📥 AdGem Postback Received:', req.query);

        const {
            player_id,
            amount,
            payout,
            transaction_id,
            campaign_id,
            offer_id,
            offer_name,
            goal_id,
            goal_name,
            store_id
        } = req.query;

        // Validate required fields
        if (!player_id || !transaction_id) {
            console.error('❌ Missing required fields');
            return res.status(400).send('Missing required fields');
        }

        // Find user
        const user = await User.findOne({ email: player_id });
        
        if (!user) {
            console.error('❌ User not found:', player_id);
            return res.status(404).send('User not found');
        }

        // Check for duplicate transaction
        const existingTransaction = user.adgemTransactions?.find(
            t => t.transactionId === transaction_id
        );
        
        if (existingTransaction) {
            console.log('⚠️ Duplicate transaction:', transaction_id);
            return res.status(200).send('OK');
        }

        const creditsToAdd = parseInt(amount) || 0;
        const payoutAmount = parseFloat(payout) || 0;

        // Credit user and record transaction
        await User.findOneAndUpdate(
            { email: player_id },
            {
                $inc: { credits: creditsToAdd },
                $push: {
                    adgemTransactions: {
                        transactionId: transaction_id,
                        visibleId: transaction_id.substring(0, 8),
                        campaignId: campaign_id,
                        offerId: store_id || offer_id,
                        offerName: offer_name || 'Offer',
                        credits: creditsToAdd,
                        payout: payoutAmount,
                        goalId: goal_id,
                        goalName: goal_name,
                        completedAt: Date.now()
                    }
                },
                $pull: {
                    adgemOffers: { storeId: store_id }
                }
            }
        );

        console.log(`✅ Credited ${creditsToAdd} credits to ${player_id} for: ${offer_name}`);
        
        res.status(200).send('OK');

    } catch (error) {
        console.error('❌ AdGem Postback Error:', error);
        res.status(500).send('Server error');
    }
});

// ============================================
// DEBUG ENDPOINT
// ============================================
app.get('/api/debug/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        res.json({
            email: user.email,
            name: user.name,
            isEmailVerified: user.isEmailVerified,
            credits: user.credits,
            currentDay: user.currentDay,
            hasGoal: !!user.goal,
            adgemOffersCount: user.adgemOffers?.length || 0,
            adgemTransactionsCount: user.adgemTransactions?.length || 0,
            adgemLastSync: user.adgemLastSync,
            recentTransactions: (user.adgemTransactions || []).slice(-5)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    res.status(500).json({ message: err.message });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Allowed origins:`, allowedOrigins);
    console.log(`📧 Email service: ${RESEND_API_KEY ? 'Configured' : 'Not configured'}`);
    console.log(`🎮 AdGem: ${ADGEM_APP_ID ? 'Configured' : 'Not configured'}`);
});
