// service/oauthRoutes.js
import express from 'express';
import { User } from './models.js';

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://injazi.vercel.app';
const BACKEND_URL = process.env.BACKEND_URL || 'https://injazi-backend.onrender.com';

// ============================================
// OAUTH CONFIGURATIONS (40+ Platforms)
// ============================================

const OAUTH_CONFIGS = {
    // E-COMMERCE
    shopify: {
        name: 'Shopify',
        category: 'ecommerce',
        icon: '🛒',
        description: 'E-commerce platform',
        authUrl: 'https://accounts.shopify.com/oauth/authorize',
        tokenUrl: 'https://accounts.shopify.com/oauth/token',
        scopes: 'read_products write_products read_orders write_orders read_customers read_analytics',
        getClientId: () => process.env.SHOPIFY_CLIENT_ID,
        getClientSecret: () => process.env.SHOPIFY_CLIENT_SECRET
    },

    // EMAIL MARKETING
    klaviyo: {
        name: 'Klaviyo',
        category: 'marketing',
        icon: '📧',
        description: 'Email marketing & SMS',
        type: 'api_key', // Uses API key, not OAuth
        getApiKey: () => process.env.KLAVIYO_API_KEY,
        getPublicKey: () => process.env.KLAVIYO_PUBLIC_KEY
    },
    mailchimp: {
        name: 'Mailchimp',
        category: 'marketing',
        icon: '🐵',
        description: 'Email marketing',
        authUrl: 'https://login.mailchimp.com/oauth2/authorize',
        tokenUrl: 'https://login.mailchimp.com/oauth2/token',
        scopes: '',
        getClientId: () => process.env.MAILCHIMP_CLIENT_ID,
        getClientSecret: () => process.env.MAILCHIMP_CLIENT_SECRET
    },

    // SOCIAL MEDIA
    tiktok: {
        name: 'TikTok',
        category: 'social',
        icon: '🎵',
        description: 'Short-form video',
        authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
        tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
        scopes: 'user.info.basic,video.list,video.upload,video.publish',
        getClientId: () => process.env.TIKTOK_CLIENT_KEY,
        getClientSecret: () => process.env.TIKTOK_CLIENT_SECRET
    },
    meta: {
        name: 'Meta',
        category: 'social',
        icon: '📘',
        description: 'Facebook & Instagram',
        authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
        scopes: 'email,public_profile,pages_show_list,instagram_basic,instagram_content_publish',
        getClientId: () => process.env.META_APP_ID,
        getClientSecret: () => process.env.META_APP_SECRET
    },
    twitter: {
        name: 'Twitter/X',
        category: 'social',
        icon: '🐦',
        description: 'Social media',
        authUrl: 'https://twitter.com/i/oauth2/authorize',
        tokenUrl: 'https://api.twitter.com/2/oauth2/token',
        scopes: 'tweet.read tweet.write users.read offline.access',
        getClientId: () => process.env.TWITTER_CLIENT_ID,
        getClientSecret: () => process.env.TWITTER_CLIENT_SECRET
    },
    pinterest: {
        name: 'Pinterest',
        category: 'social',
        icon: '📌',
        description: 'Visual discovery',
        authUrl: 'https://www.pinterest.com/oauth/',
        tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
        scopes: 'boards:read boards:write pins:read pins:write user_accounts:read',
        getClientId: () => process.env.PINTEREST_APP_ID,
        getClientSecret: () => process.env.PINTEREST_APP_SECRET
    },
    linkedin: {
        name: 'LinkedIn',
        category: 'social',
        icon: '💼',
        description: 'Professional network',
        authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
        scopes: 'r_liteprofile r_emailaddress w_member_social',
        getClientId: () => process.env.LINKEDIN_CLIENT_ID,
        getClientSecret: () => process.env.LINKEDIN_CLIENT_SECRET
    },

    // GOOGLE SERVICES
    google: {
        name: 'Google',
        category: 'marketing',
        icon: '🔍',
        description: 'YouTube, Analytics, Ads',
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
        getClientId: () => process.env.GOOGLE_CLIENT_ID,
        getClientSecret: () => process.env.GOOGLE_CLIENT_SECRET
    },
    google_fit: {
        name: 'Google Fit',
        category: 'health',
        icon: '❤️',
        description: 'Fitness tracking',
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: 'https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.body.read https://www.googleapis.com/auth/fitness.heart_rate.read',
        getClientId: () => process.env.GOOGLE_CLIENT_ID,
        getClientSecret: () => process.env.GOOGLE_CLIENT_SECRET
    },

    // ENTERTAINMENT
    spotify: {
        name: 'Spotify',
        category: 'entertainment',
        icon: '🎧',
        description: 'Music streaming',
        authUrl: 'https://accounts.spotify.com/authorize',
        tokenUrl: 'https://accounts.spotify.com/api/token',
        scopes: 'user-read-private user-read-email user-top-read user-read-recently-played',
        getClientId: () => process.env.SPOTIFY_CLIENT_ID,
        getClientSecret: () => process.env.SPOTIFY_CLIENT_SECRET
    },

    // PRODUCTIVITY
    notion: {
        name: 'Notion',
        category: 'productivity',
        icon: '📝',
        description: 'Notes & docs',
        authUrl: 'https://api.notion.com/v1/oauth/authorize',
        tokenUrl: 'https://api.notion.com/v1/oauth/token',
        scopes: '',
        getClientId: () => process.env.NOTION_CLIENT_ID,
        getClientSecret: () => process.env.NOTION_CLIENT_SECRET
    },
    slack: {
        name: 'Slack',
        category: 'productivity',
        icon: '💬',
        description: 'Team communication',
        authUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        scopes: 'channels:read chat:write users:read',
        getClientId: () => process.env.SLACK_CLIENT_ID,
        getClientSecret: () => process.env.SLACK_CLIENT_SECRET
    },
    discord: {
        name: 'Discord',
        category: 'productivity',
        icon: '🎮',
        description: 'Community chat',
        authUrl: 'https://discord.com/api/oauth2/authorize',
        tokenUrl: 'https://discord.com/api/oauth2/token',
        scopes: 'identify email guilds',
        getClientId: () => process.env.DISCORD_CLIENT_ID,
        getClientSecret: () => process.env.DISCORD_CLIENT_SECRET
    },
    trello: {
        name: 'Trello',
        category: 'productivity',
        icon: '📋',
        description: 'Project boards',
        authUrl: 'https://trello.com/1/authorize',
        tokenUrl: null,
        scopes: 'read,write',
        getClientId: () => process.env.TRELLO_API_KEY,
        getClientSecret: () => process.env.TRELLO_API_SECRET
    },
    asana: {
        name: 'Asana',
        category: 'productivity',
        icon: '✅',
        description: 'Project management',
        authUrl: 'https://app.asana.com/-/oauth_authorize',
        tokenUrl: 'https://app.asana.com/-/oauth_token',
        scopes: 'default',
        getClientId: () => process.env.ASANA_CLIENT_ID,
        getClientSecret: () => process.env.ASANA_CLIENT_SECRET
    },
    todoist: {
        name: 'Todoist',
        category: 'productivity',
        icon: '☑️',
        description: 'Task management',
        authUrl: 'https://todoist.com/oauth/authorize',
        tokenUrl: 'https://todoist.com/oauth/access_token',
        scopes: 'data:read_write',
        getClientId: () => process.env.TODOIST_CLIENT_ID,
        getClientSecret: () => process.env.TODOIST_CLIENT_SECRET
    },

    // DEVELOPER
    github: {
        name: 'GitHub',
        category: 'developer',
        icon: '🐙',
        description: 'Code repository',
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scopes: 'user repo',
        getClientId: () => process.env.GITHUB_CLIENT_ID,
        getClientSecret: () => process.env.GITHUB_CLIENT_SECRET
    },

    // HEALTH & FITNESS
    fitbit: {
        name: 'Fitbit',
        category: 'health',
        icon: '⌚',
        description: 'Fitness tracking',
        authUrl: 'https://www.fitbit.com/oauth2/authorize',
        tokenUrl: 'https://api.fitbit.com/oauth2/token',
        scopes: 'activity heartrate profile sleep weight',
        getClientId: () => process.env.FITBIT_CLIENT_ID,
        getClientSecret: () => process.env.FITBIT_CLIENT_SECRET
    },
    strava: {
        name: 'Strava',
        category: 'health',
        icon: '🚴',
        description: 'Activity tracking',
        authUrl: 'https://www.strava.com/oauth/authorize',
        tokenUrl: 'https://www.strava.com/oauth/token',
        scopes: 'read,activity:read_all,profile:read_all',
        getClientId: () => process.env.STRAVA_CLIENT_ID,
        getClientSecret: () => process.env.STRAVA_CLIENT_SECRET
    },
    withings: {
        name: 'Withings',
        category: 'health',
        icon: '⚖️',
        description: 'Health devices',
        authUrl: 'https://account.withings.com/oauth2_user/authorize2',
        tokenUrl: 'https://wbsapi.withings.net/v2/oauth2',
        scopes: 'user.info,user.metrics,user.activity',
        getClientId: () => process.env.WITHINGS_CLIENT_ID,
        getClientSecret: () => process.env.WITHINGS_CLIENT_SECRET
    },
    oura: {
        name: 'Oura Ring',
        category: 'health',
        icon: '💍',
        description: 'Sleep & recovery',
        authUrl: 'https://cloud.ouraring.com/oauth/authorize',
        tokenUrl: 'https://api.ouraring.com/oauth/token',
        scopes: 'personal daily heartrate workout tag session',
        getClientId: () => process.env.OURA_CLIENT_ID,
        getClientSecret: () => process.env.OURA_CLIENT_SECRET
    },
    whoop: {
        name: 'WHOOP',
        category: 'health',
        icon: '🏋️',
        description: 'Performance tracking',
        authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
        tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
        scopes: 'read:profile read:recovery read:cycles read:workout read:sleep',
        getClientId: () => process.env.WHOOP_CLIENT_ID,
        getClientSecret: () => process.env.WHOOP_CLIENT_SECRET
    },

    // FINANCE & PAYMENTS
    stripe: {
        name: 'Stripe',
        category: 'finance',
        icon: '💳',
        description: 'Payments',
        authUrl: 'https://connect.stripe.com/oauth/authorize',
        tokenUrl: 'https://connect.stripe.com/oauth/token',
        scopes: 'read_write',
        getClientId: () => process.env.STRIPE_CLIENT_ID,
        getClientSecret: () => process.env.STRIPE_SECRET_KEY
    },
    paypal: {
        name: 'PayPal',
        category: 'finance',
        icon: '💰',
        description: 'Payments',
        authUrl: 'https://www.paypal.com/signin/authorize',
        tokenUrl: 'https://api-m.paypal.com/v1/oauth2/token',
        scopes: 'openid profile email',
        getClientId: () => process.env.PAYPAL_CLIENT_ID,
        getClientSecret: () => process.env.PAYPAL_CLIENT_SECRET
    },
    quickbooks: {
        name: 'QuickBooks',
        category: 'finance',
        icon: '📊',
        description: 'Accounting',
        authUrl: 'https://appcenter.intuit.com/connect/oauth2',
        tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        scopes: 'com.intuit.quickbooks.accounting',
        getClientId: () => process.env.QUICKBOOKS_CLIENT_ID,
        getClientSecret: () => process.env.QUICKBOOKS_CLIENT_SECRET
    },
    xero: {
        name: 'Xero',
        category: 'finance',
        icon: '📈',
        description: 'Accounting',
        authUrl: 'https://login.xero.com/identity/connect/authorize',
        tokenUrl: 'https://identity.xero.com/connect/token',
        scopes: 'openid profile email accounting.transactions accounting.contacts',
        getClientId: () => process.env.XERO_CLIENT_ID,
        getClientSecret: () => process.env.XERO_CLIENT_SECRET
    },
    coinbase: {
        name: 'Coinbase',
        category: 'finance',
        icon: '₿',
        description: 'Crypto',
        authUrl: 'https://www.coinbase.com/oauth/authorize',
        tokenUrl: 'https://api.coinbase.com/oauth/token',
        scopes: 'wallet:accounts:read wallet:transactions:read',
        getClientId: () => process.env.COINBASE_CLIENT_ID,
        getClientSecret: () => process.env.COINBASE_CLIENT_SECRET
    },

    // CRM & SALES
    hubspot: {
        name: 'HubSpot',
        category: 'crm',
        icon: '🧲',
        description: 'CRM & Marketing',
        authUrl: 'https://app.hubspot.com/oauth/authorize',
        tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
        scopes: 'crm.objects.contacts.read crm.objects.contacts.write',
        getClientId: () => process.env.HUBSPOT_CLIENT_ID,
        getClientSecret: () => process.env.HUBSPOT_CLIENT_SECRET
    },
    salesforce: {
        name: 'Salesforce',
        category: 'crm',
        icon: '☁️',
        description: 'CRM',
        authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
        tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
        scopes: 'api refresh_token',
        getClientId: () => process.env.SALESFORCE_CLIENT_ID,
        getClientSecret: () => process.env.SALESFORCE_CLIENT_SECRET
    },

    // CLOUD & STORAGE
    dropbox: {
        name: 'Dropbox',
        category: 'storage',
        icon: '📁',
        description: 'Cloud storage',
        authUrl: 'https://www.dropbox.com/oauth2/authorize',
        tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
        scopes: '',
        getClientId: () => process.env.DROPBOX_APP_KEY,
        getClientSecret: () => process.env.DROPBOX_APP_SECRET
    },

    // COMMUNICATION
    zoom: {
        name: 'Zoom',
        category: 'communication',
        icon: '📹',
        description: 'Video meetings',
        authUrl: 'https://zoom.us/oauth/authorize',
        tokenUrl: 'https://zoom.us/oauth/token',
        scopes: 'user:read meeting:read meeting:write',
        getClientId: () => process.env.ZOOM_CLIENT_ID,
        getClientSecret: () => process.env.ZOOM_CLIENT_SECRET
    },
    calendly: {
        name: 'Calendly',
        category: 'communication',
        icon: '📅',
        description: 'Scheduling',
        authUrl: 'https://auth.calendly.com/oauth/authorize',
        tokenUrl: 'https://auth.calendly.com/oauth/token',
        scopes: '',
        getClientId: () => process.env.CALENDLY_CLIENT_ID,
        getClientSecret: () => process.env.CALENDLY_CLIENT_SECRET
    }
};

// ============================================
// GET AVAILABLE PLATFORMS
// ============================================

router.get('/platforms', (req, res) => {
    const platforms = Object.entries(OAUTH_CONFIGS)
        .filter(([_, config]) => {
            if (config.type === 'api_key') {
                return config.getApiKey && config.getApiKey();
            }
            return config.getClientId && config.getClientId();
        })
        .map(([id, config]) => ({
            id,
            name: config.name,
            category: config.category || 'other',
            icon: config.icon || '🔗',
            description: config.description || '',
            type: config.type || 'oauth',
            configured: config.type === 'api_key'
                ? !!(config.getApiKey && config.getApiKey())
                : !!(config.getClientId && config.getClientId() && config.getClientSecret && config.getClientSecret())
        }));
    
    res.json({ success: true, platforms });
});

// ============================================
// GET ALL PLATFORMS (including unconfigured)
// ============================================

router.get('/platforms/all', (req, res) => {
    const platforms = Object.entries(OAUTH_CONFIGS).map(([id, config]) => ({
        id,
        name: config.name,
        category: config.category || 'other',
        icon: config.icon || '🔗',
        description: config.description || '',
        type: config.type || 'oauth',
        configured: config.type === 'api_key'
            ? !!(config.getApiKey && config.getApiKey())
            : !!(config.getClientId && config.getClientId() && config.getClientSecret && config.getClientSecret())
    }));
    
    res.json({ success: true, platforms });
});

// ============================================
// KLAVIYO API KEY CONNECTION
// ============================================

router.post('/klaviyo/connect', async (req, res) => {
    try {
        const { email, apiKey, publicKey } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }

        const klaviyoApiKey = apiKey || process.env.KLAVIYO_API_KEY;
        const klaviyoPublicKey = publicKey || process.env.KLAVIYO_PUBLIC_KEY;

        if (!klaviyoApiKey) {
            return res.status(400).json({ error: 'Klaviyo API key not configured' });
        }

        // Verify the API key
        const verifyResponse = await fetch('https://a.klaviyo.com/api/accounts/', {
            headers: {
                'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
                'revision': '2024-02-15'
            }
        });

        if (!verifyResponse.ok) {
            return res.status(400).json({ error: 'Invalid Klaviyo API key' });
        }

        const accountData = await verifyResponse.json();

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!user.connectedAccounts) {
            user.connectedAccounts = [];
        }

        user.connectedAccounts = user.connectedAccounts.filter(acc => acc.platform !== 'klaviyo');

        user.connectedAccounts.push({
            platform: 'klaviyo',
            platformUserId: accountData.data?.[0]?.id || null,
            platformUsername: accountData.data?.[0]?.attributes?.contact_information?.organization_name || 'Klaviyo Account',
            accessToken: klaviyoApiKey,
            publicKey: klaviyoPublicKey,
            tokenType: 'api_key',
            isConnected: true,
            connectedAt: Date.now(),
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

        if (config.type === 'api_key') {
            return res.status(400).json({ 
                error: `${config.name} uses API keys. Use POST /api/oauth/${platform}/connect instead.`,
                type: 'api_key'
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
        } else if (platform === 'google' || platform === 'google_fit') {
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
        const clientId = config.getClientId();
        const clientSecret = config.getClientSecret();
        const redirectUri = `${BACKEND_URL}/api/oauth/${platform}/callback`;

        let tokenResponse;
        let tokens;

        // Platform-specific token exchange
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
        } else if (platform === 'stripe') {
            tokenResponse = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_secret: clientSecret,
                    code,
                    grant_type: 'authorization_code'
                })
            });
        } else if (platform === 'discord') {
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
        } else if (platform === 'slack') {
            tokenResponse = await fetch(config.tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
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
            throw new Error(tokens.error_description || tokens.error);
        }

        console.log(`✅ Tokens received for ${platform}`);

        // Get user info
        let platformUserInfo = null;
        const accessToken = tokens.access_token;

        if (accessToken) {
            const userInfoEndpoints = {
                meta: 'https://graph.facebook.com/me?fields=id,name,email,picture',
                google: 'https://www.googleapis.com/oauth2/v2/userinfo',
                google_fit: 'https://www.googleapis.com/oauth2/v2/userinfo',
                github: 'https://api.github.com/user',
                discord: 'https://discord.com/api/users/@me',
                spotify: 'https://api.spotify.com/v1/me',
                slack: 'https://slack.com/api/users.identity',
                twitter: 'https://api.twitter.com/2/users/me',
                strava: 'https://www.strava.com/api/v3/athlete',
                fitbit: 'https://api.fitbit.com/1/user/-/profile.json',
                linkedin: 'https://api.linkedin.com/v2/userinfo'
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

        user.connectedAccounts = user.connectedAccounts.filter(acc => acc.platform !== platform);

        user.connectedAccounts.push({
            platform,
            platformUserId: platformUserInfo?.id || platformUserInfo?.sub || platformUserInfo?.data?.id || null,
            platformUsername: platformUserInfo?.name || platformUserInfo?.login || platformUserInfo?.display_name || platformUserInfo?.username || platformUserInfo?.data?.username || null,
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
        if (!account || !account.refreshToken) {
            return res.status(400).json({ error: 'No refresh token available' });
        }

        const config = OAUTH_CONFIGS[platform];
        if (!config || !config.tokenUrl) {
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

        // Update tokens
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
