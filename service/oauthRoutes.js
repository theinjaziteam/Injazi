// service/oauthRoutes.js
// Express routes for OAuth

import express from 'express';
import { 
    generateAuthUrl, 
    exchangeCodeForTokens, 
    refreshAccessToken,
    getUserInfo,
    getAvailablePlatforms,
    OAUTH_CONFIGS 
} from './oauth.js';
import { User } from './models.js';

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://injazi.vercel.app';

// ============================================
// GET AVAILABLE PLATFORMS
// ============================================

router.get('/platforms', (req, res) => {
    try {
        const platforms = getAvailablePlatforms();
        res.json({ success: true, platforms });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET OAUTH URL
// ============================================

router.get('/:platform/url', async (req, res) => {
    try {
        const { platform } = req.params;
        const { email, shop } = req.query;

        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }

        const config = OAUTH_CONFIGS[platform];
        if (!config) {
            return res.status(400).json({ error: `Unknown platform: ${platform}` });
        }

        if (!config.authUrl) {
            return res.status(400).json({ 
                error: `${platform} doesn't support standard OAuth. Use SDK integration.` 
            });
        }

        // Create state with user info
        const state = Buffer.from(JSON.stringify({ 
            email, 
            platform,
            timestamp: Date.now()
        })).toString('base64');

        const url = generateAuthUrl(platform, state, { email, shop });

        res.json({ success: true, url, platform: config.name });

    } catch (error) {
        console.error('OAuth URL error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// OAUTH CALLBACK HANDLER
// ============================================

router.get('/:platform/callback', async (req, res) => {
    const { platform } = req.params;
    const { code, state, error: oauthError, error_description } = req.query;

    console.log(`📥 OAuth callback for ${platform}`);

    // Handle OAuth errors
    if (oauthError) {
        console.error(`OAuth error for ${platform}:`, oauthError, error_description);
        return res.redirect(`${FRONTEND_URL}?oauth=error&platform=${platform}&error=${encodeURIComponent(error_description || oauthError)}`);
    }

    if (!code || !state) {
        return res.redirect(`${FRONTEND_URL}?oauth=error&platform=${platform}&error=missing_code_or_state`);
    }

    try {
        // Decode state
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        const { email } = stateData;

        if (!email) {
            throw new Error('No email in state');
        }

        // Exchange code for tokens
        console.log(`🔄 Exchanging code for tokens (${platform})...`);
        const tokens = await exchangeCodeForTokens(platform, code);
        console.log(`✅ Tokens received for ${platform}`);

        // Get user info from platform if possible
        let platformUserInfo = null;
        if (tokens.access_token) {
            platformUserInfo = await getUserInfo(platform, tokens.access_token);
        }

        // Calculate token expiry
        const expiresAt = tokens.expires_in 
            ? Date.now() + (tokens.expires_in * 1000)
            : null;

        // Prepare connected account data
        const connectedAccount = {
            platform,
            platformUserId: platformUserInfo?.id || platformUserInfo?.sub || null,
            platformUsername: platformUserInfo?.name || platformUserInfo?.username || platformUserInfo?.login || null,
            platformEmail: platformUserInfo?.email || null,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            expiresAt,
            tokenType: tokens.token_type || 'Bearer',
            scope: tokens.scope || null,
            isConnected: true,
            connectedAt: Date.now(),
            lastRefreshedAt: Date.now(),
            metadata: {
                ...platformUserInfo,
                raw_token_response: {
                    expires_in: tokens.expires_in,
                    token_type: tokens.token_type,
                    scope: tokens.scope
                }
            }
        };

        // Update user's connected accounts
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            throw new Error('User not found');
        }

        // Initialize connectedAccounts array if needed
        if (!user.connectedAccounts) {
            user.connectedAccounts = [];
        }

        // Remove existing connection for this platform
        user.connectedAccounts = user.connectedAccounts.filter(
            acc => acc.platform !== platform
        );

        // Add new connection
        user.connectedAccounts.push(connectedAccount);

        await user.save();

        console.log(`✅ ${platform} connected for user ${email}`);

        // Redirect back to frontend with success
        res.redirect(`${FRONTEND_URL}?oauth=success&platform=${platform}`);

    } catch (error) {
        console.error(`OAuth callback error for ${platform}:`, error);
        res.redirect(`${FRONTEND_URL}?oauth=error&platform=${platform}&error=${encodeURIComponent(error.message)}`);
    }
});

// ============================================
// GET USER'S CONNECTED ACCOUNTS
// ============================================

router.get('/connected/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Return connected accounts without sensitive tokens
        const accounts = (user.connectedAccounts || []).map(acc => ({
            platform: acc.platform,
            platformUsername: acc.platformUsername,
            platformEmail: acc.platformEmail,
            isConnected: acc.isConnected,
            connectedAt: acc.connectedAt,
            expiresAt: acc.expiresAt,
            isExpired: acc.expiresAt ? Date.now() > acc.expiresAt : false
        }));

        res.json({ success: true, accounts });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// DISCONNECT PLATFORM
// ============================================

router.post('/disconnect', async (req, res) => {
    try {
        const { email, platform } = req.body;

        if (!email || !platform) {
            return res.status(400).json({ error: 'Email and platform required' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.connectedAccounts = (user.connectedAccounts || []).filter(
            acc => acc.platform !== platform
        );

        await user.save();

        console.log(`🔌 ${platform} disconnected for user ${email}`);

        res.json({ success: true, message: `${platform} disconnected` });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// REFRESH TOKEN
// ============================================

router.post('/refresh', async (req, res) => {
    try {
        const { email, platform } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const account = (user.connectedAccounts || []).find(
            acc => acc.platform === platform
        );

        if (!account) {
            return res.status(404).json({ error: `${platform} not connected` });
        }

        if (!account.refreshToken) {
            return res.status(400).json({ error: 'No refresh token available' });
        }

        // Refresh the token
        const newTokens = await refreshAccessToken(platform, account.refreshToken);

        // Update the account
        account.accessToken = newTokens.access_token;
        if (newTokens.refresh_token) {
            account.refreshToken = newTokens.refresh_token;
        }
        if (newTokens.expires_in) {
            account.expiresAt = Date.now() + (newTokens.expires_in * 1000);
        }
        account.lastRefreshedAt = Date.now();

        await user.save();

        res.json({ 
            success: true, 
            message: 'Token refreshed',
            expiresAt: account.expiresAt
        });

    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// GET ACCESS TOKEN (for internal use)
// ============================================

router.post('/get-token', async (req, res) => {
    try {
        const { email, platform } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const account = (user.connectedAccounts || []).find(
            acc => acc.platform === platform && acc.isConnected
        );

        if (!account) {
            return res.status(404).json({ error: `${platform} not connected` });
        }

        // Check if token is expired and needs refresh
        if (account.expiresAt && Date.now() > account.expiresAt - 300000) { // 5 min buffer
            if (account.refreshToken) {
                try {
                    const newTokens = await refreshAccessToken(platform, account.refreshToken);
                    account.accessToken = newTokens.access_token;
                    if (newTokens.refresh_token) {
                        account.refreshToken = newTokens.refresh_token;
                    }
                    if (newTokens.expires_in) {
                        account.expiresAt = Date.now() + (newTokens.expires_in * 1000);
                    }
                    account.lastRefreshedAt = Date.now();
                    await user.save();
                } catch (refreshError) {
                    console.error('Auto-refresh failed:', refreshError);
                    return res.status(401).json({ 
                        error: 'Token expired and refresh failed',
                        needsReconnect: true
                    });
                }
            } else {
                return res.status(401).json({ 
                    error: 'Token expired',
                    needsReconnect: true
                });
            }
        }

        res.json({ 
            success: true, 
            accessToken: account.accessToken,
            expiresAt: account.expiresAt
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
