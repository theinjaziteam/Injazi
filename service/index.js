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
const JWT_SECRET = process.env.JWT_SECRET || 'injazi-secret';
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

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

// ============================================
// HEALTH ENDPOINTS
// ============================================
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'InJazi API Running',
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// ============================================
// AUTH ENDPOINT
// ============================================
app.post('/api/auth', async (req, res) => {
    try {
        const { email, password, name, country, isRegister } = req.body;

        if (isRegister) {
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ message: 'User already exists' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const user = new User({
                email,
                password: hashedPassword,
                name: name || 'Architect',
                country: country || 'Unknown',
                createdAt: Date.now()
            });

            await user.save();
            const token = generateToken(user._id);
            const userObj = user.toObject();
            delete userObj.password;

            return res.json({ user: userObj, token });
        } else {
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

            return res.json({ user: userObj, token });
        }
    } catch (error) {
        console.error('Auth error:', error);
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
            return res.json({ status: 'error', offers: [], message: 'AdGem not configured' });
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
                // Remove completed offer from cached offers
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
            credits: user.credits,
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
    console.log(`🎮 AdGem configured: ${ADGEM_APP_ID ? 'Yes' : 'No'}`);
});
