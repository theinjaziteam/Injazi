// service/masterAgentRoutes.js
// MASTER AGENT - Autonomous AI Agent System with Automations
import express from 'express';
import { User } from './models.js';

const router = express.Router();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ============================================
// AUTOMATION STORAGE & SCHEDULER
// ============================================
const runningAutomations = new Map();
const automationResults = new Map();

// ============================================
// CORE AI ENGINE
// ============================================
async function think(prompt, options = {}) {
    try {
        const response = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: options.system || 'You are a helpful AI assistant.' },
                    ...(options.history || []),
                    { role: 'user', content: prompt }
                ],
                temperature: options.temperature ?? 0.7,
                max_tokens: options.maxTokens || 4096,
                ...(options.json && { response_format: { type: "json_object" } })
            })
        });
        
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        if (options.json) {
            try {
                return JSON.parse(content);
            } catch {
                return { error: 'Failed to parse JSON', raw: content };
            }
        }
        return content;
    } catch (error) {
        console.error('Think error:', error);
        return options.json ? { error: error.message } : '';
    }
}

// ============================================
// AUTONOMOUS TASK PLANNER
// ============================================
async function planExecution(request, platforms, context = {}) {
    const systemPrompt = `You are an autonomous AI agent that plans and executes tasks.
Your job is to analyze requests and create a step-by-step execution plan.

CONNECTED PLATFORMS: ${platforms.join(', ') || 'None'}

AVAILABLE TOOLS:
${platforms.includes('github') ? `
[GITHUB]
- github.listRepos() - List user's repositories
- github.createRepo(name, description, isPrivate) - Create repository
- github.deleteRepo(repoFullName) - Delete repository  
- github.listFiles(repo, path) - List files in directory
- github.getFileContent(repo, filePath) - Read file content
- github.createFile(repo, path, content, commitMessage) - Create file
- github.updateFile(repo, path, content, commitMessage) - Update file
- github.deleteFile(repo, path, commitMessage) - Delete file
- github.listIssues(repo) - List issues
- github.createIssue(repo, title, body) - Create issue
- github.closeIssue(repo, issueNumber) - Close issue
- github.listBranches(repo) - List branches
- github.listPullRequests(repo) - List PRs
- github.getRepoStats(repo) - Get repo statistics
- github.searchRepos(query) - Search repositories
- github.forkRepo(repo) - Fork repository
- github.starRepo(repo) - Star repository
` : ''}
${platforms.includes('google') ? `
[GOOGLE]
- google.listCalendarEvents() - List upcoming events
- google.createCalendarEvent(title, startTime, endTime, description, location) - Create event
- google.deleteCalendarEvent(eventId) - Delete event
- google.listEmails(maxResults) - List emails
- google.sendEmail(to, subject, body) - Send email
- google.listDriveFiles() - List Drive files
- google.createDriveFolder(name) - Create folder
- google.listContacts() - List contacts
` : ''}
${platforms.includes('shopify') ? `
[SHOPIFY]
- shopify.getShopInfo() - Get store info
- shopify.getProducts() - List products
- shopify.createProduct(title, description, price, inventory, vendor, type) - Create product
- shopify.updateProduct(productId, updates) - Update product
- shopify.deleteProduct(productId) - Delete product
- shopify.getOrders() - List orders
- shopify.getOrderDetails(orderId) - Get order details
- shopify.fulfillOrder(orderId) - Fulfill order
- shopify.getCustomers() - List customers
- shopify.getAnalytics() - Get analytics
- shopify.createDiscount(code, type, value) - Create discount
- shopify.getInventory() - Check inventory
- shopify.getCollections() - List collections
- shopify.createCollection(title, description) - Create collection
- shopify.getThemes() - List themes
` : ''}
${platforms.includes('spotify') ? `
[SPOTIFY]
- spotify.getCurrentlyPlaying() - Get current track
- spotify.playTrack() - Resume playback
- spotify.pauseTrack() - Pause playback
- spotify.nextTrack() - Next track
- spotify.previousTrack() - Previous track
- spotify.getTopTracks(timeRange) - Get top tracks
- spotify.getTopArtists(timeRange) - Get top artists
- spotify.getPlaylists() - List playlists
- spotify.createPlaylist(name, description, isPublic) - Create playlist
- spotify.addToPlaylist(playlistId, trackUris) - Add tracks to playlist
- spotify.searchTracks(query) - Search tracks
- spotify.getRecentlyPlayed() - Get history
- spotify.getSavedTracks() - Get liked songs
` : ''}
${platforms.includes('notion') ? `
[NOTION]
- notion.listDatabases() - List databases
- notion.listPages() - List pages
- notion.createPage(parentId, title, content) - Create page
- notion.search(query) - Search Notion
- notion.queryDatabase(databaseId) - Query database
` : ''}
${platforms.includes('discord') ? `
[DISCORD]
- discord.getUser() - Get profile
- discord.getGuilds() - List servers
- discord.getGuildChannels(guildId) - List channels
` : ''}
${platforms.includes('slack') ? `
[SLACK]
- slack.listChannels() - List channels
- slack.sendMessage(channelId, text) - Send message
- slack.getMessages(channelId, limit) - Get messages
` : ''}
${platforms.includes('twitter') ? `
[TWITTER]
- twitter.getProfile() - Get profile
- twitter.getTweets() - Get tweets
- twitter.postTweet(text) - Post tweet
- twitter.getFollowers() - Get followers
` : ''}
${platforms.includes('strava') ? `
[STRAVA]
- strava.getAthlete() - Get profile
- strava.getActivities() - Get activities
- strava.getStats() - Get stats
` : ''}
${platforms.includes('dropbox') ? `
[DROPBOX]
- dropbox.listFiles(path) - List files
- dropbox.createFolder(path) - Create folder
- dropbox.getSpaceUsage() - Check storage
- dropbox.search(query) - Search files
` : ''}
${platforms.includes('fitbit') ? `
[FITBIT]
- fitbit.getActivitySummary() - Today's activity
- fitbit.getSleepLog() - Sleep data
- fitbit.getHeartRate() - Heart rate
` : ''}
${platforms.includes('linkedin') ? `
[LINKEDIN]
- linkedin.getProfile() - Get profile
` : ''}

SPECIAL CAPABILITIES:
- generateCode(description, language) - Generate code using AI
- generateProject(name, type, description) - Generate full project with files
- analyzeData(data, question) - Analyze data and provide insights
- summarize(content) - Summarize content
- translate(content, targetLanguage) - Translate content

USER CONTEXT:
- Name: ${context.userName || 'User'}
- Goal: ${context.goal || 'Not specified'}

RULES:
1. Create autonomous execution plans - don't ask for confirmation unless absolutely necessary
2. Break complex tasks into sequential steps
3. Use information from previous steps in later steps (reference as $step1, $step2, etc.)
4. For code/project creation, include generateCode or generateProject steps
5. Estimate time for each step
6. Handle errors gracefully - include fallback steps if needed
7. Be proactive - if you see an opportunity to help more, include it

Return ONLY valid JSON:
{
    "thought": "Your reasoning about the request",
    "canExecute": true,
    "requiresConfirmation": false,
    "confirmationReason": "",
    "missingPlatforms": [],
    "plan": [
        {
            "step": 1,
            "action": "platform.method",
            "params": {},
            "description": "What this does",
            "usesResult": null,
            "estimatedSeconds": 2
        }
    ],
    "summary": "Brief summary of what will be done",
    "totalEstimatedSeconds": 10
}`;

    return await think(request, {
        system: systemPrompt,
        temperature: 0.2,
        maxTokens: 4096,
        json: true
    });
}

// ============================================
// HELPER: Get user token
// ============================================
async function getUserToken(email, platform) {
    const user = await User.findOne({ email: email.toLowerCase() })
        .select('+connectedAccounts.accessToken +connectedAccounts.refreshToken');
    if (!user) return null;
    
    const account = user.connectedAccounts?.find(acc => 
        acc.platform === platform && acc.isConnected
    );
    
    if (!account) return null;
    if (account.expiresAt && Date.now() > account.expiresAt) return null;
    
    return {
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        platformUserId: account.platformUserId,
        platformUsername: account.platformUsername,
        shopDomain: account.shopDomain || account.metadata?.shopDomain,
        metadata: account.metadata
    };
}

// ============================================
// HELPER: Get full repo name
// ============================================
async function getFullRepoName(token, repoName) {
    if (repoName.includes('/')) return repoName;
    const user = await tools.github.getUser(token);
    return `${user.login}/${repoName}`;
}
// ============================================
// TOOL IMPLEMENTATIONS
// ============================================

const tools = {
    // ==========================================
    // GITHUB
    // ==========================================
    github: {
        listRepos: async (token) => {
            const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!res.ok) throw new Error('Failed to fetch repos');
            const repos = await res.json();
            return repos.map(r => ({
                name: r.name, fullName: r.full_name, description: r.description,
                url: r.html_url, language: r.language, stars: r.stargazers_count,
                forks: r.forks_count, isPrivate: r.private, updatedAt: r.updated_at
            }));
        },

        getUser: async (token) => {
            const res = await fetch('https://api.github.com/user', {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!res.ok) throw new Error('Failed to fetch user');
            return res.json();
        },

        createRepo: async (token, name, description = '', isPrivate = false) => {
            const res = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description, private: isPrivate, auto_init: true })
            });
            if (!res.ok) throw new Error((await res.json()).message || 'Failed to create repo');
            return res.json();
        },

        deleteRepo: async (token, repo) => {
            const res = await fetch(`https://api.github.com/repos/${repo}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!res.ok) throw new Error('Failed to delete repo');
            return { success: true, deleted: repo };
        },

        listFiles: async (token, repo, path = '') => {
            const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!res.ok) throw new Error('Failed to list files');
            const data = await res.json();
            return (Array.isArray(data) ? data : [data]).map(f => ({
                name: f.name, path: f.path, type: f.type, size: f.size, sha: f.sha, url: f.html_url
            }));
        },

        getFileContent: async (token, repo, path) => {
            const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!res.ok) throw new Error('Failed to get file');
            const data = await res.json();
            return {
                name: data.name, path: data.path, sha: data.sha, size: data.size,
                content: Buffer.from(data.content, 'base64').toString('utf-8'), url: data.html_url
            };
        },

        createFile: async (token, repo, path, content, message = null) => {
            const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message || `Create ${path}`, content: Buffer.from(content).toString('base64') })
            });
            if (!res.ok) throw new Error((await res.json()).message || 'Failed to create file');
            return res.json();
        },

        updateFile: async (token, repo, path, content, message = null) => {
            const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            const sha = getRes.ok ? (await getRes.json()).sha : null;
            
            const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message || `Update ${path}`, content: Buffer.from(content).toString('base64'), ...(sha && { sha }) })
            });
            if (!res.ok) throw new Error('Failed to update file');
            return res.json();
        },

        deleteFile: async (token, repo, path, message = null) => {
            const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!getRes.ok) throw new Error('File not found');
            const { sha } = await getRes.json();
            
            const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message || `Delete ${path}`, sha })
            });
            if (!res.ok) throw new Error('Failed to delete file');
            return { success: true, deleted: path };
        },

        listIssues: async (token, repo, state = 'open') => {
            const res = await fetch(`https://api.github.com/repos/${repo}/issues?state=${state}&per_page=30`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!res.ok) throw new Error('Failed to fetch issues');
            return (await res.json()).map(i => ({
                number: i.number, title: i.title, state: i.state, body: i.body?.slice(0, 200),
                url: i.html_url, createdAt: i.created_at, labels: i.labels.map(l => l.name)
            }));
        },

        createIssue: async (token, repo, title, body = '') => {
            const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, body })
            });
            if (!res.ok) throw new Error('Failed to create issue');
            return res.json();
        },

        closeIssue: async (token, repo, issueNumber) => {
            const res = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ state: 'closed' })
            });
            if (!res.ok) throw new Error('Failed to close issue');
            return res.json();
        },

        listBranches: async (token, repo) => {
            const res = await fetch(`https://api.github.com/repos/${repo}/branches`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!res.ok) throw new Error('Failed to fetch branches');
            return (await res.json()).map(b => ({ name: b.name, protected: b.protected }));
        },

        listPullRequests: async (token, repo, state = 'open') => {
            const res = await fetch(`https://api.github.com/repos/${repo}/pulls?state=${state}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!res.ok) throw new Error('Failed to fetch PRs');
            return (await res.json()).map(pr => ({
                number: pr.number, title: pr.title, state: pr.state, url: pr.html_url,
                author: pr.user.login, head: pr.head.ref, base: pr.base.ref
            }));
        },

        getRepoStats: async (token, repo) => {
            const [repoRes, commitsRes] = await Promise.all([
                fetch(`https://api.github.com/repos/${repo}`, { headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' } }),
                fetch(`https://api.github.com/repos/${repo}/commits?per_page=5`, { headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' } })
            ]);
            const repoData = await repoRes.json();
            const commits = await commitsRes.json();
            return {
                name: repoData.name, fullName: repoData.full_name, description: repoData.description,
                stars: repoData.stargazers_count, forks: repoData.forks_count, openIssues: repoData.open_issues_count,
                language: repoData.language, size: repoData.size,
                recentCommits: (Array.isArray(commits) ? commits : []).slice(0, 5).map(c => ({
                    message: c.commit?.message?.split('\n')[0], author: c.commit?.author?.name, date: c.commit?.author?.date
                }))
            };
        },

        searchRepos: async (token, query) => {
            const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=10`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!res.ok) throw new Error('Search failed');
            return (await res.json()).items?.map(r => ({
                name: r.name, fullName: r.full_name, description: r.description, url: r.html_url, stars: r.stargazers_count, language: r.language
            })) || [];
        },

        forkRepo: async (token, repo) => {
            const res = await fetch(`https://api.github.com/repos/${repo}/forks`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!res.ok) throw new Error('Failed to fork');
            return res.json();
        },

        starRepo: async (token, repo) => {
            const res = await fetch(`https://api.github.com/user/starred/${repo}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!res.ok && res.status !== 204) throw new Error('Failed to star');
            return { success: true, starred: repo };
        }
    },

    // ==========================================
    // GOOGLE
    // ==========================================
    google: {
        getProfile: async (token) => {
            const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!res.ok) throw new Error('Failed to fetch profile');
            return res.json();
        },

        listCalendarEvents: async (token) => {
            const now = new Date().toISOString();
            const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&maxResults=15&singleEvents=true&orderBy=startTime`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!res.ok) throw new Error('Failed to fetch events');
            const data = await res.json();
            return (data.items || []).map(e => ({
                id: e.id, title: e.summary, description: e.description,
                start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date, location: e.location
            }));
        },

        createCalendarEvent: async (token, title, startTime, endTime, description = '', location = '') => {
            const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    summary: title, description, location,
                    start: { dateTime: startTime, timeZone: 'UTC' },
                    end: { dateTime: endTime, timeZone: 'UTC' }
                })
            });
            if (!res.ok) throw new Error('Failed to create event');
            return res.json();
        },

        deleteCalendarEvent: async (token, eventId) => {
            const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!res.ok && res.status !== 204) throw new Error('Failed to delete event');
            return { success: true, deleted: eventId };
        },

        listEmails: async (token, maxResults = 10) => {
            const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!res.ok) throw new Error('Failed to fetch emails');
            const data = await res.json();
            
            const emails = await Promise.all((data.messages || []).slice(0, 5).map(async (msg) => {
                const detail = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
                    headers: { 'Authorization': `Bearer ${token.accessToken}` }
                });
                const emailData = await detail.json();
                const headers = emailData.payload?.headers || [];
                return {
                    id: msg.id,
                    from: headers.find(h => h.name === 'From')?.value || 'Unknown',
                    subject: headers.find(h => h.name === 'Subject')?.value || 'No Subject',
                    date: headers.find(h => h.name === 'Date')?.value || ''
                };
            }));
            return emails;
        },

        sendEmail: async (token, to, subject, body) => {
            const message = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=utf-8', '', body].join('\n');
            const encoded = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
            
            const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw: encoded })
            });
            if (!res.ok) throw new Error('Failed to send email');
            return res.json();
        },

        listDriveFiles: async (token, maxResults = 20) => {
            const res = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=${maxResults}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!res.ok) throw new Error('Failed to fetch files');
            return (await res.json()).files || [];
        },

        createDriveFolder: async (token, name) => {
            const res = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' })
            });
            if (!res.ok) throw new Error('Failed to create folder');
            return res.json();
        },

        listContacts: async (token) => {
            const res = await fetch('https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=20', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!res.ok) throw new Error('Failed to fetch contacts');
            const data = await res.json();
            return (data.connections || []).map(c => ({
                name: c.names?.[0]?.displayName || 'Unknown',
                email: c.emailAddresses?.[0]?.value,
                phone: c.phoneNumbers?.[0]?.value
            }));
        }
    },

    // ==========================================
    // SHOPIFY
    // ==========================================
    shopify: {
        getShopInfo: async (token) => {
            const res = await fetch(`https://${token.shopDomain}/admin/api/2024-01/shop.json`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!res.ok) throw new Error('Failed to fetch shop');
            return (await res.json()).shop;
        },

        getProducts: async (token) => {
            const res = await fetch(`https://${token.shopDomain}/admin/api/2024-01/products.json?limit=50`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!res.ok) throw new Error('Failed to fetch products');
            return (await res.json()).products?.map(p => ({
                id: p.id, title: p.title, status: p.status, vendor: p.vendor, type: p.product_type,
                price: p.variants?.[0]?.price, inventory: p.variants?.reduce((s, v) => s + (v.inventory_quantity || 0), 0),
                images: p.images?.length || 0, createdAt: p.created_at
            })) || [];
        },

        createProduct: async (token, title, description = '', price = '0.00', inventory = 0, vendor = '', type = '') => {
            const res = await fetch(`https://${token.shopDomain}/admin/api/2024-01/products.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product: {
                        title, body_html: description, vendor: vendor || 'My Store', product_type: type, status: 'draft',
                        variants: [{ price, inventory_quantity: inventory, inventory_management: 'shopify' }]
                    }
                })
            });
            if (!res.ok) throw new Error('Failed to create product');
            return res.json();
        },

        updateProduct: async (token, productId, updates) => {
            const res = await fetch(`https://${token.shopDomain}/admin/api/2024-01/products/${productId}.json`, {
                method: 'PUT',
                headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ product: updates })
            });
            if (!res.ok) throw new Error('Failed to update product');
            return res.json();
        },

        deleteProduct: async (token, productId) => {
            const res = await fetch(`https://${token.shopDomain}/admin/api/2024-01/products/${productId}.json`, {
                method: 'DELETE',
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!res.ok) throw new Error('Failed to delete product');
            return { success: true, deleted: productId };
        },

        getOrders: async (token) => {
            const res = await fetch(`https://${token.shopDomain}/admin/api/2024-01/orders.json?status=any&limit=30`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!res.ok) throw new Error('Failed to fetch orders');
            return (await res.json()).orders?.map(o => ({
                id: o.id, orderNumber: o.order_number, total: o.total_price, subtotal: o.subtotal_price,
                status: o.financial_status, fulfillment: o.fulfillment_status || 'unfulfilled',
                customer: o.customer?.email || 'Guest', itemCount: o.line_items?.length || 0, createdAt: o.created_at
            })) || [];
        },

        getOrderDetails: async (token, orderId) => {
            const res = await fetch(`https://${token.shopDomain}/admin/api/2024-01/orders/${orderId}.json`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!res.ok) throw new Error('Failed to fetch order');
            return (await res.json()).order;
        },

        fulfillOrder: async (token, orderId) => {
            const res = await fetch(`https://${token.shopDomain}/admin/api/2024-01/orders/${orderId}/fulfillments.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ fulfillment: { notify_customer: true } })
            });
            if (!res.ok) throw new Error('Failed to fulfill order');
            return res.json();
        },

        getCustomers: async (token) => {
            const res = await fetch(`https://${token.shopDomain}/admin/api/2024-01/customers.json?limit=30`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!res.ok) throw new Error('Failed to fetch customers');
            return (await res.json()).customers?.map(c => ({
                id: c.id, email: c.email, name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
                ordersCount: c.orders_count, totalSpent: c.total_spent, createdAt: c.created_at
            })) || [];
        },

        getAnalytics: async (token) => {
            const res = await fetch(`https://${token.shopDomain}/admin/api/2024-01/orders.json?status=any&limit=250`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!res.ok) throw new Error('Failed to fetch analytics');
            const orders = (await res.json()).orders || [];
            
            const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
            const totalOrders = orders.length;
            const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
            const today = new Date().toISOString().split('T')[0];
            const todayOrders = orders.filter(o => o.created_at?.startsWith(today));
            
            return {
                totalRevenue: totalRevenue.toFixed(2), totalOrders, avgOrderValue: avgOrder.toFixed(2),
                todayRevenue: todayOrders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0).toFixed(2),
                todayOrders: todayOrders.length
            };
        },

        createDiscount: async (token, code, type = 'percentage', value = '10') => {
            const priceRuleRes = await fetch(`https://${token.shopDomain}/admin/api/2024-01/price_rules.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    price_rule: {
                        title: code, target_type: 'line_item', target_selection: 'all', allocation_method: 'across',
                        value_type: type, value: `-${value}`, customer_selection: 'all', starts_at: new Date().toISOString()
                    }
                })
            });
            if (!priceRuleRes.ok) throw new Error('Failed to create discount');
            const priceRule = await priceRuleRes.json();
            
            await fetch(`https://${token.shopDomain}/admin/api/2024-01/price_rules/${priceRule.price_rule.id}/discount_codes.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ discount_code: { code } })
            });
            
            return { success: true, code, type, value };
        },

        getInventory: async (token) => {
            const res = await fetch(`https://${token.shopDomain}/admin/api/2024-01/products.json?limit=100`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!res.ok) throw new Error('Failed to fetch inventory');
            const products = (await res.json()).products || [];
            
            let lowStock = [], outOfStock = [], totalInventory = 0;
            products.forEach(p => {
                p.variants?.forEach(v => {
                    const qty = v.inventory_quantity || 0;
                    totalInventory += qty;
                    if (qty === 0) outOfStock.push({ product: p.title, variant: v.title, sku: v.sku });
                    else if (qty < 10) lowStock.push({ product: p.title, variant: v.title, quantity: qty });
                });
            });
            
            return { totalInventory, totalProducts: products.length, lowStock: lowStock.slice(0, 10), outOfStock: outOfStock.slice(0, 10) };
        },

        getCollections: async (token) => {
            const res = await fetch(`https://${token.shopDomain}/admin/api/2024-01/custom_collections.json`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!res.ok) throw new Error('Failed to fetch collections');
            return (await res.json()).custom_collections || [];
        },

        createCollection: async (token, title, description = '') => {
            const res = await fetch(`https://${token.shopDomain}/admin/api/2024-01/custom_collections.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ custom_collection: { title, body_html: description } })
            });
            if (!res.ok) throw new Error('Failed to create collection');
            return res.json();
        },

        getThemes: async (token) => {
            const res = await fetch(`https://${token.shopDomain}/admin/api/2024-01/themes.json`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!res.ok) throw new Error('Failed to fetch themes');
            return (await res.json()).themes?.map(t => ({ id: t.id, name: t.name, role: t.role })) || [];
        }
    },

    // ==========================================
    // SPOTIFY
    // ==========================================
    spotify: {
        getProfile: async (token) => {
            const res = await fetch('https://api.spotify.com/v1/me', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed to fetch profile');
            return res.json();
        },

        getCurrentlyPlaying: async (token) => {
            const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (res.status === 204) return { isPlaying: false };
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            return { isPlaying: data.is_playing, track: data.item?.name, artist: data.item?.artists?.map(a => a.name).join(', '), album: data.item?.album?.name };
        },

        playTrack: async (token) => {
            const res = await fetch('https://api.spotify.com/v1/me/player/play', { method: 'PUT', headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok && res.status !== 204) throw new Error('Failed to play');
            return { success: true, action: 'play' };
        },

        pauseTrack: async (token) => {
            const res = await fetch('https://api.spotify.com/v1/me/player/pause', { method: 'PUT', headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok && res.status !== 204) throw new Error('Failed to pause');
            return { success: true, action: 'pause' };
        },

        nextTrack: async (token) => {
            const res = await fetch('https://api.spotify.com/v1/me/player/next', { method: 'POST', headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok && res.status !== 204) throw new Error('Failed to skip');
            return { success: true, action: 'next' };
        },

        previousTrack: async (token) => {
            const res = await fetch('https://api.spotify.com/v1/me/player/previous', { method: 'POST', headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok && res.status !== 204) throw new Error('Failed');
            return { success: true, action: 'previous' };
        },

        getTopTracks: async (token, timeRange = 'medium_term') => {
            const res = await fetch(`https://api.spotify.com/v1/me/top/tracks?limit=15&time_range=${timeRange}`, { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return (await res.json()).items?.map(t => ({ name: t.name, artist: t.artists.map(a => a.name).join(', '), album: t.album.name, url: t.external_urls.spotify })) || [];
        },

        getTopArtists: async (token, timeRange = 'medium_term') => {
            const res = await fetch(`https://api.spotify.com/v1/me/top/artists?limit=15&time_range=${timeRange}`, { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return (await res.json()).items?.map(a => ({ name: a.name, genres: a.genres.slice(0, 3), followers: a.followers.total, url: a.external_urls.spotify })) || [];
        },

        getPlaylists: async (token) => {
            const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=30', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return (await res.json()).items?.map(p => ({ id: p.id, name: p.name, tracks: p.tracks.total, url: p.external_urls.spotify, isPublic: p.public })) || [];
        },

        createPlaylist: async (token, name, description = '', isPublic = true) => {
            const userRes = await fetch('https://api.spotify.com/v1/me', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            const user = await userRes.json();
            
            const res = await fetch(`https://api.spotify.com/v1/users/${user.id}/playlists`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description, public: isPublic })
            });
            if (!res.ok) throw new Error('Failed to create playlist');
            return res.json();
        },

        addToPlaylist: async (token, playlistId, trackUris) => {
            const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ uris: Array.isArray(trackUris) ? trackUris : [trackUris] })
            });
            if (!res.ok) throw new Error('Failed to add tracks');
            return res.json();
        },

        searchTracks: async (token, query) => {
            const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=15`, { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Search failed');
            return (await res.json()).tracks?.items?.map(t => ({ id: t.id, uri: t.uri, name: t.name, artist: t.artists.map(a => a.name).join(', '), album: t.album.name, url: t.external_urls.spotify })) || [];
        },

        getRecentlyPlayed: async (token) => {
            const res = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=20', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return (await res.json()).items?.map(i => ({ track: i.track.name, artist: i.track.artists.map(a => a.name).join(', '), playedAt: i.played_at })) || [];
        },

        getSavedTracks: async (token) => {
            const res = await fetch('https://api.spotify.com/v1/me/tracks?limit=30', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return (await res.json()).items?.map(i => ({ name: i.track.name, artist: i.track.artists.map(a => a.name).join(', '), album: i.track.album.name, addedAt: i.added_at })) || [];
        }
    },

    // ==========================================
    // NOTION
    // ==========================================
    notion: {
        listDatabases: async (token) => {
            const res = await fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
                body: JSON.stringify({ filter: { property: 'object', value: 'database' } })
            });
            if (!res.ok) throw new Error('Failed');
            return (await res.json()).results?.map(d => ({ id: d.id, title: d.title?.[0]?.plain_text || 'Untitled', url: d.url })) || [];
        },

        listPages: async (token) => {
            const res = await fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
                body: JSON.stringify({ filter: { property: 'object', value: 'page' } })
            });
            if (!res.ok) throw new Error('Failed');
            return (await res.json()).results?.slice(0, 20).map(p => ({
                id: p.id, title: p.properties?.title?.title?.[0]?.plain_text || p.properties?.Name?.title?.[0]?.plain_text || 'Untitled', url: p.url
            })) || [];
        },

        createPage: async (token, parentId, title, content = '') => {
            const res = await fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    parent: { page_id: parentId },
                    properties: { title: { title: [{ text: { content: title } }] } },
                    children: content ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content } }] } }] : []
                })
            });
            if (!res.ok) throw new Error('Failed to create page');
            return res.json();
        },

        search: async (token, query) => {
            const res = await fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            if (!res.ok) throw new Error('Search failed');
            return (await res.json()).results?.slice(0, 15).map(r => ({
                id: r.id, type: r.object,
                title: r.properties?.title?.title?.[0]?.plain_text || r.properties?.Name?.title?.[0]?.plain_text || r.title?.[0]?.plain_text || 'Untitled',
                url: r.url
            })) || [];
        },

        queryDatabase: async (token, databaseId) => {
            const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_size: 20 })
            });
            if (!res.ok) throw new Error('Query failed');
            return res.json();
        }
    },

    // ==========================================
    // DISCORD
    // ==========================================
    discord: {
        getUser: async (token) => {
            const res = await fetch('https://discord.com/api/users/@me', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        },

        getGuilds: async (token) => {
            const res = await fetch('https://discord.com/api/users/@me/guilds', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return (await res.json()).map(g => ({ id: g.id, name: g.name, icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null, isOwner: g.owner }));
        },

        getGuildChannels: async (token, guildId) => {
            const res = await fetch(`https://discord.com/api/guilds/${guildId}/channels`, { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return (await res.json()).filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
        }
    },

    // ==========================================
    // SLACK
    // ==========================================
    slack: {
        getProfile: async (token) => {
            const res = await fetch('https://slack.com/api/users.identity', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        },

        listChannels: async (token) => {
            const res = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return (await res.json()).channels?.map(c => ({ id: c.id, name: c.name, isPrivate: c.is_private, memberCount: c.num_members })) || [];
        },

        sendMessage: async (token, channel, text) => {
            const res = await fetch('https://slack.com/api/chat.postMessage', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel, text })
            });
            if (!res.ok) throw new Error('Failed to send');
            return res.json();
        },

        getMessages: async (token, channel, limit = 10) => {
            const res = await fetch(`https://slack.com/api/conversations.history?channel=${channel}&limit=${limit}`, { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        }
    },

    // ==========================================
    // TWITTER
    // ==========================================
    twitter: {
        getProfile: async (token) => {
            const res = await fetch('https://api.twitter.com/2/users/me?user.fields=public_metrics,description', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        },

        getTweets: async (token) => {
            const userRes = await fetch('https://api.twitter.com/2/users/me', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            const user = await userRes.json();
            const res = await fetch(`https://api.twitter.com/2/users/${user.data.id}/tweets?max_results=10&tweet.fields=public_metrics,created_at`, { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        },

        postTweet: async (token, text) => {
            const res = await fetch('https://api.twitter.com/2/tweets', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            if (!res.ok) throw new Error('Failed to post');
            return res.json();
        },

        getFollowers: async (token) => {
            const userRes = await fetch('https://api.twitter.com/2/users/me', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            const user = await userRes.json();
            const res = await fetch(`https://api.twitter.com/2/users/${user.data.id}/followers?max_results=20`, { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        }
    },

    // ==========================================
    // STRAVA
    // ==========================================
    strava: {
        getAthlete: async (token) => {
            const res = await fetch('https://www.strava.com/api/v3/athlete', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        },

        getActivities: async (token, perPage = 15) => {
            const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}`, { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return (await res.json()).map(a => ({
                id: a.id, name: a.name, type: a.type, distance: (a.distance / 1000).toFixed(2) + ' km',
                duration: Math.round(a.moving_time / 60) + ' min', elevation: Math.round(a.total_elevation_gain) + ' m', date: a.start_date_local
            }));
        },

        getStats: async (token) => {
            const athlete = await tools.strava.getAthlete(token);
            const res = await fetch(`https://www.strava.com/api/v3/athletes/${athlete.id}/stats`, { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        }
    },

    // ==========================================
    // DROPBOX
    // ==========================================
    dropbox: {
        listFiles: async (token, path = '') => {
            const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: path || '', limit: 30 })
            });
            if (!res.ok) throw new Error('Failed');
            return (await res.json()).entries?.map(e => ({ name: e.name, type: e['.tag'], path: e.path_display, size: e.size })) || [];
        },

        createFolder: async (token, path) => {
            const res = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        },

        getSpaceUsage: async (token) => {
            const res = await fetch('https://api.dropboxapi.com/2/users/get_space_usage', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        },

        search: async (token, query) => {
            const res = await fetch('https://api.dropboxapi.com/2/files/search_v2', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            if (!res.ok) throw new Error('Search failed');
            return res.json();
        }
    },

    // ==========================================
    // FITBIT
    // ==========================================
    fitbit: {
        getProfile: async (token) => {
            const res = await fetch('https://api.fitbit.com/1/user/-/profile.json', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        },

        getActivitySummary: async (token) => {
            const today = new Date().toISOString().split('T')[0];
            const res = await fetch(`https://api.fitbit.com/1/user/-/activities/date/${today}.json`, { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        },

        getSleepLog: async (token) => {
            const today = new Date().toISOString().split('T')[0];
            const res = await fetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${today}.json`, { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        },

        getHeartRate: async (token) => {
            const today = new Date().toISOString().split('T')[0];
            const res = await fetch(`https://api.fitbit.com/1/user/-/activities/heart/date/${today}/1d.json`, { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        }
    },

    // ==========================================
    // LINKEDIN
    // ==========================================
    linkedin: {
        getProfile: async (token) => {
            const res = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { 'Authorization': `Bearer ${token.accessToken}` } });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        }
    }
};

// ==========================================
// SPECIAL AI TOOLS
// ==========================================
const aiTools = {
    generateCode: async (description, language = 'javascript', context = {}) => {
        const result = await think(`Generate production-ready ${language} code for: ${description}

${context.existingCode ? `Existing code to modify:\n${context.existingCode}\n` : ''}

Requirements:
- Clean, well-documented code
- Include error handling
- Follow best practices
- Make it complete and functional

Respond with JSON only:
{
    "filename": "suggested_filename.ext",
    "content": "the complete code",
    "explanation": "brief explanation"
}`, { system: 'You are an expert programmer. Generate clean code. Respond with JSON only.', temperature: 0.3, json: true });
        
        return result;
    },

    generateProject: async (name, type, description = '') => {
        const result = await think(`Generate a complete ${type} project called "${name}".
${description ? `Description: ${description}` : ''}

Create all necessary files including:
- README.md with setup instructions
- Package configuration
- Main source files
- Config files (.gitignore, etc.)

Respond with JSON only:
{
    "description": "Brief description for repo",
    "files": [
        {"path": "README.md", "content": "..."},
        {"path": "package.json", "content": "..."},
        {"path": "src/index.js", "content": "..."}
    ]
}`, { system: 'You are a software architect. Generate complete project structures. JSON only.', temperature: 0.3, maxTokens: 8000, json: true });
        
        return result;
    },

    analyzeData: async (data, question) => {
        return await think(`Analyze this data and answer: ${question}\n\nData:\n${JSON.stringify(data, null, 2)}`, {
            system: 'You are a data analyst. Provide clear insights.',
            temperature: 0.5
        });
    },

    summarize: async (content) => {
        return await think(`Summarize this content concisely:\n\n${content}`, {
            system: 'You are an expert summarizer. Be concise but comprehensive.',
            temperature: 0.3
        });
    },

    translate: async (content, targetLanguage) => {
        return await think(`Translate to ${targetLanguage}:\n\n${content}`, {
            system: 'You are an expert translator. Maintain meaning and tone.',
            temperature: 0.2
        });
    }
};
// ============================================
// AUTONOMOUS EXECUTION ENGINE
// ============================================
async function executeStep(step, email, previousResults = {}, connectedPlatforms = []) {
    const [platform, method] = step.action.split('.');
    
    // Handle AI tools
    if (platform === 'generateCode') {
        return await aiTools.generateCode(step.params?.description, step.params?.language, step.params?.context);
    }
    if (platform === 'generateProject') {
        return await aiTools.generateProject(step.params?.name, step.params?.type, step.params?.description);
    }
    if (platform === 'analyzeData') {
        return await aiTools.analyzeData(step.params?.data, step.params?.question);
    }
    if (platform === 'summarize') {
        return await aiTools.summarize(step.params?.content);
    }
    if (platform === 'translate') {
        return await aiTools.translate(step.params?.content, step.params?.targetLanguage);
    }
    
    // Get token for platform
    const token = await getUserToken(email, platform);
    if (!token) {
        throw new Error(`${platform} is not connected`);
    }
    
    // Get tool function
    const toolFn = tools[platform]?.[method];
    if (!toolFn) {
        throw new Error(`Unknown action: ${step.action}`);
    }
    
    // Resolve parameters - replace $stepX references with actual values
    let params = { ...step.params };
    for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'string' && value.startsWith('$step')) {
            const stepNum = parseInt(value.replace('$step', '').split('.')[0]);
            const path = value.replace(`$step${stepNum}`, '').replace(/^\./, '');
            let resolved = previousResults[stepNum];
            if (path && resolved) {
                for (const part of path.split('.')) {
                    resolved = resolved?.[part];
                }
            }
            params[key] = resolved;
        }
    }
    
    // Handle special cases
    if (platform === 'github' && params.repo && !params.repo.includes('/')) {
        const user = await tools.github.getUser(token);
        params.repo = `${user.login}/${params.repo}`;
    }
    
    if (platform === 'shopify') {
        token.shopDomain = token.shopDomain || token.metadata?.shopDomain;
        if (!token.shopDomain) throw new Error('Shopify shop domain not found');
    }
    
    // Execute with appropriate parameters
    const paramValues = Object.values(params).filter(v => v !== undefined && v !== null);
    
    if (platform === 'shopify') {
        return await toolFn(token, ...paramValues);
    }
    
    return await toolFn(token, ...paramValues);
}

async function executePlan(plan, email, connectedPlatforms, onProgress = null) {
    const results = {};
    const executionLog = [];
    
    for (const step of plan) {
        const startTime = Date.now();
        
        try {
            if (onProgress) onProgress({ step: step.step, status: 'running', description: step.description });
            
            const result = await executeStep(step, email, results, connectedPlatforms);
            results[step.step] = result;
            
            executionLog.push({
                step: step.step,
                action: step.action,
                status: 'success',
                duration: Date.now() - startTime,
                result: typeof result === 'object' ? JSON.stringify(result).slice(0, 500) : result
            });
            
            if (onProgress) onProgress({ step: step.step, status: 'complete', result });
            
            // Small delay between steps
            await new Promise(r => setTimeout(r, 300));
            
        } catch (error) {
            executionLog.push({
                step: step.step,
                action: step.action,
                status: 'error',
                error: error.message,
                duration: Date.now() - startTime
            });
            
            if (onProgress) onProgress({ step: step.step, status: 'error', error: error.message });
            
            // Continue with other steps if possible
        }
    }
    
    return { results, executionLog };
}

// ============================================
// AUTOMATION SYSTEM
// ============================================

// Parse schedule string (e.g., "every day at 8am", "every hour", "every monday at 9am")
function parseSchedule(scheduleString) {
    const lower = scheduleString.toLowerCase();
    
    if (lower.includes('every hour')) {
        return { type: 'interval', intervalMs: 60 * 60 * 1000 };
    }
    if (lower.includes('every') && lower.includes('minute')) {
        const match = lower.match(/every\s+(\d+)\s+minute/);
        const mins = match ? parseInt(match[1]) : 30;
        return { type: 'interval', intervalMs: mins * 60 * 1000 };
    }
    if (lower.includes('every day') || lower.includes('daily')) {
        const timeMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        let hour = timeMatch ? parseInt(timeMatch[1]) : 8;
        if (timeMatch?.[3]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
        if (timeMatch?.[3]?.toLowerCase() === 'am' && hour === 12) hour = 0;
        return { type: 'daily', hour, minute: parseInt(timeMatch?.[2] || '0') };
    }
    if (lower.includes('every week') || lower.includes('weekly')) {
        const dayMatch = lower.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
        const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
        const dayOfWeek = dayMatch ? days[dayMatch[1].toLowerCase()] : 1;
        const timeMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        let hour = timeMatch ? parseInt(timeMatch[1]) : 9;
        if (timeMatch?.[3]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
        return { type: 'weekly', dayOfWeek, hour, minute: parseInt(timeMatch?.[2] || '0') };
    }
    
    // Default to every 4 hours
    return { type: 'interval', intervalMs: 4 * 60 * 60 * 1000 };
}

function getNextRunTime(schedule) {
    const now = new Date();
    
    if (schedule.type === 'interval') {
        return new Date(now.getTime() + schedule.intervalMs);
    }
    
    if (schedule.type === 'daily') {
        const next = new Date(now);
        next.setHours(schedule.hour, schedule.minute, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        return next;
    }
    
    if (schedule.type === 'weekly') {
        const next = new Date(now);
        next.setHours(schedule.hour, schedule.minute, 0, 0);
        const daysUntil = (schedule.dayOfWeek - now.getDay() + 7) % 7 || 7;
        next.setDate(now.getDate() + daysUntil);
        if (next <= now) next.setDate(next.getDate() + 7);
        return next;
    }
    
    return new Date(now.getTime() + 60 * 60 * 1000);
}

async function runAutomation(automation, email) {
    console.log(`Running automation: ${automation.name} for ${email}`);
    
    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return { success: false, error: 'User not found' };
        
        const connectedPlatforms = (user.connectedAccounts || [])
            .filter(a => a.isConnected)
            .map(a => a.platform);
        
        // Plan the automation task
        const plan = await planExecution(automation.task, connectedPlatforms, {
            userName: user.name,
            goal: user.goal?.title
        });
        
        if (!plan.canExecute || !plan.plan?.length) {
            return { success: false, error: 'Could not plan automation', plan };
        }
        
        // Execute the plan
        const { results, executionLog } = await executePlan(plan.plan, email, connectedPlatforms);
        
        // Generate summary
        const summary = await think(`Summarize what was accomplished in this automation run:
Task: ${automation.task}
Results: ${JSON.stringify(executionLog, null, 2)}

Be concise - 1-2 sentences.`, { temperature: 0.5, maxTokens: 200 });
        
        return { success: true, results, executionLog, summary };
        
    } catch (error) {
        console.error(`Automation error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

function scheduleAutomation(automationId, email, schedule, task, name) {
    // Clear existing if any
    if (automationIntervals.has(automationId)) {
        clearTimeout(automationIntervals.get(automationId));
    }
    
    const parsedSchedule = parseSchedule(schedule);
    const nextRun = getNextRunTime(parsedSchedule);
    const msUntilNext = nextRun.getTime() - Date.now();
    
    console.log(`Scheduling automation ${name} to run at ${nextRun.toISOString()}`);
    
    const timeoutId = setTimeout(async () => {
        const result = await runAutomation({ id: automationId, name, task }, email);
        
        // Store result
        automationResults.set(automationId, {
            lastRun: Date.now(),
            result
        });
        
        // Reschedule
        scheduleAutomation(automationId, email, schedule, task, name);
        
    }, Math.min(msUntilNext, 2147483647)); // Max setTimeout value
    
    automationIntervals.set(automationId, timeoutId);
    activeAutomations.set(automationId, { email, schedule, task, name, nextRun: nextRun.toISOString() });
}

function stopAutomation(automationId) {
    if (automationIntervals.has(automationId)) {
        clearTimeout(automationIntervals.get(automationId));
        automationIntervals.delete(automationId);
    }
    activeAutomations.delete(automationId);
}
// ============================================
// FORMAT RESULTS FOR DISPLAY
// ============================================
function formatResult(action, data) {
    if (!data) return 'No data returned';
    if (typeof data === 'string') return data;
    if (data.error) return `Error: ${data.error}`;
    
    const [platform, method] = action.split('.');
    
    // GitHub formatting
    if (platform === 'github') {
        if (method === 'listRepos' && Array.isArray(data)) {
            return `Found ${data.length} repositories:\n${data.slice(0, 10).map(r => `- **${r.name}**${r.description ? `: ${r.description}` : ''} (${r.language || 'N/A'}, ${r.stars} stars)`).join('\n')}`;
        }
        if (method === 'createRepo') return `Created repository **${data.name}**: ${data.html_url}`;
        if (method === 'createFile') return `Created file: ${data.content?.html_url}`;
        if (method === 'listFiles' && Array.isArray(data)) {
            return `Files:\n${data.map(f => `- ${f.type === 'dir' ? '📁' : '📄'} ${f.name}`).join('\n')}`;
        }
    }
    
    // Shopify formatting
    if (platform === 'shopify') {
        if (method === 'getProducts' && Array.isArray(data)) {
            return `Products (${data.length}):\n${data.slice(0, 10).map(p => `- **${p.title}**: $${p.price} (${p.inventory} in stock)`).join('\n')}`;
        }
        if (method === 'getAnalytics') {
            return `**Store Analytics**\n- Revenue: $${data.totalRevenue}\n- Orders: ${data.totalOrders}\n- Avg Order: $${data.avgOrderValue}\n- Today: $${data.todayRevenue} (${data.todayOrders} orders)`;
        }
        if (method === 'createProduct') return `Created product: **${data.product?.title}**`;
    }
    
    // Spotify formatting
    if (platform === 'spotify') {
        if (method === 'getCurrentlyPlaying') {
            return data.isPlaying ? `Now playing: **${data.track}** by ${data.artist}` : 'Nothing playing';
        }
        if (method === 'getTopTracks' && Array.isArray(data)) {
            return `Top tracks:\n${data.map((t, i) => `${i + 1}. **${t.name}** - ${t.artist}`).join('\n')}`;
        }
        if (method === 'createPlaylist') return `Created playlist: **${data.name}** - ${data.external_urls?.spotify}`;
    }
    
    // Google formatting
    if (platform === 'google') {
        if (method === 'listCalendarEvents' && Array.isArray(data)) {
            return `Upcoming events:\n${data.slice(0, 10).map(e => `- **${e.title}** - ${new Date(e.start).toLocaleString()}`).join('\n')}`;
        }
        if (method === 'sendEmail') return `Email sent! ID: ${data.id}`;
    }
    
    // Default JSON formatting
    return JSON.stringify(data, null, 2).slice(0, 1000);
}

// ============================================
// API ROUTES
// ============================================

// Main autonomous chat endpoint
router.post('/chat', async (req, res) => {
    try {
        const { email, message, connectedPlatforms = [], goal, userName, history = [] } = req.body;
        
        if (!email || !message) {
            return res.status(400).json({ error: 'Email and message required' });
        }
        
        console.log(`\n🤖 Master Agent request from ${email}: ${message.slice(0, 100)}...`);
        
        // Plan the execution
        const plan = await planExecution(message, connectedPlatforms, { userName, goal: goal?.title });
        
        let response = '';
        let executionLog = [];
        let toolsUsed = [];
        
        if (plan.canExecute && plan.plan?.length > 0) {
            console.log(`📋 Execution plan: ${plan.plan.length} steps`);
            
            // Check if confirmation needed
            if (plan.requiresConfirmation) {
                return res.json({
                    response: `I'll need your confirmation before proceeding.\n\n**What I'll do:**\n${plan.summary}\n\n**Reason:** ${plan.confirmationReason}\n\nReply "yes" or "confirm" to proceed.`,
                    requiresConfirmation: true,
                    pendingPlan: plan,
                    success: true
                });
            }
            
            // Execute the plan
            const execution = await executePlan(plan.plan, email, connectedPlatforms);
            executionLog = execution.executionLog;
            
            // Collect used tools
            toolsUsed = [...new Set(plan.plan.map(s => s.action.split('.')[0]))];
            
            // Generate response based on results
            const successfulSteps = executionLog.filter(l => l.status === 'success');
            const failedSteps = executionLog.filter(l => l.status === 'error');
            
            // Format results
            let resultsText = '';
            for (const step of plan.plan) {
                const log = executionLog.find(l => l.step === step.step);
                if (log?.status === 'success' && execution.results[step.step]) {
                    resultsText += `\n\n**${step.description}:**\n${formatResult(step.action, execution.results[step.step])}`;
                }
            }
            
            // Generate natural response
            response = await think(`You just executed these actions for a user:
Plan: ${plan.summary}
Results: ${resultsText}
${failedSteps.length > 0 ? `\nFailed steps: ${failedSteps.map(f => f.action + ': ' + f.error).join(', ')}` : ''}

Generate a natural, helpful response summarizing what was accomplished. Use **bold** for emphasis. Be concise.`, {
                system: 'You are a helpful AI assistant. Summarize accomplished tasks naturally.',
                temperature: 0.7,
                maxTokens: 500
            });
            
            if (resultsText) {
                response += '\n\n---\n**Details:**' + resultsText;
            }
            
        } else if (plan.missingPlatforms?.length > 0) {
            response = `To complete this request, I need access to: **${plan.missingPlatforms.join(', ')}**.\n\nPlease connect these platforms in the Settings tab, then try again.`;
        } else {
            // No tools needed - just chat
            response = await think(message, {
                system: `You are Master Agent, an autonomous AI assistant. You help users accomplish tasks using their connected apps.

Connected platforms: ${connectedPlatforms.join(', ') || 'None'}
User: ${userName || 'User'}
Goal: ${goal?.title || 'Not specified'}

Be helpful, concise, and proactive. If the user asks something you can't do autonomously, explain what they need to connect or do manually.`,
                history: history.slice(-10).map(m => ({ role: m.role, content: m.content })),
                temperature: 0.7,
                maxTokens: 1000
            });
        }
        
        res.json({
            response,
            toolsUsed,
            executionLog,
            plan: plan.canExecute ? plan : null,
            success: true
        });
        
    } catch (error) {
        console.error('Master Agent error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Execute a pending plan after confirmation
router.post('/execute-plan', async (req, res) => {
    try {
        const { email, plan, connectedPlatforms = [] } = req.body;
        
        if (!email || !plan?.plan) {
            return res.status(400).json({ error: 'Email and plan required' });
        }
        
        const { results, executionLog } = await executePlan(plan.plan, email, connectedPlatforms);
        
        res.json({
            success: true,
            results,
            executionLog
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Direct tool execution
router.post('/execute', async (req, res) => {
    try {
        const { email, action, params = {} } = req.body;
        
        if (!email || !action) {
            return res.status(400).json({ error: 'Email and action required' });
        }
        
        const result = await executeStep({ action, params }, email, {}, []);
        
        res.json({
            success: true,
            action,
            result,
            formatted: formatResult(action, result)
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get available actions for user
router.get('/actions/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email.toLowerCase() });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const connectedPlatforms = (user.connectedAccounts || [])
            .filter(a => a.isConnected)
            .map(a => a.platform);
        
        const availableActions = [];
        for (const platform of connectedPlatforms) {
            if (tools[platform]) {
                for (const action of Object.keys(tools[platform])) {
                    availableActions.push({ platform, action, full: `${platform}.${action}` });
                }
            }
        }
        
        res.json({ success: true, connectedPlatforms, availableActions, aiTools: Object.keys(aiTools) });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// AUTOMATION ROUTES
// ============================================

// Create automation
router.post('/automations', async (req, res) => {
    try {
        const { email, name, description, task, schedule, enabled = true } = req.body;
        
        if (!email || !name || !task || !schedule) {
            return res.status(400).json({ error: 'Email, name, task, and schedule required' });
        }
        
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        // Generate ID
        const automationId = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        // Parse schedule to get next run
        const parsedSchedule = parseSchedule(schedule);
        const nextRun = getNextRunTime(parsedSchedule);
        
        const automation = {
            id: automationId,
            name,
            description: description || '',
            task,
            schedule,
            enabled,
            createdAt: Date.now(),
            nextRun: nextRun.toISOString(),
            lastRun: null,
            lastResult: null
        };
        
        // Save to user
        if (!user.automations) user.automations = [];
        user.automations.push(automation);
        await user.save();
        
        // Start if enabled
        if (enabled) {
            scheduleAutomation(automationId, email, schedule, task, name);
        }
        
        res.json({ success: true, automation });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get user's automations
router.get('/automations/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email.toLowerCase() });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const automations = (user.automations || []).map(a => ({
            ...a,
            isRunning: activeAutomations.has(a.id),
            lastRunResult: automationResults.get(a.id)
        }));
        
        res.json({ success: true, automations });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update automation
router.put('/automations/:id', async (req, res) => {
    try {
        const { email, name, description, task, schedule, enabled } = req.body;
        const { id } = req.params;
        
        if (!email) return res.status(400).json({ error: 'Email required' });
        
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const automationIndex = user.automations?.findIndex(a => a.id === id);
        if (automationIndex === -1) return res.status(404).json({ error: 'Automation not found' });
        
        const automation = user.automations[automationIndex];
        
        if (name) automation.name = name;
        if (description !== undefined) automation.description = description;
        if (task) automation.task = task;
        if (schedule) {
            automation.schedule = schedule;
            const parsedSchedule = parseSchedule(schedule);
            automation.nextRun = getNextRunTime(parsedSchedule).toISOString();
        }
        if (enabled !== undefined) {
            automation.enabled = enabled;
            
            if (enabled) {
                scheduleAutomation(id, email, automation.schedule, automation.task, automation.name);
            } else {
                stopAutomation(id);
            }
        }
        
        await user.save();
        
        res.json({ success: true, automation });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete automation
router.delete('/automations/:id', async (req, res) => {
    try {
        const { email } = req.body;
        const { id } = req.params;
        
        if (!email) return res.status(400).json({ error: 'Email required' });
        
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        user.automations = (user.automations || []).filter(a => a.id !== id);
        await user.save();
        
        stopAutomation(id);
        
        res.json({ success: true, deleted: id });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Run automation manually
router.post('/automations/:id/run', async (req, res) => {
    try {
        const { email } = req.body;
        const { id } = req.params;
        
        if (!email) return res.status(400).json({ error: 'Email required' });
        
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const automation = user.automations?.find(a => a.id === id);
        if (!automation) return res.status(404).json({ error: 'Automation not found' });
        
        const result = await runAutomation(automation, email);
        
        // Update last run
        automation.lastRun = Date.now();
        automation.lastResult = result.success ? 'success' : 'error';
        await user.save();
        
        res.json({ success: true, result });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Initialize automations on server start
async function initializeAutomations() {
    try {
        const users = await User.find({ 'automations.enabled': true });
        
        for (const user of users) {
            for (const automation of user.automations || []) {
                if (automation.enabled) {
                    scheduleAutomation(automation.id, user.email, automation.schedule, automation.task, automation.name);
                }
            }
        }
        
        console.log(`✅ Initialized ${activeAutomations.size} automations`);
    } catch (error) {
        console.error('Failed to initialize automations:', error);
    }
}

// Call on module load
setTimeout(initializeAutomations, 5000);

export default router;
