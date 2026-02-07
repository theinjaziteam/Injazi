// service/masterAgentRoutes.js
import express from 'express';
import { User } from './models.js';

const router = express.Router();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ============================================
// HELPER: Get user's access token for a platform
// ============================================
async function getUserToken(email, platform) {
    const user = await User.findOne({ email: email.toLowerCase() }).select('+connectedAccounts.accessToken +connectedAccounts.refreshToken');
    if (!user) return null;
    
    const account = user.connectedAccounts?.find(acc => 
        acc.platform === platform && acc.isConnected
    );
    
    if (!account) return null;
    
    // Check if token is expired
    if (account.expiresAt && Date.now() > account.expiresAt) {
        console.log(`Token expired for ${platform}, needs refresh`);
        return null;
    }
    
    return {
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        platformUserId: account.platformUserId,
        platformUsername: account.platformUsername
    };
}

// ============================================
// TOOL IMPLEMENTATIONS
// ============================================

const tools = {
    // GitHub Tools
    github: {
        listRepos: async (token) => {
            const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (!response.ok) throw new Error('Failed to fetch repositories');
            const repos = await response.json();
            return repos.map(r => ({
                name: r.name,
                fullName: r.full_name,
                description: r.description,
                url: r.html_url,
                language: r.language,
                stars: r.stargazers_count,
                forks: r.forks_count,
                isPrivate: r.private,
                updatedAt: r.updated_at
            }));
        },
        
        getUser: async (token) => {
            const response = await fetch('https://api.github.com/user', {
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (!response.ok) throw new Error('Failed to fetch user');
            return response.json();
        },
        
        listIssues: async (token, repo) => {
            const response = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=20`, {
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (!response.ok) throw new Error('Failed to fetch issues');
            const issues = await response.json();
            return issues.map(i => ({
                number: i.number,
                title: i.title,
                state: i.state,
                url: i.html_url,
                createdAt: i.created_at,
                labels: i.labels.map(l => l.name)
            }));
        },

        createIssue: async (token, repo, title, body) => {
            const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, body })
            });
            if (!response.ok) throw new Error('Failed to create issue');
            return response.json();
        }
    },

    // Google Tools
    google: {
        getProfile: async (token) => {
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch profile');
            return response.json();
        },
        
        listCalendarEvents: async (token) => {
            const now = new Date().toISOString();
            const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&maxResults=10&singleEvents=true&orderBy=startTime`,
                { headers: { 'Authorization': `Bearer ${token.accessToken}` } }
            );
            if (!response.ok) throw new Error('Failed to fetch calendar events');
            const data = await response.json();
            return data.items?.map(e => ({
                id: e.id,
                title: e.summary,
                start: e.start?.dateTime || e.start?.date,
                end: e.end?.dateTime || e.end?.date,
                location: e.location
            })) || [];
        }
    },

    // Discord Tools
    discord: {
        getUser: async (token) => {
            const response = await fetch('https://discord.com/api/users/@me', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch Discord user');
            return response.json();
        },
        
        getGuilds: async (token) => {
            const response = await fetch('https://discord.com/api/users/@me/guilds', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch guilds');
            const guilds = await response.json();
            return guilds.map(g => ({
                id: g.id,
                name: g.name,
                icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
                isOwner: g.owner
            }));
        }
    },

    // Spotify Tools
    spotify: {
        getProfile: async (token) => {
            const response = await fetch('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch Spotify profile');
            return response.json();
        },
        
        getTopTracks: async (token) => {
            const response = await fetch('https://api.spotify.com/v1/me/top/tracks?limit=10', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch top tracks');
            const data = await response.json();
            return data.items?.map(t => ({
                name: t.name,
                artist: t.artists.map(a => a.name).join(', '),
                album: t.album.name,
                url: t.external_urls.spotify
            })) || [];
        },
        
        getCurrentlyPlaying: async (token) => {
            const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (response.status === 204) return { isPlaying: false };
            if (!response.ok) throw new Error('Failed to fetch currently playing');
            const data = await response.json();
            return {
                isPlaying: data.is_playing,
                track: data.item?.name,
                artist: data.item?.artists?.map(a => a.name).join(', '),
                album: data.item?.album?.name
            };
        }
    },

    // Shopify Tools
    shopify: {
        getProducts: async (token, shopDomain) => {
            const response = await fetch(`https://${shopDomain}/admin/api/2024-01/products.json?limit=20`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch products');
            const data = await response.json();
            return data.products?.map(p => ({
                id: p.id,
                title: p.title,
                status: p.status,
                vendor: p.vendor,
                productType: p.product_type,
                price: p.variants?.[0]?.price,
                inventory: p.variants?.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0)
            })) || [];
        },
        
        getOrders: async (token, shopDomain) => {
            const response = await fetch(`https://${shopDomain}/admin/api/2024-01/orders.json?status=any&limit=20`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch orders');
            const data = await response.json();
            return data.orders?.map(o => ({
                id: o.id,
                orderNumber: o.order_number,
                total: o.total_price,
                status: o.financial_status,
                fulfillment: o.fulfillment_status,
                createdAt: o.created_at,
                customer: o.customer?.email
            })) || [];
        },

        getAnalytics: async (token, shopDomain) => {
            // Get orders for revenue calculation
            const ordersResponse = await fetch(`https://${shopDomain}/admin/api/2024-01/orders.json?status=any&limit=250`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!ordersResponse.ok) throw new Error('Failed to fetch analytics');
            const ordersData = await ordersResponse.json();
            
            const orders = ordersData.orders || [];
            const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
            const totalOrders = orders.length;
            const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
            
            return {
                totalRevenue: totalRevenue.toFixed(2),
                totalOrders,
                avgOrderValue: avgOrderValue.toFixed(2),
                recentOrders: orders.slice(0, 5).map(o => ({
                    orderNumber: o.order_number,
                    total: o.total_price,
                    date: o.created_at
                }))
            };
        }
    },

    // Notion Tools
    notion: {
        listDatabases: async (token) => {
            const response = await fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ filter: { property: 'object', value: 'database' } })
            });
            if (!response.ok) throw new Error('Failed to fetch databases');
            const data = await response.json();
            return data.results?.map(d => ({
                id: d.id,
                title: d.title?.[0]?.plain_text || 'Untitled',
                url: d.url
            })) || [];
        }
    },

    // Strava Tools
    strava: {
        getAthlete: async (token) => {
            const response = await fetch('https://www.strava.com/api/v3/athlete', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch athlete');
            return response.json();
        },
        
        getActivities: async (token) => {
            const response = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=10', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch activities');
            const activities = await response.json();
            return activities.map(a => ({
                id: a.id,
                name: a.name,
                type: a.type,
                distance: (a.distance / 1000).toFixed(2) + ' km',
                duration: Math.round(a.moving_time / 60) + ' min',
                date: a.start_date_local
            }));
        }
    }
};

// ============================================
// INTENT DETECTION
// ============================================

function detectIntent(message, connectedPlatforms) {
    const lowerMessage = message.toLowerCase();
    
    // GitHub intents
    if (connectedPlatforms.includes('github')) {
        if (lowerMessage.includes('repo') || lowerMessage.includes('repositor')) {
            return { tool: 'github', action: 'listRepos' };
        }
        if (lowerMessage.includes('issue') && lowerMessage.includes('list')) {
            return { tool: 'github', action: 'listIssues', needsParam: 'repo' };
        }
        if (lowerMessage.includes('github') && (lowerMessage.includes('profile') || lowerMessage.includes('account') || lowerMessage.includes('user'))) {
            return { tool: 'github', action: 'getUser' };
        }
    }
    
    // Google/Calendar intents
    if (connectedPlatforms.includes('google')) {
        if (lowerMessage.includes('calendar') || lowerMessage.includes('event') || lowerMessage.includes('schedule') || lowerMessage.includes('meeting')) {
            return { tool: 'google', action: 'listCalendarEvents' };
        }
    }
    
    // Discord intents
    if (connectedPlatforms.includes('discord')) {
        if (lowerMessage.includes('discord') && (lowerMessage.includes('server') || lowerMessage.includes('guild'))) {
            return { tool: 'discord', action: 'getGuilds' };
        }
        if (lowerMessage.includes('discord') && lowerMessage.includes('profile')) {
            return { tool: 'discord', action: 'getUser' };
        }
    }
    
    // Spotify intents
    if (connectedPlatforms.includes('spotify')) {
        if (lowerMessage.includes('playing') || lowerMessage.includes('listening')) {
            return { tool: 'spotify', action: 'getCurrentlyPlaying' };
        }
        if (lowerMessage.includes('top') && (lowerMessage.includes('track') || lowerMessage.includes('song'))) {
            return { tool: 'spotify', action: 'getTopTracks' };
        }
        if (lowerMessage.includes('spotify') && lowerMessage.includes('profile')) {
            return { tool: 'spotify', action: 'getProfile' };
        }
    }
    
    // Shopify intents
    if (connectedPlatforms.includes('shopify')) {
        if (lowerMessage.includes('product')) {
            return { tool: 'shopify', action: 'getProducts' };
        }
        if (lowerMessage.includes('order')) {
            return { tool: 'shopify', action: 'getOrders' };
        }
        if (lowerMessage.includes('analytics') || lowerMessage.includes('revenue') || lowerMessage.includes('sales')) {
            return { tool: 'shopify', action: 'getAnalytics' };
        }
    }
    
    // Notion intents
    if (connectedPlatforms.includes('notion')) {
        if (lowerMessage.includes('notion') && (lowerMessage.includes('database') || lowerMessage.includes('page'))) {
            return { tool: 'notion', action: 'listDatabases' };
        }
    }
    
    // Strava intents
    if (connectedPlatforms.includes('strava')) {
        if (lowerMessage.includes('activit') || lowerMessage.includes('workout') || lowerMessage.includes('run') || lowerMessage.includes('ride')) {
            return { tool: 'strava', action: 'getActivities' };
        }
        if (lowerMessage.includes('strava') && lowerMessage.includes('profile')) {
            return { tool: 'strava', action: 'getAthlete' };
        }
    }
    
    return null;
}

// ============================================
// FORMAT TOOL RESULTS
// ============================================

function formatToolResults(tool, action, data) {
    switch (`${tool}.${action}`) {
        case 'github.listRepos':
            if (!data.length) return 'No repositories found.';
            return `Found ${data.length} repositories:\n\n` + 
                data.slice(0, 10).map(r => 
                    `- ${r.name}${r.description ? `: ${r.description}` : ''} (${r.language || 'No language'}, ${r.stars} stars)`
                ).join('\n');
        
        case 'github.getUser':
            return `GitHub Profile:\n- Username: ${data.login}\n- Name: ${data.name || 'Not set'}\n- Public repos: ${data.public_repos}\n- Followers: ${data.followers}\n- Following: ${data.following}`;
        
        case 'github.listIssues':
            if (!data.length) return 'No open issues found.';
            return `Found ${data.length} open issues:\n` + 
                data.map(i => `- #${i.number}: ${i.title}`).join('\n');
        
        case 'google.listCalendarEvents':
            if (!data.length) return 'No upcoming events found.';
            return `Upcoming events:\n` + 
                data.map(e => `- ${e.title} (${new Date(e.start).toLocaleString()})`).join('\n');
        
        case 'discord.getGuilds':
            if (!data.length) return 'No Discord servers found.';
            return `Your Discord servers:\n` + 
                data.map(g => `- ${g.name}${g.isOwner ? ' (Owner)' : ''}`).join('\n');
        
        case 'discord.getUser':
            return `Discord Profile:\n- Username: ${data.username}\n- ID: ${data.id}`;
        
        case 'spotify.getCurrentlyPlaying':
            if (!data.isPlaying) return 'Nothing is currently playing on Spotify.';
            return `Now playing: "${data.track}" by ${data.artist} from "${data.album}"`;
        
        case 'spotify.getTopTracks':
            if (!data.length) return 'No top tracks found.';
            return `Your top tracks:\n` + 
                data.map((t, i) => `${i + 1}. "${t.name}" by ${t.artist}`).join('\n');
        
        case 'shopify.getProducts':
            if (!data.length) return 'No products found in your store.';
            return `Your products (${data.length}):\n` + 
                data.slice(0, 10).map(p => `- ${p.title}: $${p.price} (${p.inventory} in stock)`).join('\n');
        
        case 'shopify.getOrders':
            if (!data.length) return 'No orders found.';
            return `Recent orders:\n` + 
                data.slice(0, 10).map(o => `- Order #${o.orderNumber}: $${o.total} (${o.status})`).join('\n');
        
        case 'shopify.getAnalytics':
            return `Store Analytics:\n- Total Revenue: $${data.totalRevenue}\n- Total Orders: ${data.totalOrders}\n- Avg Order Value: $${data.avgOrderValue}`;
        
        case 'notion.listDatabases':
            if (!data.length) return 'No Notion databases found.';
            return `Your Notion databases:\n` + 
                data.map(d => `- ${d.title}`).join('\n');
        
        case 'strava.getActivities':
            if (!data.length) return 'No recent activities found.';
            return `Recent activities:\n` + 
                data.map(a => `- ${a.name} (${a.type}): ${a.distance} in ${a.duration}`).join('\n');
        
        case 'strava.getAthlete':
            return `Strava Profile:\n- Name: ${data.firstname} ${data.lastname}\n- City: ${data.city || 'Not set'}\n- Country: ${data.country || 'Not set'}`;
        
        default:
            return JSON.stringify(data, null, 2);
    }
}

// ============================================
// MAIN CHAT ENDPOINT
// ============================================

router.post('/chat', async (req, res) => {
    try {
        const { email, message, connectedPlatforms = [], activeTools = [], goal, userName, history = [], userTasks = [] } = req.body;

        if (!email || !message) {
            return res.status(400).json({ error: 'Email and message required' });
        }

        // Detect if user wants to use a tool
        const intent = detectIntent(message, connectedPlatforms);
        let toolResult = null;
        let toolUsed = null;
        let actionTaken = null;

        if (intent) {
            console.log(`Detected intent: ${intent.tool}.${intent.action}`);
            
            // Get token for the platform
            const token = await getUserToken(email, intent.tool);
            
            if (token) {
                try {
                    // Get additional metadata if needed (like shopDomain for Shopify)
                    const user = await User.findOne({ email: email.toLowerCase() });
                    const account = user?.connectedAccounts?.find(a => a.platform === intent.tool);
                    
                    // Execute the tool
                    let data;
                    if (intent.tool === 'shopify' && account?.shopDomain) {
                        data = await tools[intent.tool][intent.action](token, account.shopDomain);
                    } else {
                        data = await tools[intent.tool][intent.action](token);
                    }
                    
                    toolResult = formatToolResults(intent.tool, intent.action, data);
                    toolUsed = intent.tool;
                    actionTaken = intent.action;
                    
                    console.log(`Tool executed successfully: ${intent.tool}.${intent.action}`);
                } catch (toolError) {
                    console.error(`Tool error: ${toolError.message}`);
                    toolResult = `I tried to access ${intent.tool} but encountered an error: ${toolError.message}. The connection might need to be refreshed.`;
                }
            } else {
                toolResult = `${intent.tool} is not connected or the token has expired. Please reconnect from the Settings tab.`;
            }
        }

        // Build AI context
        const systemPrompt = `You are Master Agent, a powerful AI assistant integrated with the user's connected apps and services.

User: ${userName || 'User'}
Goal: ${goal || 'Not specified'}
Connected platforms: ${connectedPlatforms.length > 0 ? connectedPlatforms.join(', ') : 'None'}
Active tools: ${activeTools.length > 0 ? activeTools.join(', ') : 'None'}

${toolResult ? `TOOL RESULT (${toolUsed}.${actionTaken}):\n${toolResult}\n\nUse this real data to answer the user's question. Present it clearly and offer helpful insights or next actions.` : ''}

Guidelines:
- If you have tool results, present them clearly and offer insights
- If the user asks about something you can't access, explain what they need to connect
- Be concise but helpful
- Suggest relevant actions the user can take
- If no tool was used but the user seems to want data from a connected service, explain what you can do`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-10).map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content || msg.text || ''
            })),
            { role: 'user', content: message }
        ];

        // Call AI
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
            console.error('AI error:', data.error);
            return res.status(500).json({ error: 'AI service error' });
        }

        const aiResponse = data.choices?.[0]?.message?.content || "I'm here to help. What would you like to do?";

        res.json({
            response: aiResponse,
            toolUsed,
            actionTaken,
            success: true
        });

    } catch (error) {
        console.error('Master Agent chat error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// DIRECT TOOL EXECUTION ENDPOINT
// ============================================

router.post('/execute', async (req, res) => {
    try {
        const { email, tool, action, params = {} } = req.body;

        if (!email || !tool || !action) {
            return res.status(400).json({ error: 'Email, tool, and action required' });
        }

        if (!tools[tool] || !tools[tool][action]) {
            return res.status(400).json({ error: `Unknown tool action: ${tool}.${action}` });
        }

        const token = await getUserToken(email, tool);
        if (!token) {
            return res.status(400).json({ error: `${tool} is not connected or token expired` });
        }

        // Get additional metadata
        const user = await User.findOne({ email: email.toLowerCase() });
        const account = user?.connectedAccounts?.find(a => a.platform === tool);

        let data;
        if (tool === 'shopify' && account?.shopDomain) {
            data = await tools[tool][action](token, account.shopDomain, ...Object.values(params));
        } else {
            data = await tools[tool][action](token, ...Object.values(params));
        }

        res.json({
            success: true,
            tool,
            action,
            data,
            formatted: formatToolResults(tool, action, data)
        });

    } catch (error) {
        console.error('Tool execution error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// GET AVAILABLE ACTIONS FOR USER
// ============================================

router.get('/actions/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const connectedPlatforms = (user.connectedAccounts || [])
            .filter(acc => acc.isConnected)
            .map(acc => acc.platform);

        const availableActions = [];

        for (const platform of connectedPlatforms) {
            if (tools[platform]) {
                for (const action of Object.keys(tools[platform])) {
                    availableActions.push({
                        platform,
                        action,
                        description: `${platform}.${action}`
                    });
                }
            }
        }

        res.json({
            success: true,
            connectedPlatforms,
            availableActions
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
