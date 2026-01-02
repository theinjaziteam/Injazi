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
        authUrl: 'https://accounts.shopify.com/oauth/authorize',
        tokenUrl: 'https://accounts.shopify.com/oauth/token',
        scopes: 'read_products write_products read_orders write_orders read_customers read_analytics',
        getClientId: () => process.env.SHOPIFY_CLIENT_ID,
        getClientSecret: () => process.env.SHOPIFY_CLIENT_SECRET
    },
    tiktok: {
        name: 'TikTok',
        authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
        tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
        scopes: 'user.info.basic,video.list,video.upload,video.publish',
        getClientId: () => process.env.TIKTOK_CLIENT_KEY,
        getClientSecret: () => process.env.TIKTOK_CLIENT_SECRET
    },
    meta: {
        name: 'Meta (Facebook/Instagram)',
        authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
        scopes: 'email,public_profile,pages_show_list,instagram_basic,instagram_content_publish',
        getClientId: () => process.env.META_APP_ID,
        getClientSecret: () => process.env.META_APP_SECRET
    },
    google: {
        name: 'Google',
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/analytics.readonly',
        getClientId: () => process.env.GOOGLE_CLIENT_ID,
        getClientSecret: () => process.env.GOOGLE_CLIENT_SECRET
    },
    klaviyo: {
        name: 'Klaviyo',
        authUrl: 'https://www.klaviyo.com/oauth/authorize',
        tokenUrl: 'https://a.klaviyo.com/oauth/token',
        scopes: 'campaigns:read campaigns:write lists:read lists:write',
        getClientId: () => process.env.KLAVIYO_CLIENT_ID,
        getClientSecret: () => process.env.KLAVIYO_CLIENT_SECRET
    },
    twitter: {
        name: 'Twitter/X',
        authUrl: 'https://twitter.com/i/oauth2/authorize',
        tokenUrl: 'https://api.twitter.com/2/oauth2/token',
        scopes: 'tweet.read tweet.write users.read offline.access',
        getClientId: () => process.env.TWITTER_CLIENT_ID,
        getClientSecret: () => process.env.TWITTER_CLIENT_SECRET
    },
    spotify: {
        name: 'Spotify',
        authUrl: 'https://accounts.spotify.com/authorize',
        tokenUrl: 'https://accounts.spotify.com/api/token',
        scopes: 'user-read-private user-read-email',
        getClientId: () => process.env.SPOTIFY_CLIENT_ID,
        getClientSecret: () => process.env.SPOTIFY_CLIENT_SECRET
    },
    github: {
        name: 'GitHub',
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scopes: 'user repo',
        getClientId: () => process.env.GITHUB_CLIENT_ID,
        getClientSecret: () => process.env.GITHUB_CLIENT_SECRET
    },
    discord: {
        name: 'Discord',
        authUrl: 'https://discord.com/api/oauth2/authorize',
        tokenUrl: 'https://discord.com/api/oauth2/token',
        scopes: 'identify email',
        getClientId: () => process.env.DISCORD_CLIENT_ID,
        getClientSecret: () => process.env.DISCORD_CLIENT_SECRET
    },
    notion: {
        name: 'Notion',
        authUrl: 'https://api.notion.com/v1/oauth/authorize',
        tokenUrl: 'https://api.notion.com/v1/oauth/token',
        scopes: '',
        getClientId: () => process.env.NOTION_CLIENT_ID,
        getClientSecret: () => process.env.NOTION_CLIENT_SECRET
    },
    slack: {
        name: 'Slack',
        authUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        scopes: 'channels:read chat:write users:read',
        getClientId: () => process.env.SLACK_CLIENT_ID,
        getClientSecret: () => process.env.SLACK_CLIENT_SECRET
    },
    fitbit: {
        name: 'Fitbit',
        authUrl: 'https://www.fitbit.com/oauth2/authorize',
        tokenUrl: 'https://api.fitbit.com/oauth2/token',
        scopes: 'activity heartrate profile sleep',
        getClientId: () => process.env.FITBIT_CLIENT_ID,
        getClientSecret: () => process.env.FITBIT_CLIENT_SECRET
    },
    strava: {
        name: 'Strava',
        authUrl: 'https://www.strava.com/oauth/authorize',
        tokenUrl: 'https://www.strava.com/oauth/token',
        scopes: 'read,activity:read_all,profile:read_all',
        getClientId: () => process.env.STRAVA_CLIENT_ID,
        getClientSecret: () => process.env.STRAVA_CLIENT_SECRET
    },
    stripe: {
        name: 'Stripe',
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
        .filter(([_, config]) => config.getClientId())
        .map(([id, config]) => ({
            id,
            name: config.name,
            configured: !!(config.getClientId() && config.getClientSecret())
        }));
    
    res.json({ success: true, platforms });
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
                slack: 'https://slack.com/api/users.identity'
            };

            if (userInfoEndpoints[platform]) {
                try {
                    const userResponse = await fetch(userInfoEndpoints[platform], {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    platformUserInfo = await userResponse.json();
                } catch (e) {
                    console.log('Could not fetch user info:', e.message);
                }
            }
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
            platformUserId: platformUserInfo?.id || platformUserInfo?.sub || null,
            platformUsername: platformUserInfo?.name || platformUserInfo?.login || platformUserInfo?.display_name || null,
            platformEmail: platformUserInfo?.email || null,
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

        user.connectedAccounts = (user.connectedAccounts || []).filter(acc => acc.platform !== platform);
        await user.save();

        console.log(`🔌 ${platform} disconnected for ${email}`);
        res.json({ success: true, message: `${platform} disconnected` });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
