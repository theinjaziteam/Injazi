// service/oauthRoutes.js
import express from 'express';
import { User } from './models.js';

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://injazi.vercel.app';
const BACKEND_URL = process.env.BACKEND_URL || 'https://injazi-backend.onrender.com';

// ============================================
// OAUTH CONFIGURATIONS
// ============================================

const OAUTH_CONFIGS = {
    shopify: {
        name: 'Shopify',
        type: 'oauth',
        authUrl: 'https://accounts.shopify.com/oauth/authorize',
        tokenUrl: 'https://accounts.shopify.com/oauth/token',
        scopes: 'read_products write_products read_orders write_orders read_customers read_analytics',
        getClientId: () => process.env.SHOPIFY_CLIENT_ID,
        getClientSecret: () => process.env.SHOPIFY_CLIENT_SECRET
    },
    tiktok: {
        name: 'TikTok',
        type: 'oauth',
        authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
        tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
        scopes: 'user.info.basic,video.list,video.upload,video.publish',
        getClientId: () => process.env.TIKTOK_CLIENT_KEY,
        getClientSecret: () => process.env.TIKTOK_CLIENT_SECRET
    },
    meta: {
        name: 'Meta (Facebook/Instagram)',
        type: 'oauth',
        authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
        scopes: 'email,public_profile,pages_show_list,instagram_basic,instagram_content_publish',
        getClientId: () => process.env.META_APP_ID,
        getClientSecret: () => process.env.META_APP_SECRET
    },
    google: {
        name: 'Google',
        type: 'oauth',
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/analytics.readonly',
        getClientId: () => process.env.GOOGLE_CLIENT_ID,
        getClientSecret: () => process.env.GOOGLE_CLIENT_SECRET
    },
    // KLAVIYO - API Key based (not OAuth)
    klaviyo: {
        name: 'Klaviyo',
        type: 'api_key',
        getApiKey: () => process.env.KLAVIYO_API_KEY,
        getPublicKey: () => process.env.KLAVIYO_PUBLIC_KEY
    },
    twitter: {
        name: 'Twitter/X',
        type: 'oauth',
        authUrl: 'https://twitter.com/i/oauth2/authorize',
        tokenUrl: 'https://api.twitter.com/2/oauth2/token',
        scopes: 'tweet.read tweet.write users.read offline.access',
        getClientId: () => process.env.TWITTER_CLIENT_ID,
        getClientSecret: () => process.env.TWITTER_CLIENT_SECRET
    },
    spotify: {
        name: 'Spotify',
        type: 'oauth',
        authUrl: 'https://accounts.spotify.com/authorize',
        tokenUrl: 'https://accounts.spotify.com/api/token',
        scopes: 'user-read-private user-read-email',
        getClientId: () => process.env.SPOTIFY_CLIENT_ID,
        getClientSecret: () => process.env.SPOTIFY_CLIENT_SECRET
    },
    github: {
        name: 'GitHub',
        type: 'oauth',
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scopes: 'user repo',
        getClientId: () => process.env.GITHUB_CLIENT_ID,
        getClientSecret: () => process.env.GITHUB_CLIENT_SECRET
    },
    discord: {
        name: 'Discord',
        type: 'oauth',
        authUrl: 'https://discord.com/api/oauth2/authorize',
        tokenUrl: 'https://discord.com/api/oauth2/token',
        scopes: 'identify email',
        getClientId: () => process.env.DISCORD_CLIENT_ID,
        getClientSecret: () => process.env.DISCORD_CLIENT_SECRET
    },
    notion: {
        name: 'Notion',
        type: 'oauth',
        authUrl: 'https://api.notion.com/v1/oauth/authorize',
        tokenUrl: 'https://api.notion.com/v1/oauth/token',
        scopes: '',
        getClientId: () => process.env.NOTION_CLIENT_ID,
        getClientSecret: () => process.env.NOTION_CLIENT_SECRET
    },
    slack: {
        name: 'Slack',
        type: 'oauth',
        authUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        scopes: 'channels:read chat:write users:read',
        getClientId: () => process.env.SLACK_CLIENT_ID,
        getClientSecret: () => process.env.SLACK_CLIENT_SECRET
    },
    fitbit: {
        name: 'Fitbit',
        type: 'oauth',
        authUrl: 'https://www.fitbit.com/oauth2/authorize',
        tokenUrl: 'https://api.fitbit.com/oauth2/token',
        scopes: 'activity heartrate profile sleep',
        getClientId: () => process.env.FITBIT_CLIENT_ID,
        getClientSecret: () => process.env.FITBIT_CLIENT_SECRET
    },
    strava: {
        name: 'Strava',
        type: 'oauth',
        authUrl: 'https://www.strava.com/oauth/authorize',
        tokenUrl: 'https://www.strava.com/oauth/token',
        scopes: 'read,activity:read_all,profile:read_all',
        getClientId: () => process.env.STRAVA_CLIENT_ID,
        getClientSecret: () => process.env.STRAVA_CLIENT_SECRET
    },
    stripe: {
        name: 'Stripe',
        type: 'oauth',
        authUrl: 'https://connect.stripe.com/oauth/authorize',
        tokenUrl: 'https://connect.stripe.com/oauth/token',
        scopes: 'read_write',
        getClientId: () => process.env.STRIPE_CLIENT_ID,
        getClientSecret: () => process.env.STRIPE_SECRET_KEY
    }
};

// ============================================
// GET AVAILABLE PLATFORMS
// ============================================

router.get('/platforms', (req, res) => {
    const platforms = Object.entries(OAUTH_CONFIGS)
        .filter(([key, config]) => {
            // For API key based services (like Klaviyo)
            if (config.type === 'api_key') {
                return config.getApiKey && config.getApiKey();
            }
            // For OAuth based services
            return config.getClientId && config.getClientId();
        })
        .map(([id, config]) => ({
            id,
            name: config.name,
            type: config.type || 'oauth',
            configured: config.type === 'api_key' 
                ? !!(config.getApiKey && config.getApiKey())
                : !!(config.getClientId && config.getClientId() && config.getClientSecret && config.getClientSecret())
        }));
    
    res.json({ success: true, platforms });
});

// ============================================
// KLAVIYO API KEY CONNECTION (Not OAuth)
// ============================================

router.post('/klaviyo/connect', async (req, res) => {
    try {
        const { email, apiKey, publicKey } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }

        // Use provided keys or fall back to environment variables
        const klaviyoApiKey = apiKey || process.env.KLAVIYO_API_KEY;
        const klaviyoPublicKey = publicKey || process.env.KLAVIYO_PUBLIC_KEY;

        if (!klaviyoApiKey) {
            return res.status(400).json({ error: 'Klaviyo API key not configured' });
        }

        // Verify the API key works by making a test request
        const verifyResponse = await fetch('https://a.klaviyo.com/api/accounts/', {
            headers: {
                'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
                'revision': '2024-02-15'
            }
        });

        if (!verifyResponse.ok) {
            const errorData = await verifyResponse.json().catch(() => ({}));
            console.error('Klaviyo verification failed:', errorData);
            return res.status(400).json({ error: 'Invalid Klaviyo API key' });
        }

        const accountData = await verifyResponse.json();

        // Save to user
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!user.connectedAccounts) {
            user.connectedAccounts = [];
        }

        // Remove existing Klaviyo connection
        user.connectedAccounts = user.connectedAccounts.filter(acc => acc.platform !== 'klaviyo');

        // Add new connection
        user.connectedAccounts.push({
            platform: 'klaviyo',
            platformUserId: accountData.data?.[0]?.id || null,
            platformUsername: accountData.data?.[0]?.attributes?.contact_information?.organization_name || 'Klaviyo Account',
            platformEmail: accountData.data?.[0]?.attributes?.contact_information?.default_sender_email || null,
            accessToken: klaviyoApiKey,
            refreshToken: klaviyoPublicKey || null,
            tokenType: 'api_key',
            isConnected: true,
            connectedAt: Date.now(),
            lastRefreshedAt: Date.now(),
            metadata: accountData.data?.[0]?.attributes || {}
        });

        await user.save();
        console.log(`✅ Klaviyo connected for ${email}`);

        res.json({ 
            success: true, 
            message: 'Klaviyo connected successfully',
            account: {
                platform: 'klaviyo',
                platformUsername: accountData.data?.[0]?.attributes?.contact_information?.organization_name || 'Klaviyo Account',
                isConnected: true
            }
        });

    } catch (error) {
        console.error('Klaviyo connect error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// GET OAUTH URL
// ============================================

router.get('/:platform/url', (req, res) => {
    try {
        const { platform } = req.params;
        const { email } = req.query;

        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }

        const config = OAUTH_CONFIGS[platform];
        if (!config) {
            return res.status(400).json({ error: `Unknown platform: ${platform}` });
        }

        // Handle API key based platforms differently
        if (config.type === 'api_key') {
            return res.status(400).json({ 
                error: `${config.name} uses API keys, not OAuth. Use POST /api/oauth/${platform}/connect instead.`,
                type: 'api_key',
                platform: platform
            });
        }

        const clientId = config.getClientId();
        if (!clientId) {
            return res.status(400).json({ error: `${platform} not configured` });
        }

        const redirectUri = `${BACKEND_URL}/api/oauth/${platform}/callback`;
        const state = Buffer.from(JSON.stringify({ email, platform, timestamp: Date.now() })).toString('base64');

        const params = new URLSearchParams({
            response_type: 'code',
            state
        });

        // Platform-specific parameters
        if (platform === 'tiktok') {
            params.set('client_key', clientId);
            params.set('scope', config.scopes);
            params.set('redirect_uri', redirectUri);
        } else if (platform === 'google') {
            params.set('client_id', clientId);
            params.set('redirect_uri', redirectUri);
            params.set('scope', config.scopes);
            params.set('access_type', 'offline');
            params.set('prompt', 'consent');
        } else if (platform === 'notion') {
            params.set('client_id', clientId);
            params.set('redirect_uri', redirectUri);
            params.set('owner', 'user');
        } else if (platform === 'twitter') {
            params.set('client_id', clientId);
            params.set('redirect_uri', redirectUri);
            params.set('scope', config.scopes);
            params.set('code_challenge', 'challenge');
            params.set('code_challenge_method', 'plain');
        } else if (platform === 'stripe') {
            params.set('client_id', clientId);
            params.set('redirect_uri', redirectUri);
            params.set('scope', config.scopes);
            params.set('response_type', 'code');
        } else {
            params.set('client_id', clientId);
            params.set('redirect_uri', redirectUri);
            if (config.scopes) {
                params.set('scope', config.scopes);
            }
        }

        const url = `${config.authUrl}?${params.toString()}`;
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

    if (oauthError) {
        console.error(`OAuth error for ${platform}:`, oauthError, error_description);
        return res.redirect(`${FRONTEND_URL}?oauth=error&platform=${platform}&error=${encodeURIComponent(error_description || oauthError)}`);
    }

    if (!code || !state) {
        return res.redirect(`${FRONTEND_URL}?oauth=error&platform=${platform}&error=missing_code`);
    }

    try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        const { email } = stateData;

        if (!email) {
            throw new Error('No email in state');
        }

        const config = OAUTH_CONFIGS[platform];
        
        if (!config || config.type === 'api_key') {
            throw new Error(`${platform} does not use OAuth callbacks`);
        }

        const clientId = config.getClientId();
        const clientSecret = config.getClientSecret();
        const redirectUri = `${BACKEND_URL}/api/oauth/${platform}/callback`;

        // Exchange code for tokens
        let tokenResponse;
        let tokens;

        if (platform === 'tiktok') {
            tokenResponse = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_key: clientId,
                    client_secret: clientSecret,
                    code,
                    grant_type: 'authorization_code',
                    redirect_uri: redirectUri
                })
            });
        } else if (platform === 'meta') {
            const metaUrl = `${config.tokenUrl}?client_id=${clientId}&client_secret=${clientSecret}&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`;
            tokenResponse = await fetch(metaUrl);
        } else if (platform === 'spotify' || platform === 'fitbit') {
            tokenResponse = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
                },
                body: new URLSearchParams({
                    code,
                    grant_type: 'authorization_code',
                    redirect_uri: redirectUri
                })
            });
        } else if (platform === 'notion') {
            tokenResponse = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
                },
                body: JSON.stringify({
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri
                })
            });
        } else if (platform === 'github') {
            tokenResponse = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    code,
                    redirect_uri: redirectUri
                })
            });
        } else if (platform === 'twitter') {
            tokenResponse = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
                },
                body: new URLSearchParams({
                    code,
                    grant_type: 'authorization_code',
                    redirect_uri: redirectUri,
                    code_verifier: 'challenge'
                })
            });
        } else if (platform === 'discord') {
            tokenResponse = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    code,
                    grant_type: 'authorization_code',
                    redirect_uri: redirectUri
                })
            });
        } else if (platform === 'slack') {
            tokenResponse = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    code,
                    redirect_uri: redirectUri
                })
            });
        } else if (platform === 'strava') {
            tokenResponse = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    code,
                    grant_type: 'authorization_code'
                })
            });
        } else if (platform === 'stripe') {
            tokenResponse = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Bearer ' + clientSecret
                },
                body: new URLSearchParams({
                    code,
                    grant_type: 'authorization_code'
                })
            });
        } else {
            tokenResponse = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    code,
                    grant_type: 'authorization_code',
                    redirect_uri: redirectUri
                })
            });
        }

        tokens = await tokenResponse.json();

        if (tokens.error) {
            console.error(`Token error for ${platform}:`, tokens);
            throw new Error(tokens.error_description || tokens.error);
        }

        console.log(`✅ Tokens received for ${platform}`);

        // Get user info if possible
        let platformUserInfo = null;
        const accessToken = tokens.access_token;

        if (accessToken) {
            const userInfoEndpoints = {
                meta: 'https://graph.facebook.com/me?fields=id,name,email,picture',
                google: 'https://www.googleapis.com/oauth2/v2/userinfo',
                github: 'https://api.github.com/user',
                discord: 'https://discord.com/api/users/@me',
                spotify: 'https://api.spotify.com/v1/me',
                slack: 'https://slack.com/api/users.identity',
                strava: 'https://www.strava.com/api/v3/athlete',
                fitbit: 'https://api.fitbit.com/1/user/-/profile.json'
            };

            if (userInfoEndpoints[platform]) {
                try {
                    const userResponse = await fetch(userInfoEndpoints[platform], {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    platformUserInfo = await userResponse.json();
                    
                    // Handle nested user data
                    if (platform === 'slack' && platformUserInfo.user) {
                        platformUserInfo = platformUserInfo.user;
                    }
                    if (platform === 'fitbit' && platformUserInfo.user) {
                        platformUserInfo = platformUserInfo.user;
                    }
                } catch (e) {
                    console.log('Could not fetch user info:', e.message);
                }
            }

            // TikTok has different user info endpoint
            if (platform === 'tiktok' && tokens.open_id) {
                try {
                    const userResponse = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    const userData = await userResponse.json();
                    platformUserInfo = userData.data?.user;
                } catch (e) {
                    console.log('Could not fetch TikTok user info:', e.message);
                }
            }
        }

        // For Strava, user info comes with token response
        if (platform === 'strava' && tokens.athlete) {
            platformUserInfo = tokens.athlete;
        }

        // Save to database
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            throw new Error('User not found');
        }

        if (!user.connectedAccounts) {
            user.connectedAccounts = [];
        }

        // Remove existing connection
        user.connectedAccounts = user.connectedAccounts.filter(acc => acc.platform !== platform);

        // Add new connection
        user.connectedAccounts.push({
            platform,
            platformUserId: platformUserInfo?.id || platformUserInfo?.sub || platformUserInfo?.open_id || tokens.stripe_user_id || null,
            platformUsername: platformUserInfo?.name || platformUserInfo?.login || platformUserInfo?.display_name || platformUserInfo?.displayName || platformUserInfo?.firstname || null,
            platformEmail: platformUserInfo?.email || null,
            platformAvatar: platformUserInfo?.picture?.data?.url || platformUserInfo?.avatar_url || platformUserInfo?.images?.[0]?.url || null,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            expiresAt: tokens.expires_in ? Date.now() + (tokens.expires_in * 1000) : null,
            tokenType: tokens.token_type || 'Bearer',
            scope: tokens.scope || null,
            isConnected: true,
            connectedAt: Date.now(),
            lastRefreshedAt: Date.now(),
            metadata: platformUserInfo
        });

        await user.save();
        console.log(`✅ ${platform} connected for ${email}`);

        res.redirect(`${FRONTEND_URL}?oauth=success&platform=${platform}`);

    } catch (error) {
        console.error(`OAuth callback error for ${platform}:`, error);
        res.redirect(`${FRONTEND_URL}?oauth=error&platform=${platform}&error=${encodeURIComponent(error.message)}`);
    }
});

// ============================================
// GET CONNECTED ACCOUNTS
// ============================================

router.get('/connected/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const accounts = (user.connectedAccounts || []).map(acc => ({
            platform: acc.platform,
            platformUsername: acc.platformUsername,
            platformEmail: acc.platformEmail,
            platformAvatar: acc.platformAvatar,
            isConnected: acc.isConnected,
            connectedAt: acc.connectedAt,
            expiresAt: acc.expiresAt,
            isExpired: acc.expiresAt ? Date.now() > acc.expiresAt : false,
            type: acc.tokenType === 'api_key' ? 'api_key' : 'oauth'
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

        user.connectedAccounts = (user.connectedAccounts || []).filter(acc => acc.platform !== platform);
        await user.save();

        console.log(`🔌 ${platform} disconnected for ${email}`);
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

        if (!email || !platform) {
            return res.status(400).json({ error: 'Email and platform required' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const account = user.connectedAccounts?.find(acc => acc.platform === platform);
        if (!account) {
            return res.status(404).json({ error: 'Account not connected' });
        }

        if (!account.refreshToken) {
            return res.status(400).json({ error: 'No refresh token available' });
        }

        const config = OAUTH_CONFIGS[platform];
        if (!config || config.type === 'api_key') {
            return res.status(400).json({ error: 'Platform does not support token refresh' });
        }

        const clientId = config.getClientId();
        const clientSecret = config.getClientSecret();

        let tokenResponse;

        if (platform === 'spotify' || platform === 'fitbit') {
            tokenResponse = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: account.refreshToken
                })
            });
        } else {
            tokenResponse = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'refresh_token',
                    refresh_token: account.refreshToken
                })
            });
        }

        const tokens = await tokenResponse.json();

        if (tokens.error) {
            throw new Error(tokens.error_description || tokens.error);
        }

        // Update account
        account.accessToken = tokens.access_token;
        if (tokens.refresh_token) {
            account.refreshToken = tokens.refresh_token;
        }
        account.expiresAt = tokens.expires_in ? Date.now() + (tokens.expires_in * 1000) : null;
        account.lastRefreshedAt = Date.now();

        await user.save();
        console.log(`🔄 Token refreshed for ${platform} - ${email}`);

        res.json({ success: true, message: 'Token refreshed' });

    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
