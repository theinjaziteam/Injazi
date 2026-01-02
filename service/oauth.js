// service/oauth.js
// Complete OAuth implementation for all platforms

import fetch from 'node-fetch';

// ============================================
// OAUTH CONFIGURATION
// ============================================

export const OAUTH_CONFIGS = {
    shopify: {
        name: 'Shopify',
        authUrl: 'https://accounts.shopify.com/oauth/authorize',
        tokenUrl: 'https://accounts.shopify.com/oauth/token',
        scopes: 'read_products write_products read_orders write_orders read_customers read_analytics read_inventory write_inventory',
        getClientId: () => process.env.SHOPIFY_CLIENT_ID,
        getClientSecret: () => process.env.SHOPIFY_CLIENT_SECRET,
        getRedirectUri: () => process.env.SHOPIFY_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/shopify/callback`
    },
    
    tiktok: {
        name: 'TikTok',
        authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
        tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
        scopes: 'user.info.basic,video.list,video.upload,video.publish',
        getClientId: () => process.env.TIKTOK_CLIENT_KEY,
        getClientSecret: () => process.env.TIKTOK_CLIENT_SECRET,
        getRedirectUri: () => process.env.TIKTOK_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/tiktok/callback`
    },
    
    meta: {
        name: 'Meta (Facebook/Instagram)',
        authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
        scopes: 'email,public_profile,pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish,instagram_manage_insights,ads_management,ads_read',
        getClientId: () => process.env.META_APP_ID,
        getClientSecret: () => process.env.META_APP_SECRET,
        getRedirectUri: () => process.env.META_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/meta/callback`
    },
    
    google: {
        name: 'Google (YouTube/Analytics)',
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/adwords',
        getClientId: () => process.env.GOOGLE_CLIENT_ID,
        getClientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
        getRedirectUri: () => process.env.GOOGLE_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/google/callback`
    },
    
    klaviyo: {
        name: 'Klaviyo',
        authUrl: 'https://www.klaviyo.com/oauth/authorize',
        tokenUrl: 'https://a.klaviyo.com/oauth/token',
        scopes: 'campaigns:read campaigns:write lists:read lists:write metrics:read profiles:read profiles:write',
        getClientId: () => process.env.KLAVIYO_CLIENT_ID,
        getClientSecret: () => process.env.KLAVIYO_CLIENT_SECRET,
        getRedirectUri: () => process.env.KLAVIYO_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/klaviyo/callback`
    },
    
    mailchimp: {
        name: 'Mailchimp',
        authUrl: 'https://login.mailchimp.com/oauth2/authorize',
        tokenUrl: 'https://login.mailchimp.com/oauth2/token',
        scopes: '',
        getClientId: () => process.env.MAILCHIMP_CLIENT_ID,
        getClientSecret: () => process.env.MAILCHIMP_CLIENT_SECRET,
        getRedirectUri: () => process.env.MAILCHIMP_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/mailchimp/callback`
    },
    
    twitter: {
        name: 'Twitter/X',
        authUrl: 'https://twitter.com/i/oauth2/authorize',
        tokenUrl: 'https://api.twitter.com/2/oauth2/token',
        scopes: 'tweet.read tweet.write users.read offline.access',
        getClientId: () => process.env.TWITTER_CLIENT_ID,
        getClientSecret: () => process.env.TWITTER_CLIENT_SECRET,
        getRedirectUri: () => process.env.TWITTER_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/twitter/callback`
    },
    
    pinterest: {
        name: 'Pinterest',
        authUrl: 'https://www.pinterest.com/oauth/',
        tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
        scopes: 'boards:read boards:write pins:read pins:write user_accounts:read',
        getClientId: () => process.env.PINTEREST_APP_ID,
        getClientSecret: () => process.env.PINTEREST_APP_SECRET,
        getRedirectUri: () => process.env.PINTEREST_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/pinterest/callback`
    },
    
    linkedin: {
        name: 'LinkedIn',
        authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
        scopes: 'r_liteprofile r_emailaddress w_member_social',
        getClientId: () => process.env.LINKEDIN_CLIENT_ID,
        getClientSecret: () => process.env.LINKEDIN_CLIENT_SECRET,
        getRedirectUri: () => process.env.LINKEDIN_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/linkedin/callback`
    },
    
    spotify: {
        name: 'Spotify',
        authUrl: 'https://accounts.spotify.com/authorize',
        tokenUrl: 'https://accounts.spotify.com/api/token',
        scopes: 'user-read-private user-read-email playlist-read-private',
        getClientId: () => process.env.SPOTIFY_CLIENT_ID,
        getClientSecret: () => process.env.SPOTIFY_CLIENT_SECRET,
        getRedirectUri: () => process.env.SPOTIFY_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/spotify/callback`
    },
    
    notion: {
        name: 'Notion',
        authUrl: 'https://api.notion.com/v1/oauth/authorize',
        tokenUrl: 'https://api.notion.com/v1/oauth/token',
        scopes: '',
        getClientId: () => process.env.NOTION_CLIENT_ID,
        getClientSecret: () => process.env.NOTION_CLIENT_SECRET,
        getRedirectUri: () => process.env.NOTION_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/notion/callback`,
        owner: 'user'
    },
    
    slack: {
        name: 'Slack',
        authUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        scopes: 'channels:read chat:write users:read',
        getClientId: () => process.env.SLACK_CLIENT_ID,
        getClientSecret: () => process.env.SLACK_CLIENT_SECRET,
        getRedirectUri: () => process.env.SLACK_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/slack/callback`
    },
    
    discord: {
        name: 'Discord',
        authUrl: 'https://discord.com/api/oauth2/authorize',
        tokenUrl: 'https://discord.com/api/oauth2/token',
        scopes: 'identify email guilds',
        getClientId: () => process.env.DISCORD_CLIENT_ID,
        getClientSecret: () => process.env.DISCORD_CLIENT_SECRET,
        getRedirectUri: () => process.env.DISCORD_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/discord/callback`
    },
    
    stripe: {
        name: 'Stripe',
        authUrl: 'https://connect.stripe.com/oauth/authorize',
        tokenUrl: 'https://connect.stripe.com/oauth/token',
        scopes: 'read_write',
        getClientId: () => process.env.STRIPE_CLIENT_ID,
        getClientSecret: () => process.env.STRIPE_SECRET_KEY,
        getRedirectUri: () => process.env.STRIPE_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/stripe/callback`
    },
    
    paypal: {
        name: 'PayPal',
        authUrl: 'https://www.paypal.com/signin/authorize',
        tokenUrl: 'https://api-m.paypal.com/v1/oauth2/token',
        scopes: 'openid profile email',
        getClientId: () => process.env.PAYPAL_CLIENT_ID,
        getClientSecret: () => process.env.PAYPAL_CLIENT_SECRET,
        getRedirectUri: () => process.env.PAYPAL_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/paypal/callback`
    },
    
    github: {
        name: 'GitHub',
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scopes: 'user repo',
        getClientId: () => process.env.GITHUB_CLIENT_ID,
        getClientSecret: () => process.env.GITHUB_CLIENT_SECRET,
        getRedirectUri: () => process.env.GITHUB_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/github/callback`
    },
    
    trello: {
        name: 'Trello',
        authUrl: 'https://trello.com/1/authorize',
        tokenUrl: null, // Trello uses different auth flow
        scopes: 'read,write',
        getClientId: () => process.env.TRELLO_API_KEY,
        getClientSecret: () => process.env.TRELLO_API_SECRET,
        getRedirectUri: () => process.env.TRELLO_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/trello/callback`
    },
    
    asana: {
        name: 'Asana',
        authUrl: 'https://app.asana.com/-/oauth_authorize',
        tokenUrl: 'https://app.asana.com/-/oauth_token',
        scopes: 'default',
        getClientId: () => process.env.ASANA_CLIENT_ID,
        getClientSecret: () => process.env.ASANA_CLIENT_SECRET,
        getRedirectUri: () => process.env.ASANA_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/asana/callback`
    },
    
    todoist: {
        name: 'Todoist',
        authUrl: 'https://todoist.com/oauth/authorize',
        tokenUrl: 'https://todoist.com/oauth/access_token',
        scopes: 'data:read_write',
        getClientId: () => process.env.TODOIST_CLIENT_ID,
        getClientSecret: () => process.env.TODOIST_CLIENT_SECRET,
        getRedirectUri: () => process.env.TODOIST_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/todoist/callback`
    },
    
    fitbit: {
        name: 'Fitbit',
        authUrl: 'https://www.fitbit.com/oauth2/authorize',
        tokenUrl: 'https://api.fitbit.com/oauth2/token',
        scopes: 'activity heartrate location nutrition profile settings sleep social weight',
        getClientId: () => process.env.FITBIT_CLIENT_ID,
        getClientSecret: () => process.env.FITBIT_CLIENT_SECRET,
        getRedirectUri: () => process.env.FITBIT_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/fitbit/callback`
    },
    
    strava: {
        name: 'Strava',
        authUrl: 'https://www.strava.com/oauth/authorize',
        tokenUrl: 'https://www.strava.com/oauth/token',
        scopes: 'read,activity:read_all,profile:read_all',
        getClientId: () => process.env.STRAVA_CLIENT_ID,
        getClientSecret: () => process.env.STRAVA_CLIENT_SECRET,
        getRedirectUri: () => process.env.STRAVA_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/strava/callback`
    },
    
    withings: {
        name: 'Withings',
        authUrl: 'https://account.withings.com/oauth2_user/authorize2',
        tokenUrl: 'https://wbsapi.withings.net/v2/oauth2',
        scopes: 'user.info,user.metrics,user.activity',
        getClientId: () => process.env.WITHINGS_CLIENT_ID,
        getClientSecret: () => process.env.WITHINGS_CLIENT_SECRET,
        getRedirectUri: () => process.env.WITHINGS_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/withings/callback`
    },
    
    oura: {
        name: 'Oura Ring',
        authUrl: 'https://cloud.ouraring.com/oauth/authorize',
        tokenUrl: 'https://api.ouraring.com/oauth/token',
        scopes: 'personal daily heartrate workout tag session',
        getClientId: () => process.env.OURA_CLIENT_ID,
        getClientSecret: () => process.env.OURA_CLIENT_SECRET,
        getRedirectUri: () => process.env.OURA_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/oura/callback`
    },
    
    whoop: {
        name: 'WHOOP',
        authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
        tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
        scopes: 'read:profile read:recovery read:cycles read:workout read:sleep',
        getClientId: () => process.env.WHOOP_CLIENT_ID,
        getClientSecret: () => process.env.WHOOP_CLIENT_SECRET,
        getRedirectUri: () => process.env.WHOOP_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/whoop/callback`
    },
    
    apple_health: {
        name: 'Apple Health',
        // Apple Health requires native iOS integration, not standard OAuth
        authUrl: null,
        tokenUrl: null,
        scopes: '',
        getClientId: () => process.env.APPLE_TEAM_ID,
        getClientSecret: () => null,
        getRedirectUri: () => null
    },
    
    google_fit: {
        name: 'Google Fit',
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: 'https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.body.read https://www.googleapis.com/auth/fitness.heart_rate.read https://www.googleapis.com/auth/fitness.sleep.read',
        getClientId: () => process.env.GOOGLE_CLIENT_ID,
        getClientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
        getRedirectUri: () => process.env.GOOGLE_FIT_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/google_fit/callback`
    },
    
    samsung_health: {
        name: 'Samsung Health',
        authUrl: 'https://account.samsung.com/accounts/v1/STGCRSTV/signInGate',
        tokenUrl: null, // Requires SDK integration
        scopes: '',
        getClientId: () => process.env.SAMSUNG_CLIENT_ID,
        getClientSecret: () => process.env.SAMSUNG_CLIENT_SECRET,
        getRedirectUri: () => null
    },
    
    amazon: {
        name: 'Amazon',
        authUrl: 'https://www.amazon.com/ap/oa',
        tokenUrl: 'https://api.amazon.com/auth/o2/token',
        scopes: 'profile',
        getClientId: () => process.env.AMAZON_CLIENT_ID,
        getClientSecret: () => process.env.AMAZON_CLIENT_SECRET,
        getRedirectUri: () => process.env.AMAZON_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/amazon/callback`
    },
    
    dropbox: {
        name: 'Dropbox',
        authUrl: 'https://www.dropbox.com/oauth2/authorize',
        tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
        scopes: '',
        getClientId: () => process.env.DROPBOX_APP_KEY,
        getClientSecret: () => process.env.DROPBOX_APP_SECRET,
        getRedirectUri: () => process.env.DROPBOX_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/dropbox/callback`
    },
    
    zoom: {
        name: 'Zoom',
        authUrl: 'https://zoom.us/oauth/authorize',
        tokenUrl: 'https://zoom.us/oauth/token',
        scopes: 'user:read meeting:read meeting:write',
        getClientId: () => process.env.ZOOM_CLIENT_ID,
        getClientSecret: () => process.env.ZOOM_CLIENT_SECRET,
        getRedirectUri: () => process.env.ZOOM_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/zoom/callback`
    },
    
    calendly: {
        name: 'Calendly',
        authUrl: 'https://auth.calendly.com/oauth/authorize',
        tokenUrl: 'https://auth.calendly.com/oauth/token',
        scopes: '',
        getClientId: () => process.env.CALENDLY_CLIENT_ID,
        getClientSecret: () => process.env.CALENDLY_CLIENT_SECRET,
        getRedirectUri: () => process.env.CALENDLY_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/calendly/callback`
    },
    
    hubspot: {
        name: 'HubSpot',
        authUrl: 'https://app.hubspot.com/oauth/authorize',
        tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
        scopes: 'crm.objects.contacts.read crm.objects.contacts.write',
        getClientId: () => process.env.HUBSPOT_CLIENT_ID,
        getClientSecret: () => process.env.HUBSPOT_CLIENT_SECRET,
        getRedirectUri: () => process.env.HUBSPOT_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/hubspot/callback`
    },
    
    salesforce: {
        name: 'Salesforce',
        authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
        tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
        scopes: 'api refresh_token',
        getClientId: () => process.env.SALESFORCE_CLIENT_ID,
        getClientSecret: () => process.env.SALESFORCE_CLIENT_SECRET,
        getRedirectUri: () => process.env.SALESFORCE_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/salesforce/callback`
    },
    
    quickbooks: {
        name: 'QuickBooks',
        authUrl: 'https://appcenter.intuit.com/connect/oauth2',
        tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        scopes: 'com.intuit.quickbooks.accounting',
        getClientId: () => process.env.QUICKBOOKS_CLIENT_ID,
        getClientSecret: () => process.env.QUICKBOOKS_CLIENT_SECRET,
        getRedirectUri: () => process.env.QUICKBOOKS_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/quickbooks/callback`
    },
    
    xero: {
        name: 'Xero',
        authUrl: 'https://login.xero.com/identity/connect/authorize',
        tokenUrl: 'https://identity.xero.com/connect/token',
        scopes: 'openid profile email accounting.transactions accounting.contacts',
        getClientId: () => process.env.XERO_CLIENT_ID,
        getClientSecret: () => process.env.XERO_CLIENT_SECRET,
        getRedirectUri: () => process.env.XERO_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/xero/callback`
    },
    
    wave: {
        name: 'Wave',
        authUrl: 'https://api.waveapps.com/oauth2/authorize/',
        tokenUrl: 'https://api.waveapps.com/oauth2/token/',
        scopes: '',
        getClientId: () => process.env.WAVE_CLIENT_ID,
        getClientSecret: () => process.env.WAVE_CLIENT_SECRET,
        getRedirectUri: () => process.env.WAVE_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/wave/callback`
    },
    
    plaid: {
        name: 'Plaid',
        // Plaid uses Link, not standard OAuth
        authUrl: null,
        tokenUrl: null,
        scopes: 'transactions',
        getClientId: () => process.env.PLAID_CLIENT_ID,
        getClientSecret: () => process.env.PLAID_SECRET,
        getRedirectUri: () => null
    },
    
    coinbase: {
        name: 'Coinbase',
        authUrl: 'https://www.coinbase.com/oauth/authorize',
        tokenUrl: 'https://api.coinbase.com/oauth/token',
        scopes: 'wallet:accounts:read wallet:transactions:read',
        getClientId: () => process.env.COINBASE_CLIENT_ID,
        getClientSecret: () => process.env.COINBASE_CLIENT_SECRET,
        getRedirectUri: () => process.env.COINBASE_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/coinbase/callback`
    },
    
    robinhood: {
        name: 'Robinhood',
        // Robinhood doesn't have public OAuth API
        authUrl: null,
        tokenUrl: null,
        scopes: '',
        getClientId: () => null,
        getClientSecret: () => null,
        getRedirectUri: () => null
    },
    
    etrade: {
        name: 'E*TRADE',
        authUrl: 'https://us.etrade.com/e/t/etws/authorize',
        tokenUrl: 'https://api.etrade.com/oauth/access_token',
        scopes: '',
        getClientId: () => process.env.ETRADE_CONSUMER_KEY,
        getClientSecret: () => process.env.ETRADE_CONSUMER_SECRET,
        getRedirectUri: () => process.env.ETRADE_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/etrade/callback`
    },
    
    wealthfront: {
        name: 'Wealthfront',
        // No public OAuth
        authUrl: null,
        tokenUrl: null,
        scopes: '',
        getClientId: () => null,
        getClientSecret: () => null,
        getRedirectUri: () => null
    },
    
    betterment: {
        name: 'Betterment',
        // No public OAuth
        authUrl: null,
        tokenUrl: null,
        scopes: '',
        getClientId: () => null,
        getClientSecret: () => null,
        getRedirectUri: () => null
    }
};

// ============================================
// TOKEN EXCHANGE FUNCTIONS
// ============================================

export async function exchangeCodeForTokens(platform, code, additionalParams = {}) {
    const config = OAUTH_CONFIGS[platform];
    if (!config || !config.tokenUrl) {
        throw new Error(`Platform ${platform} not supported or doesn't use standard OAuth`);
    }

    const clientId = config.getClientId();
    const clientSecret = config.getClientSecret();
    const redirectUri = config.getRedirectUri();

    if (!clientId || !clientSecret) {
        throw new Error(`Missing credentials for ${platform}`);
    }

    let body;
    let headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

    // Platform-specific token exchange
    switch (platform) {
        case 'shopify':
            body = JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                grant_type: 'authorization_code'
            });
            headers = { 'Content-Type': 'application/json' };
            break;

        case 'tiktok':
            body = new URLSearchParams({
                client_key: clientId,
                client_secret: clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            });
            break;

        case 'meta':
            const metaUrl = `${config.tokenUrl}?client_id=${clientId}&client_secret=${clientSecret}&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`;
            const metaResponse = await fetch(metaUrl);
            return metaResponse.json();

        case 'google':
        case 'google_fit':
            body = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            });
            break;

        case 'twitter':
            body = new URLSearchParams({
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
                code_verifier: additionalParams.code_verifier || 'challenge'
            });
            headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
            };
            break;

        case 'notion':
            body = JSON.stringify({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri
            });
            headers = {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
            };
            break;

        case 'spotify':
        case 'fitbit':
            body = new URLSearchParams({
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            });
            headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
            };
            break;

        case 'stripe':
            body = new URLSearchParams({
                code,
                grant_type: 'authorization_code'
            });
            headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Bearer ' + clientSecret
            };
            break;

        case 'github':
            body = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                redirect_uri: redirectUri
            });
            headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            };
            break;

        default:
            body = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            });
    }

    const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers,
        body
    });

    const data = await response.json();

    if (!response.ok) {
        console.error(`Token exchange error for ${platform}:`, data);
        throw new Error(data.error_description || data.error || 'Token exchange failed');
    }

    return data;
}

// ============================================
// TOKEN REFRESH FUNCTIONS
// ============================================

export async function refreshAccessToken(platform, refreshToken) {
    const config = OAUTH_CONFIGS[platform];
    if (!config || !config.tokenUrl) {
        throw new Error(`Platform ${platform} not supported`);
    }

    const clientId = config.getClientId();
    const clientSecret = config.getClientSecret();

    let body;
    let headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

    switch (platform) {
        case 'spotify':
        case 'fitbit':
            body = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            });
            headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
            };
            break;

        case 'meta':
            // Meta uses long-lived tokens, exchange short-lived for long-lived
            const metaUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${refreshToken}`;
            const metaResponse = await fetch(metaUrl);
            return metaResponse.json();

        default:
            body = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            });
    }

    const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers,
        body
    });

    return response.json();
}

// ============================================
// GENERATE AUTH URL
// ============================================

export function generateAuthUrl(platform, state, additionalParams = {}) {
    const config = OAUTH_CONFIGS[platform];
    if (!config || !config.authUrl) {
        throw new Error(`Platform ${platform} not supported`);
    }

    const clientId = config.getClientId();
    const redirectUri = config.getRedirectUri();
    const scopes = config.scopes;

    if (!clientId) {
        throw new Error(`Missing client ID for ${platform}`);
    }

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        state,
        ...additionalParams
    });

    // Platform-specific parameter names
    switch (platform) {
        case 'tiktok':
            params.set('client_key', clientId);
            params.delete('client_id');
            params.set('scope', scopes);
            break;

        case 'twitter':
            params.set('scope', scopes);
            params.set('code_challenge', 'challenge');
            params.set('code_challenge_method', 'plain');
            break;

        case 'shopify':
            params.set('scope', scopes);
            // Shopify requires shop parameter
            if (additionalParams.shop) {
                params.set('shop', additionalParams.shop);
            }
            break;

        case 'google':
        case 'google_fit':
            params.set('scope', scopes);
            params.set('access_type', 'offline');
            params.set('prompt', 'consent');
            break;

        case 'stripe':
            params.set('scope', scopes);
            params.set('stripe_user[email]', additionalParams.email || '');
            break;

        case 'slack':
            params.set('scope', scopes);
            params.set('user_scope', 'identity.basic,identity.email');
            break;

        case 'notion':
            params.set('owner', 'user');
            break;

        case 'trello':
            // Trello uses different parameter names
            params.set('key', clientId);
            params.delete('client_id');
            params.set('name', 'Injazi');
            params.set('scope', scopes);
            params.set('expiration', 'never');
            params.set('return_url', redirectUri);
            params.delete('redirect_uri');
            break;

        default:
            if (scopes) {
                params.set('scope', scopes);
            }
    }

    return `${config.authUrl}?${params.toString()}`;
}

// ============================================
// GET USER INFO FROM PLATFORM
// ============================================

export async function getUserInfo(platform, accessToken) {
    const endpoints = {
        meta: 'https://graph.facebook.com/me?fields=id,name,email,picture',
        google: 'https://www.googleapis.com/oauth2/v2/userinfo',
        tiktok: 'https://open.tiktokapis.com/v2/user/info/',
        twitter: 'https://api.twitter.com/2/users/me',
        linkedin: 'https://api.linkedin.com/v2/userinfo',
        spotify: 'https://api.spotify.com/v1/me',
        github: 'https://api.github.com/user',
        discord: 'https://discord.com/api/users/@me',
        slack: 'https://slack.com/api/users.identity',
        notion: 'https://api.notion.com/v1/users/me',
        fitbit: 'https://api.fitbit.com/1/user/-/profile.json',
        strava: 'https://www.strava.com/api/v3/athlete'
    };

    const endpoint = endpoints[platform];
    if (!endpoint) {
        return null;
    }

    try {
        const response = await fetch(endpoint, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get user info: ${response.status}`);
        }

        return response.json();
    } catch (error) {
        console.error(`Error getting user info for ${platform}:`, error);
        return null;
    }
}

// ============================================
// LIST AVAILABLE PLATFORMS
// ============================================

export function getAvailablePlatforms() {
    return Object.entries(OAUTH_CONFIGS)
        .filter(([_, config]) => config.authUrl && config.getClientId())
        .map(([key, config]) => ({
            id: key,
            name: config.name,
            configured: !!(config.getClientId() && config.getClientSecret())
        }));
}

export function getPlatformConfig(platform) {
    return OAUTH_CONFIGS[platform] || null;
}

export default {
    OAUTH_CONFIGS,
    exchangeCodeForTokens,
    refreshAccessToken,
    generateAuthUrl,
    getUserInfo,
    getAvailablePlatforms,
    getPlatformConfig
};
