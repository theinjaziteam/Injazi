// service/masterAgentRoutes.js
// MASTER AGENT - Fully Autonomous AI Agent System with Automations
import express from 'express';
import { User } from './models.js';

const router = express.Router();

// ============================================
// CONFIGURATION
// ============================================
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ============================================
// IN-MEMORY AUTOMATION SCHEDULER
// ============================================
const runningAutomations = new Map();
const automationResults = new Map();

// ============================================
// CORE AI ENGINE
// ============================================
async function think(prompt, options = {}) {
    const { systemPrompt, jsonMode = false, temperature = 0.7, maxTokens = 4096 } = options;
    
    try {
        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: prompt });

        const response = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages,
                temperature,
                max_tokens: maxTokens,
                ...(jsonMode && { response_format: { type: 'json_object' } })
            })
        });

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        if (jsonMode) {
            try { return JSON.parse(content); } 
            catch { return { raw: content }; }
        }
        return content;
    } catch (error) {
        console.error('AI Think Error:', error);
        throw error;
    }
}

// ============================================
// HELPER: GET USER TOKEN (FIXED - checks both arrays)
// ============================================
async function getUserToken(email, platform) {
    const user = await User.findOne({ email });
    if (!user) throw new Error('User not found');
    
    const platformLower = platform.toLowerCase();
    let account = null;
    
    // Check connectedAccounts array
    if (user.connectedAccounts && user.connectedAccounts.length > 0) {
        account = user.connectedAccounts.find(a => 
            a && a.platform && a.platform.toLowerCase() === platformLower && a.accessToken
        );
    }
    
    // Check connectedOAuthAccounts array (used by oauthRoutes.js)
    if (!account && user.connectedOAuthAccounts && user.connectedOAuthAccounts.length > 0) {
        account = user.connectedOAuthAccounts.find(a => 
            a && a.platform && a.platform.toLowerCase() === platformLower && a.accessToken
        );
    }
    
    if (!account) {
        console.log(`[getUserToken] Platform "${platform}" not found for ${email}`);
        console.log(`[getUserToken] connectedAccounts:`, user.connectedAccounts?.map(a => a?.platform) || []);
        console.log(`[getUserToken] connectedOAuthAccounts:`, user.connectedOAuthAccounts?.map(a => a?.platform) || []);
        throw new Error(`${platform} not connected`);
    }
    
    // Check expiry
    if (account.tokenExpiry && new Date(account.tokenExpiry) < new Date()) {
        throw new Error(`${platform} token expired - please reconnect`);
    }
    
    console.log(`[getUserToken] Found ${platform} token for ${email}`);
    
    return {
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        shopDomain: account.shopDomain || account.metadata?.shopDomain,
        metadata: account.metadata || {}
    };
}

// ============================================
// HELPER: GET CONNECTED PLATFORMS (FIXED)
// ============================================
function getConnectedPlatforms(user) {
    const allAccounts = [
        ...(user?.connectedAccounts || []),
        ...(user?.connectedOAuthAccounts || [])
    ];
    
    const platforms = allAccounts
        .filter(a => a && a.platform && a.accessToken)
        .map(a => a.platform.toLowerCase());
    
    // Remove duplicates
    return [...new Set(platforms)];
}

// ============================================
// HELPER: GET FULL REPO NAME
// ============================================
async function getFullRepoName(accessToken, repoName) {
    if (repoName.includes('/')) return repoName;
    const response = await fetch('https://api.github.com/user', {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    const user = await response.json();
    return `${user.login}/${repoName}`;
}

// ============================================
// AUTONOMOUS TASK PLANNER
// ============================================
async function planExecution(userRequest, connectedPlatforms, userContext = {}) {
    const platformList = connectedPlatforms.length > 0 ? connectedPlatforms.join(', ') : 'None';
    
    const systemPrompt = `You are an autonomous AI agent planner. Your job is to break down user requests into executable steps.

CONNECTED PLATFORMS: ${platformList}

AVAILABLE TOOLS BY PLATFORM:

${connectedPlatforms.includes('github') ? `
GITHUB:
- github.listRepos - List all user repositories
- github.getUser - Get GitHub user profile
- github.createRepo - Create new repository (params: name, description, isPrivate)
- github.deleteRepo - Delete repository (params: repo)
- github.listFiles - List files in repo (params: repo, path)
- github.getFileContent - Get file content (params: repo, path)
- github.createFile - Create file (params: repo, path, content, message)
- github.updateFile - Update file (params: repo, path, content, message)
- github.deleteFile - Delete file (params: repo, path, message)
- github.listIssues - List issues (params: repo, state)
- github.createIssue - Create issue (params: repo, title, body)
- github.closeIssue - Close issue (params: repo, issueNumber)
- github.listBranches - List branches (params: repo)
- github.getRepoStats - Get repo statistics (params: repo)
- github.searchRepos - Search repositories (params: query)
` : ''}

${connectedPlatforms.includes('google') ? `
GOOGLE:
- google.getProfile - Get user profile
- google.listCalendarEvents - List calendar events
- google.createCalendarEvent - Create event (params: summary, startTime, endTime, description)
- google.deleteCalendarEvent - Delete event (params: eventId)
- google.listEmails - List emails (params: maxResults, query)
- google.sendEmail - Send email (params: to, subject, body)
- google.listDriveFiles - List Drive files
- google.createDriveFolder - Create folder (params: name)
` : ''}

${connectedPlatforms.includes('shopify') ? `
SHOPIFY:
- shopify.getShopInfo - Get shop details
- shopify.getProducts - List products
- shopify.createProduct - Create product (params: title, description, price, vendor)
- shopify.updateProduct - Update product (params: productId, updates)
- shopify.deleteProduct - Delete product (params: productId)
- shopify.getOrders - List orders
- shopify.getAnalytics - Get shop analytics
- shopify.getInventory - Get inventory levels
- shopify.createDiscount - Create discount (params: code, value, type)
` : ''}

${connectedPlatforms.includes('spotify') ? `
SPOTIFY:
- spotify.getProfile - Get user profile
- spotify.getCurrentlyPlaying - Get current track
- spotify.getTopTracks - Get top tracks (params: timeRange, limit)
- spotify.getTopArtists - Get top artists
- spotify.getPlaylists - List playlists
- spotify.createPlaylist - Create playlist (params: name, description, isPublic)
- spotify.addToPlaylist - Add tracks (params: playlistId, trackUris)
- spotify.playTrack - Play/resume
- spotify.pauseTrack - Pause
- spotify.nextTrack - Next track
- spotify.previousTrack - Previous track
- spotify.searchTracks - Search tracks (params: query)
- spotify.getRecentlyPlayed - Recently played
` : ''}

${connectedPlatforms.includes('notion') ? `
NOTION:
- notion.listDatabases - List databases
- notion.listPages - List pages
- notion.createPage - Create page (params: parentId, title, content)
- notion.search - Search Notion (params: query)
` : ''}

${connectedPlatforms.includes('discord') ? `
DISCORD:
- discord.getUser - Get profile
- discord.getGuilds - List servers
` : ''}

${connectedPlatforms.includes('slack') ? `
SLACK:
- slack.getProfile - Get profile
- slack.listChannels - List channels
- slack.sendMessage - Send message (params: channel, text)
- slack.getMessages - Get messages (params: channel, limit)
` : ''}

${connectedPlatforms.includes('twitter') ? `
TWITTER:
- twitter.getProfile - Get profile
- twitter.getTweets - Get tweets
- twitter.postTweet - Post tweet (params: text)
- twitter.getFollowers - Get followers
` : ''}

${connectedPlatforms.includes('strava') ? `
STRAVA:
- strava.getAthlete - Get profile
- strava.getActivities - List activities
- strava.getStats - Get stats
` : ''}

${connectedPlatforms.includes('dropbox') ? `
DROPBOX:
- dropbox.listFiles - List files (params: path)
- dropbox.createFolder - Create folder (params: path)
- dropbox.getSpaceUsage - Check storage
- dropbox.search - Search files (params: query)
` : ''}

${connectedPlatforms.includes('fitbit') ? `
FITBIT:
- fitbit.getProfile - Get profile
- fitbit.getActivitySummary - Activity summary
- fitbit.getSleepLog - Sleep data
- fitbit.getHeartRate - Heart rate
` : ''}

AI TOOLS (always available):
- ai.generateCode - Generate code (params: description, language)
- ai.generateProject - Generate project structure (params: name, type, description)
- ai.analyzeData - Analyze data (params: data, question)
- ai.summarize - Summarize text (params: text, maxLength)
- ai.translate - Translate text (params: text, targetLanguage)

USER CONTEXT:
- Name: ${userContext.userName || 'User'}
- Goal: ${userContext.goal || 'Not specified'}

RULES FOR PLANNING:
1. Break complex requests into simple, sequential steps
2. Each step should use ONE tool/action
3. Reference previous step results with $step1, $step2, etc. (e.g., $step1.name, $step1.fullName)
4. If a required platform is not connected, mark canComplete as false and list it in missingPlatforms
5. Extract specific values from the request (names, descriptions, settings)
6. For code generation + file creation: first use ai.generateCode, then github.createFile with $step1.content
7. Be proactive - if user wants a repo with files, plan both repo creation AND file creation
8. For private repos, set isPrivate: true in params

RESPONSE FORMAT (JSON only):
{
    "understanding": "Brief summary of what user wants",
    "canComplete": true,
    "missingPlatforms": [],
    "steps": [
        {
            "stepNumber": 1,
            "description": "Human readable description",
            "tool": "platform",
            "action": "actionName",
            "params": { "key": "value" },
            "dependsOn": null
        }
    ],
    "summary": "What will be accomplished",
    "warnings": []
}`;

    return await think(userRequest, { systemPrompt, jsonMode: true, temperature: 0.2 });
}

// ============================================
// TOOL IMPLEMENTATIONS - GITHUB
// ============================================
const tools = {
    github: {
        async listRepos(token) {
            const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('Failed to fetch repos');
            const repos = await response.json();
            return repos.map(r => ({
                name: r.name, fullName: r.full_name, description: r.description, language: r.language,
                stars: r.stargazers_count, forks: r.forks_count, url: r.html_url, private: r.private, updatedAt: r.updated_at
            }));
        },

        async getUser(token) {
            const response = await fetch('https://api.github.com/user', {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('Failed to fetch user');
            const user = await response.json();
            return { login: user.login, name: user.name, email: user.email, bio: user.bio, followers: user.followers, publicRepos: user.public_repos };
        },

        async createRepo(token, params) {
            console.log('[GitHub] Creating repo:', params.name, 'Private:', params.isPrivate);
            const response = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: params.name, 
                    description: params.description || '', 
                    private: params.isPrivate === true || params.isPrivate === 'true' || params.private === true,
                    auto_init: true 
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to create repo');
            console.log('[GitHub] Repo created:', data.full_name);
            return { name: data.name, fullName: data.full_name, url: data.html_url, private: data.private };
        },

        async deleteRepo(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            const response = await fetch(`https://api.github.com/repos/${fullName}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (response.status === 204) return { success: true, deleted: fullName };
            throw new Error('Failed to delete repository');
        },

        async listFiles(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            const path = params.path || '';
            const response = await fetch(`https://api.github.com/repos/${fullName}/contents/${path}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('Failed to list files');
            const data = await response.json();
            const items = Array.isArray(data) ? data : [data];
            return items.map(item => ({ name: item.name, path: item.path, type: item.type, size: item.size, url: item.html_url }));
        },

        async getFileContent(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            const response = await fetch(`https://api.github.com/repos/${fullName}/contents/${params.path}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('File not found');
            const data = await response.json();
            return { name: data.name, path: data.path, sha: data.sha, content: Buffer.from(data.content, 'base64').toString('utf-8'), url: data.html_url };
        },

        async createFile(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            console.log('[GitHub] Creating file:', params.path, 'in', fullName);
            
            // Wait a moment for repo to be fully initialized
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const content = params.content || '';
            const response = await fetch(`https://api.github.com/repos/${fullName}/contents/${params.path}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: params.message || `Create ${params.path}`, 
                    content: Buffer.from(content).toString('base64') 
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to create file');
            console.log('[GitHub] File created:', data.content?.path);
            return { success: true, path: data.content?.path, sha: data.content?.sha, url: data.content?.html_url };
        },

        async updateFile(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            let sha = params.sha;
            if (!sha) {
                try {
                    const getResponse = await fetch(`https://api.github.com/repos/${fullName}/contents/${params.path}`, {
                        headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
                    });
                    if (getResponse.ok) {
                        const currentFile = await getResponse.json();
                        sha = currentFile.sha;
                    }
                } catch (e) { /* File doesn't exist */ }
            }
            const body = { message: params.message || `Update ${params.path}`, content: Buffer.from(params.content || '').toString('base64') };
            if (sha) body.sha = sha;
            const response = await fetch(`https://api.github.com/repos/${fullName}/contents/${params.path}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to update file');
            return { success: true, path: data.content?.path, url: data.content?.html_url };
        },

        async deleteFile(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            const getResponse = await fetch(`https://api.github.com/repos/${fullName}/contents/${params.path}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!getResponse.ok) throw new Error('File not found');
            const currentFile = await getResponse.json();
            const response = await fetch(`https://api.github.com/repos/${fullName}/contents/${params.path}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: params.message || `Delete ${params.path}`, sha: currentFile.sha })
            });
            if (!response.ok) throw new Error('Failed to delete file');
            return { success: true, deleted: params.path };
        },

        async listIssues(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            const response = await fetch(`https://api.github.com/repos/${fullName}/issues?state=${params.state || 'open'}&per_page=30`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('Failed to fetch issues');
            const issues = await response.json();
            return issues.map(i => ({ number: i.number, title: i.title, state: i.state, author: i.user?.login, url: i.html_url }));
        },

        async createIssue(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            const response = await fetch(`https://api.github.com/repos/${fullName}/issues`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: params.title, body: params.body || '' })
            });
            if (!response.ok) throw new Error('Failed to create issue');
            const data = await response.json();
            return { number: data.number, title: data.title, url: data.html_url };
        },

        async closeIssue(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            const response = await fetch(`https://api.github.com/repos/${fullName}/issues/${params.issueNumber}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ state: 'closed' })
            });
            if (!response.ok) throw new Error('Failed to close issue');
            const data = await response.json();
            return { number: data.number, state: data.state };
        },

        async listBranches(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            const response = await fetch(`https://api.github.com/repos/${fullName}/branches`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('Failed to fetch branches');
            const branches = await response.json();
            return branches.map(b => ({ name: b.name, protected: b.protected }));
        },

        async getRepoStats(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            const response = await fetch(`https://api.github.com/repos/${fullName}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('Failed to fetch repo');
            const repo = await response.json();
            return { name: repo.name, fullName: repo.full_name, description: repo.description, language: repo.language, stars: repo.stargazers_count, forks: repo.forks_count, openIssues: repo.open_issues_count };
        },

        async searchRepos(token, params) {
            const response = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(params.query)}&per_page=10`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            return data.items?.map(r => ({ name: r.name, fullName: r.full_name, description: r.description, url: r.html_url, stars: r.stargazers_count })) || [];
        }
    },

    // ============================================
    // GOOGLE
    // ============================================
    google: {
        async getProfile(token) {
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch profile');
            return await response.json();
        },

        async listCalendarEvents(token, params = {}) {
            const timeMin = params.timeMin || new Date().toISOString();
            const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${params.maxResults || 10}&timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime`,
                { headers: { 'Authorization': `Bearer ${token.accessToken}` } }
            );
            if (!response.ok) throw new Error('Failed to fetch events');
            const data = await response.json();
            return (data.items || []).map(e => ({ id: e.id, title: e.summary, start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date, location: e.location }));
        },

        async createCalendarEvent(token, params) {
            const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    summary: params.summary || params.title,
                    description: params.description || '',
                    start: { dateTime: params.startTime, timeZone: 'UTC' },
                    end: { dateTime: params.endTime, timeZone: 'UTC' }
                })
            });
            if (!response.ok) throw new Error('Failed to create event');
            const data = await response.json();
            return { id: data.id, title: data.summary, url: data.htmlLink };
        },

        async deleteCalendarEvent(token, params) {
            const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${params.eventId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok && response.status !== 204) throw new Error('Failed to delete event');
            return { success: true, deleted: params.eventId };
        },

        async listEmails(token, params = {}) {
            const response = await fetch(
                `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${params.maxResults || 10}`,
                { headers: { 'Authorization': `Bearer ${token.accessToken}` } }
            );
            if (!response.ok) throw new Error('Failed to fetch emails');
            const data = await response.json();
            return data.messages || [];
        },

        async sendEmail(token, params) {
            const email = [`To: ${params.to}`, `Subject: ${params.subject}`, 'Content-Type: text/plain; charset=utf-8', '', params.body].join('\r\n');
            const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw: encodedEmail })
            });
            if (!response.ok) throw new Error('Failed to send email');
            const data = await response.json();
            return { success: true, messageId: data.id };
        },

        async listDriveFiles(token, params = {}) {
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?pageSize=${params.maxResults || 20}&fields=files(id,name,mimeType,size,webViewLink)`,
                { headers: { 'Authorization': `Bearer ${token.accessToken}` } }
            );
            if (!response.ok) throw new Error('Failed to fetch files');
            const data = await response.json();
            return data.files || [];
        },

        async createDriveFolder(token, params) {
            const response = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: params.name, mimeType: 'application/vnd.google-apps.folder' })
            });
            if (!response.ok) throw new Error('Failed to create folder');
            return await response.json();
        }
    },

    // ============================================
    // SHOPIFY
    // ============================================
    shopify: {
        async getShopInfo(token) {
            const response = await fetch(`https://${token.shopDomain}/admin/api/2024-01/shop.json`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch shop');
            const data = await response.json();
            return data.shop;
        },

        async getProducts(token, params = {}) {
            const response = await fetch(`https://${token.shopDomain}/admin/api/2024-01/products.json?limit=${params.limit || 50}`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch products');
            const data = await response.json();
            return (data.products || []).map(p => ({
                id: p.id, title: p.title, vendor: p.vendor, status: p.status,
                price: p.variants?.[0]?.price, inventory: p.variants?.reduce((s, v) => s + (v.inventory_quantity || 0), 0)
            }));
        },

        async createProduct(token, params) {
            const response = await fetch(`https://${token.shopDomain}/admin/api/2024-01/products.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product: {
                        title: params.title, body_html: params.description || '', vendor: params.vendor || '',
                        status: 'draft', variants: [{ price: params.price || '0.00', inventory_quantity: params.inventory || 0 }]
                    }
                })
            });
            if (!response.ok) throw new Error('Failed to create product');
            const data = await response.json();
            return { id: data.product.id, title: data.product.title };
        },

        async updateProduct(token, params) {
            const response = await fetch(`https://${token.shopDomain}/admin/api/2024-01/products/${params.productId}.json`, {
                method: 'PUT',
                headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ product: params.updates })
            });
            if (!response.ok) throw new Error('Failed to update product');
            const data = await response.json();
            return { id: data.product.id, title: data.product.title };
        },

        async deleteProduct(token, params) {
            const response = await fetch(`https://${token.shopDomain}/admin/api/2024-01/products/${params.productId}.json`, {
                method: 'DELETE',
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to delete product');
            return { success: true, deleted: params.productId };
        },

        async getOrders(token, params = {}) {
            const response = await fetch(`https://${token.shopDomain}/admin/api/2024-01/orders.json?limit=${params.limit || 50}&status=any`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch orders');
            const data = await response.json();
            return (data.orders || []).map(o => ({
                id: o.id, orderNumber: o.order_number, totalPrice: o.total_price,
                status: o.financial_status, customer: o.customer?.email
            }));
        },

        async getAnalytics(token) {
            const orders = await this.getOrders(token, { limit: 250 });
            const products = await this.getProducts(token, { limit: 250 });
            const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.totalPrice || 0), 0);
            return {
                totalOrders: orders.length, totalRevenue: totalRevenue.toFixed(2),
                averageOrderValue: orders.length ? (totalRevenue / orders.length).toFixed(2) : '0.00',
                totalProducts: products.length
            };
        },

        async getInventory(token) {
            const products = await this.getProducts(token, { limit: 250 });
            const lowStock = products.filter(p => (p.inventory || 0) > 0 && (p.inventory || 0) < 10);
            const outOfStock = products.filter(p => (p.inventory || 0) === 0);
            return { totalProducts: products.length, lowStockCount: lowStock.length, outOfStockCount: outOfStock.length };
        },

        async createDiscount(token, params) {
            const priceRuleRes = await fetch(`https://${token.shopDomain}/admin/api/2024-01/price_rules.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    price_rule: {
                        title: params.code, target_type: 'line_item', target_selection: 'all',
                        allocation_method: 'across', value_type: params.type || 'percentage',
                        value: `-${params.value}`, customer_selection: 'all', starts_at: new Date().toISOString()
                    }
                })
            });
            if (!priceRuleRes.ok) throw new Error('Failed to create discount');
            const priceRuleData = await priceRuleRes.json();
            await fetch(`https://${token.shopDomain}/admin/api/2024-01/price_rules/${priceRuleData.price_rule.id}/discount_codes.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ discount_code: { code: params.code } })
            });
            return { success: true, code: params.code };
        }
    },

    // ============================================
    // SPOTIFY
    // ============================================
    spotify: {
        async getProfile(token) {
            const response = await fetch('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch profile');
            return await response.json();
        },

        async getCurrentlyPlaying(token) {
            const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (response.status === 204) return { playing: false, message: 'Nothing playing' };
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return { playing: data.is_playing, track: data.item?.name, artist: data.item?.artists?.map(a => a.name).join(', '), album: data.item?.album?.name };
        },

        async getTopTracks(token, params = {}) {
            const response = await fetch(`https://api.spotify.com/v1/me/top/tracks?time_range=${params.timeRange || 'medium_term'}&limit=${params.limit || 20}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return (data.items || []).map((t, i) => ({ rank: i + 1, name: t.name, artist: t.artists?.map(a => a.name).join(', '), uri: t.uri }));
        },

        async getTopArtists(token, params = {}) {
            const response = await fetch(`https://api.spotify.com/v1/me/top/artists?time_range=${params.timeRange || 'medium_term'}&limit=${params.limit || 20}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return (data.items || []).map((a, i) => ({ rank: i + 1, name: a.name, genres: a.genres?.slice(0, 3), followers: a.followers?.total }));
        },

        async getPlaylists(token) {
            const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return (data.items || []).map(p => ({ id: p.id, name: p.name, tracks: p.tracks?.total, public: p.public }));
        },

        async createPlaylist(token, params) {
            const profile = await this.getProfile(token);
            const response = await fetch(`https://api.spotify.com/v1/users/${profile.id}/playlists`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: params.name, description: params.description || '', public: params.isPublic !== false })
            });
            if (!response.ok) throw new Error('Failed to create playlist');
            const data = await response.json();
            return { id: data.id, name: data.name, url: data.external_urls?.spotify };
        },

        async addToPlaylist(token, params) {
            const uris = Array.isArray(params.trackUris) ? params.trackUris : [params.trackUris];
            const response = await fetch(`https://api.spotify.com/v1/playlists/${params.playlistId}/tracks`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ uris })
            });
            if (!response.ok) throw new Error('Failed to add tracks');
            return { success: true, added: uris.length };
        },

        async playTrack(token, params = {}) {
            const body = params.uri ? { uris: [params.uri] } : {};
            await fetch('https://api.spotify.com/v1/me/player/play', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: Object.keys(body).length ? JSON.stringify(body) : undefined
            });
            return { success: true, action: 'play' };
        },

        async pauseTrack(token) {
            await fetch('https://api.spotify.com/v1/me/player/pause', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            return { success: true, action: 'pause' };
        },

        async nextTrack(token) {
            await fetch('https://api.spotify.com/v1/me/player/next', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            return { success: true, action: 'next' };
        },

        async previousTrack(token) {
            await fetch('https://api.spotify.com/v1/me/player/previous', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            return { success: true, action: 'previous' };
        },

        async searchTracks(token, params) {
            const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(params.query)}&type=track&limit=${params.limit || 10}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            return (data.tracks?.items || []).map(t => ({ id: t.id, name: t.name, artist: t.artists?.map(a => a.name).join(', '), uri: t.uri }));
        },

        async getRecentlyPlayed(token) {
            const response = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=20', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return (data.items || []).map(i => ({ track: i.track?.name, artist: i.track?.artists?.map(a => a.name).join(', '), playedAt: i.played_at }));
        }
    },

    // ============================================
    // NOTION
    // ============================================
    notion: {
        async listDatabases(token) {
            const response = await fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
                body: JSON.stringify({ filter: { property: 'object', value: 'database' } })
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return (data.results || []).map(db => ({ id: db.id, title: db.title?.[0]?.plain_text || 'Untitled', url: db.url }));
        },

        async listPages(token) {
            const response = await fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
                body: JSON.stringify({ filter: { property: 'object', value: 'page' } })
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return (data.results || []).map(p => ({ id: p.id, url: p.url }));
        },

        async createPage(token, params) {
            const page = {
                parent: params.databaseId ? { database_id: params.databaseId } : { page_id: params.parentId },
                properties: params.properties || { title: { title: [{ text: { content: params.title || 'New Page' } }] } }
            };
            if (params.content) {
                page.children = [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: params.content } }] } }];
            }
            const response = await fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
                body: JSON.stringify(page)
            });
            if (!response.ok) throw new Error('Failed to create page');
            const data = await response.json();
            return { id: data.id, url: data.url };
        },

        async search(token, params) {
            const response = await fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: params.query })
            });
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            return (data.results || []).map(r => ({ id: r.id, type: r.object, url: r.url }));
        }
    },

    // ============================================
    // DISCORD
    // ============================================
    discord: {
        async getUser(token) {
            const response = await fetch('https://discord.com/api/users/@me', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            return await response.json();
        },

        async getGuilds(token) {
            const response = await fetch('https://discord.com/api/users/@me/guilds', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const guilds = await response.json();
            return guilds.map(g => ({ id: g.id, name: g.name, icon: g.icon, owner: g.owner }));
        }
    },

    // ============================================
    // SLACK
    // ============================================
    slack: {
        async getProfile(token) {
            const response = await fetch('https://slack.com/api/users.profile.get', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            return await response.json();
        },

        async listChannels(token) {
            const response = await fetch('https://slack.com/api/conversations.list', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return (data.channels || []).map(c => ({ id: c.id, name: c.name }));
        },

        async sendMessage(token, params) {
            const response = await fetch('https://slack.com/api/chat.postMessage', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel: params.channel, text: params.text })
            });
            if (!response.ok) throw new Error('Failed to send');
            return await response.json();
        },

        async getMessages(token, params) {
            const response = await fetch(`https://slack.com/api/conversations.history?channel=${params.channel}&limit=${params.limit || 20}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            return await response.json();
        }
    },

    // ============================================
    // TWITTER
    // ============================================
    twitter: {
        async getProfile(token) {
            const response = await fetch('https://api.twitter.com/2/users/me?user.fields=description,public_metrics', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return data.data;
        },

        async getTweets(token, params = {}) {
            const profile = await this.getProfile(token);
            const response = await fetch(`https://api.twitter.com/2/users/${profile.id}/tweets?max_results=${params.limit || 10}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return data.data || [];
        },

        async postTweet(token, params) {
            const response = await fetch('https://api.twitter.com/2/tweets', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: params.text })
            });
            if (!response.ok) throw new Error('Failed to post');
            return await response.json();
        },

        async getFollowers(token) {
            const profile = await this.getProfile(token);
            const response = await fetch(`https://api.twitter.com/2/users/${profile.id}/followers`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            return await response.json();
        }
    },

    // ============================================
    // STRAVA
    // ============================================
    strava: {
        async getAthlete(token) {
            const response = await fetch('https://www.strava.com/api/v3/athlete', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            return await response.json();
        },

        async getActivities(token, params = {}) {
            const response = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=${params.perPage || 30}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const activities = await response.json();
            return activities.map(a => ({
                id: a.id, name: a.name, type: a.type,
                distance: (a.distance / 1000).toFixed(2) + ' km',
                duration: Math.round(a.moving_time / 60) + ' min',
                date: a.start_date_local
            }));
        },

        async getStats(token) {
            const athlete = await this.getAthlete(token);
            const response = await fetch(`https://www.strava.com/api/v3/athletes/${athlete.id}/stats`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            return await response.json();
        }
    },

    // ============================================
    // DROPBOX
    // ============================================
    dropbox: {
        async listFiles(token, params = {}) {
            const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: params.path || '', limit: 100 })
            });
            if (!response.ok) throw new Error('Failed to list files');
            const data = await response.json();
            return (data.entries || []).map(e => ({ name: e.name, path: e.path_display, type: e['.tag'], size: e.size }));
        },

        async createFolder(token, params) {
            const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: params.path })
            });
            if (!response.ok) throw new Error('Failed to create folder');
            return await response.json();
        },

        async getSpaceUsage(token) {
            const response = await fetch('https://api.dropboxapi.com/2/users/get_space_usage', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to get space');
            const data = await response.json();
            return { used: (data.used / 1e9).toFixed(2) + ' GB', allocated: (data.allocation?.allocated / 1e9).toFixed(2) + ' GB' };
        },

        async search(token, params) {
            const response = await fetch('https://api.dropboxapi.com/2/files/search_v2', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: params.query })
            });
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            return (data.matches || []).map(m => ({ name: m.metadata?.metadata?.name, path: m.metadata?.metadata?.path_display }));
        }
    },

    // ============================================
    // FITBIT
    // ============================================
    fitbit: {
        async getProfile(token) {
            const response = await fetch('https://api.fitbit.com/1/user/-/profile.json', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return data.user;
        },

        async getActivitySummary(token, params = {}) {
            const date = params.date || new Date().toISOString().split('T')[0];
            const response = await fetch(`https://api.fitbit.com/1/user/-/activities/date/${date}.json`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return { date, steps: data.summary?.steps, calories: data.summary?.caloriesOut };
        },

        async getSleepLog(token, params = {}) {
            const date = params.date || new Date().toISOString().split('T')[0];
            const response = await fetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${date}.json`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return { date, totalSleep: data.summary?.totalMinutesAsleep };
        },

        async getHeartRate(token, params = {}) {
            const date = params.date || new Date().toISOString().split('T')[0];
            const response = await fetch(`https://api.fitbit.com/1/user/-/activities/heart/date/${date}/1d.json`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return { date, restingHeartRate: data['activities-heart']?.[0]?.value?.restingHeartRate };
        }
    }
};

// ============================================
// AI TOOLS
// ============================================
const aiTools = {
    async generateCode(params) {
        const prompt = `Generate production-ready ${params.language || 'TypeScript'} code for: ${params.description}

Requirements:
- Clean, well-documented code
- Follow best practices
- Include comments
- Be complete and functional

Return ONLY valid JSON:
{
    "filename": "suggested_filename.ext",
    "content": "the complete code here",
    "explanation": "brief explanation"
}`;
        return await think(prompt, { jsonMode: true, temperature: 0.3 });
    },

    async generateProject(params) {
        const prompt = `Generate a complete ${params.type || 'Node.js'} project for: ${params.name}

Description: ${params.description || 'A new project'}

Return ONLY valid JSON:
{
    "files": [
        { "path": "relative/path/file.ext", "content": "file content" }
    ],
    "description": "Project description",
    "setupInstructions": "How to run"
}`;
        return await think(prompt, { jsonMode: true, temperature: 0.4 });
    },

    async analyzeData(params) {
        const prompt = `Analyze this data: ${JSON.stringify(params.data)}\n\nQuestion: ${params.question}\n\nProvide insights and recommendations.`;
        return await think(prompt, { temperature: 0.5 });
    },

    async summarize(params) {
        const prompt = `Summarize in ${params.maxLength || 200} words or less:\n\n${params.text}`;
        return await think(prompt, { temperature: 0.3 });
    },

    async translate(params) {
        const prompt = `Translate to ${params.targetLanguage}:\n\n${params.text}\n\nProvide only the translation.`;
        return await think(prompt, { temperature: 0.2 });
    }
};

// ============================================
// STEP EXECUTOR
// ============================================
async function executeStep(step, email, previousResults, connectedPlatforms) {
    console.log(`[Execute] Step ${step.stepNumber}: ${step.tool}.${step.action}`);
    try {
        // Handle AI tools
        if (step.tool === 'ai') {
            const aiTool = aiTools[step.action];
            if (!aiTool) throw new Error(`Unknown AI action: ${step.action}`);
            const resolvedParams = resolveParams(step.params, previousResults);
            return await aiTool(resolvedParams);
        }

        // Handle platform tools
        const platformTools = tools[step.tool];
        if (!platformTools) throw new Error(`Unknown platform: ${step.tool}`);
        
        const action = platformTools[step.action];
        if (!action) throw new Error(`Unknown action: ${step.action} for ${step.tool}`);

        const token = await getUserToken(email, step.tool);
        const resolvedParams = resolveParams(step.params, previousResults);
        
        return await action(token, resolvedParams);
    } catch (error) {
        console.error(`[Execute] Step ${step.stepNumber} failed:`, error.message);
        return { error: error.message, step: step.stepNumber };
    }
}

function resolveParams(params, previousResults) {
    if (!params) return {};
    const resolved = {};
    
    for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'string' && value.startsWith('$step')) {
            const match = value.match(/\$step(\d+)\.?(.*)/);
            if (match) {
                const stepNum = parseInt(match[1]);
                const path = match[2];
                let result = previousResults[stepNum];
                
                if (path && result) {
                    for (const p of path.split('.')) {
                        result = result?.[p];
                    }
                }
                resolved[key] = result;
            } else {
                resolved[key] = value;
            }
        } else {
            resolved[key] = value;
        }
    }
    return resolved;
}

async function executePlan(plan, email, connectedPlatforms) {
    const results = {};
    const executionLog = [];
    
    for (const step of plan.steps || []) {
        if (step.dependsOn) {
            const deps = Array.isArray(step.dependsOn) ? step.dependsOn : [step.dependsOn];
            const failed = deps.some(dep => results[dep]?.error);
            if (failed) {
                results[step.stepNumber] = { skipped: true, reason: 'Dependency failed' };
                executionLog.push({ step: step.stepNumber, status: 'skipped', reason: 'Dependency failed' });
                continue;
            }
        }
        
        const startTime = Date.now();
        const result = await executeStep(step, email, results, connectedPlatforms);
        const duration = Date.now() - startTime;
        
        results[step.stepNumber] = result;
        executionLog.push({
            step: step.stepNumber,
            description: step.description,
            tool: step.tool,
            action: step.action,
            status: result.error ? 'failed' : 'success',
            duration: `${duration}ms`,
            error: result.error
        });
        
        console.log(`[Execute] Step ${step.stepNumber} ${result.error ? 'FAILED' : 'SUCCESS'} in ${duration}ms`);
    }
    
    return { results, executionLog };
}

// ============================================
// AUTOMATION SCHEDULER
// ============================================
function parseSchedule(scheduleString) {
    const lower = scheduleString.toLowerCase();
    if (lower.includes('every') && lower.includes('minute')) {
        const match = lower.match(/every\s+(\d+)\s+minute/);
        return { type: 'interval', minutes: match ? parseInt(match[1]) : 1 };
    }
    if (lower.includes('every') && lower.includes('hour')) {
        const match = lower.match(/every\s+(\d+)\s+hour/);
        return { type: 'interval', minutes: (match ? parseInt(match[1]) : 1) * 60 };
    }
    if (lower.includes('daily')) {
        const timeMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        let hour = timeMatch ? parseInt(timeMatch[1]) : 9;
        if (timeMatch?.[3]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
        return { type: 'daily', hour, minute: timeMatch?.[2] ? parseInt(timeMatch[2]) : 0 };
    }
    if (lower.includes('weekly')) {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayIndex = days.findIndex(d => lower.includes(d));
        return { type: 'weekly', day: dayIndex >= 0 ? dayIndex : 1, hour: 9, minute: 0 };
    }
    return { type: 'interval', minutes: 60 };
}

function getNextRunTime(parsedSchedule) {
    const now = new Date();
    if (parsedSchedule.type === 'interval') {
        return new Date(now.getTime() + parsedSchedule.minutes * 60 * 1000);
    }
    if (parsedSchedule.type === 'daily') {
        const next = new Date(now);
        next.setHours(parsedSchedule.hour, parsedSchedule.minute, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        return next;
    }
    if (parsedSchedule.type === 'weekly') {
        const next = new Date(now);
        const daysUntil = (parsedSchedule.day - now.getDay() + 7) % 7 || 7;
        next.setDate(now.getDate() + daysUntil);
        next.setHours(parsedSchedule.hour, parsedSchedule.minute, 0, 0);
        return next;
    }
    return new Date(now.getTime() + 60 * 60 * 1000);
}

async function runAutomation(automation, email) {
    console.log(`[Automation] Running: ${automation.name}`);
    try {
        const user = await User.findOne({ email });
        const connectedPlatforms = getConnectedPlatforms(user);
        const plan = await planExecution(automation.task, connectedPlatforms, { automationRun: true });
        if (!plan.canComplete) return { success: false, error: 'Cannot complete', missing: plan.missingPlatforms };
        const { results, executionLog } = await executePlan(plan, email, connectedPlatforms);
        automationResults.set(automation.id, { lastRun: new Date(), success: !executionLog.some(l => l.status === 'failed'), results, executionLog });
        await User.updateOne({ email, 'automations.id': automation.id }, { $set: { 'automations.$.lastRun': new Date(), 'automations.$.lastResult': { success: true, summary: `Completed ${executionLog.length} steps` } } });
        return { success: true, results, executionLog };
    } catch (error) {
        console.error(`[Automation] Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

function scheduleAutomation(automationId, email, schedule, task, name) {
    if (runningAutomations.has(automationId)) clearTimeout(runningAutomations.get(automationId).timeout);
    const parsedSchedule = parseSchedule(schedule);
    const nextRun = getNextRunTime(parsedSchedule);
    const msUntilRun = Math.min(nextRun.getTime() - Date.now(), 2147483647);
    const timeout = setTimeout(async () => {
        await runAutomation({ id: automationId, name, task }, email);
        scheduleAutomation(automationId, email, schedule, task, name);
    }, msUntilRun);
    runningAutomations.set(automationId, { timeout, email, schedule, task, name, nextRun });
    console.log(`[Automation] Scheduled "${name}" for ${nextRun.toISOString()}`);
}

function stopAutomation(automationId) {
    if (runningAutomations.has(automationId)) {
        clearTimeout(runningAutomations.get(automationId).timeout);
        runningAutomations.delete(automationId);
        return true;
    }
    return false;
}

// ============================================
// RESULT FORMATTER
// ============================================
function formatResult(action, data) {
    if (data?.error) return `❌ Error: ${data.error}`;
    if (data?.skipped) return `⏭️ Skipped: ${data.reason}`;
    
    const formatters = {
        'github.listRepos': () => data?.length ? `📁 Found ${data.length} repos:\n${data.slice(0, 5).map(r => `• ${r.name} (${r.language || '?'}) ⭐${r.stars}`).join('\n')}` : 'No repos found',
        'github.createRepo': () => `✅ Created repo: **${data.name}**\n🔗 ${data.url}${data.private ? ' (Private)' : ''}`,
        'github.createFile': () => `✅ Created file: ${data.path}\n🔗 ${data.url}`,
        'github.updateFile': () => `✅ Updated file: ${data.path}`,
        'github.deleteFile': () => `✅ Deleted: ${data.deleted}`,
        'github.listFiles': () => data?.length ? `📂 ${data.length} files:\n${data.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}`).join('\n')}` : 'No files',
        'shopify.getProducts': () => data?.length ? `🛍️ ${data.length} products` : 'No products',
        'shopify.createProduct': () => `✅ Created: ${data.title}`,
        'shopify.getAnalytics': () => `📊 Revenue: $${data.totalRevenue}, Orders: ${data.totalOrders}`,
        'spotify.getCurrentlyPlaying': () => data.playing ? `🎵 Playing: **${data.track}** by ${data.artist}` : '⏸️ Nothing playing',
        'spotify.getTopTracks': () => data?.length ? `🎵 Top tracks:\n${data.slice(0, 5).map(t => `${t.rank}. ${t.name} - ${t.artist}`).join('\n')}` : 'No tracks',
        'spotify.createPlaylist': () => `✅ Created playlist: **${data.name}**`,
        'google.listCalendarEvents': () => data?.length ? `📅 ${data.length} events` : 'No events',
        'google.createCalendarEvent': () => `✅ Created event: ${data.title}`,
        'google.sendEmail': () => `✅ Email sent!`,
        'notion.listDatabases': () => data?.length ? `📚 ${data.length} databases` : 'No databases',
        'ai.generateCode': () => `✅ Generated: ${data.filename}`,
        'ai.generateProject': () => `✅ Generated project with ${data.files?.length || 0} files`
    };
    
    const formatter = formatters[action];
    if (formatter) return formatter();
    if (Array.isArray(data)) return `✅ Retrieved ${data.length} items`;
    if (data?.success) return `✅ ${data.message || 'Done'}`;
    if (typeof data === 'string') return data;
    return `✅ Completed`;
}

// ============================================
// API ROUTES
// ============================================

// Main chat endpoint
router.post('/chat', async (req, res) => {
    try {
        const { email, message, connectedPlatforms = [], userName = 'User', goal } = req.body;
        
        if (!email || !message) {
            return res.status(400).json({ error: 'Email and message required' });
        }
        
        const user = await User.findOne({ email });
        const actualPlatforms = getConnectedPlatforms(user);
        
        console.log(`\n${'='.repeat(50)}\n[MasterAgent] "${message}"\n[Email] ${email}\n[Platforms] ${actualPlatforms.join(', ') || 'None'}\n${'='.repeat(50)}`);
        
        // Plan execution
        const plan = await planExecution(message, actualPlatforms, { userName, goal });
        console.log('[Plan]', JSON.stringify(plan, null, 2));
        
        // Check if we can complete
        if (!plan.canComplete && plan.missingPlatforms?.length) {
            return res.json({
                response: `I'd love to help with that! However, I need access to: **${plan.missingPlatforms.join(', ')}**.\n\nPlease connect these platforms in the Settings tab, then try again.`,
                plan, toolsUsed: [], needsConnection: plan.missingPlatforms
            });
        }
        
        // Execute the plan
        let executionResult = null;
        let toolsUsed = [];
        
        if (plan.steps?.length) {
            console.log(`[Execute] Running ${plan.steps.length} steps...`);
            executionResult = await executePlan(plan, email, actualPlatforms);
            toolsUsed = plan.steps.map(s => `${s.tool}.${s.action}`);
        }
        
        // Format results
        const resultSummary = executionResult ? 
            Object.entries(executionResult.results)
                .map(([stepNum, result]) => {
                    const step = plan.steps?.find(s => s.stepNumber === parseInt(stepNum));
                    return formatResult(`${step?.tool}.${step?.action}`, result);
                })
                .filter(r => r)
                .join('\n\n') : '';
        
        // Generate response
        const hasErrors = executionResult?.executionLog?.some(l => l.status === 'failed');
        const responsePrompt = `You are a helpful AI assistant. The user asked: "${message}"

${executionResult ? `I executed these actions:\n\n${resultSummary}\n\n${hasErrors ? 'Some steps had errors.' : 'All steps completed!'}` : 'No actions needed.'}

Provide a natural, friendly response. Be concise. Confirm what was done.`;

        const aiResponse = await think(responsePrompt, { temperature: 0.7 });
        
        res.json({
            response: aiResponse,
            plan,
            executionLog: executionResult?.executionLog || [],
            toolsUsed,
            results: executionResult?.results || {}
        });
        
    } catch (error) {
        console.error('[Chat Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// Execute pending plan
router.post('/execute-plan', async (req, res) => {
    try {
        const { email, plan } = req.body;
        const user = await User.findOne({ email });
        const connectedPlatforms = getConnectedPlatforms(user);
        const { results, executionLog } = await executePlan(plan, email, connectedPlatforms);
        res.json({ success: true, results, executionLog });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Direct tool execution
router.post('/execute', async (req, res) => {
    try {
        const { email, tool, action, params = {} } = req.body;
        
        if (!email || !tool || !action) {
            return res.status(400).json({ error: 'Email, tool, and action required' });
        }
        
        if (tool === 'ai') {
            const aiTool = aiTools[action];
            if (!aiTool) return res.status(400).json({ error: `Unknown AI action: ${action}` });
            const result = await aiTool(params);
            return res.json({ success: true, result, formatted: formatResult(`ai.${action}`, result) });
        }
        
        const platformTools = tools[tool];
        if (!platformTools) return res.status(400).json({ error: `Unknown platform: ${tool}` });
        
        const toolAction = platformTools[action];
        if (!toolAction) return res.status(400).json({ error: `Unknown action: ${action}` });
        
        const token = await getUserToken(email, tool);
        const result = await toolAction(token, params);
        
        res.json({ success: true, result, formatted: formatResult(`${tool}.${action}`, result) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get available actions (FIXED - checks both arrays)
router.get('/actions/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const user = await User.findOne({ email });
        
        const connectedPlatforms = getConnectedPlatforms(user);
        
        console.log(`[Actions] ${email} has platforms: ${connectedPlatforms.join(', ') || 'None'}`);
        
        const availableActions = [
            { tool: 'ai', action: 'generateCode', description: 'Generate code' },
            { tool: 'ai', action: 'generateProject', description: 'Generate project' },
            { tool: 'ai', action: 'analyzeData', description: 'Analyze data' },
            { tool: 'ai', action: 'summarize', description: 'Summarize text' },
            { tool: 'ai', action: 'translate', description: 'Translate text' }
        ];
        
        const platformActions = {
            github: [
                { action: 'listRepos', description: 'List repositories' },
                { action: 'createRepo', description: 'Create repository' },
                { action: 'listFiles', description: 'List files' },
                { action: 'createFile', description: 'Create file' },
                { action: 'updateFile', description: 'Update file' },
                { action: 'deleteFile', description: 'Delete file' },
                { action: 'listIssues', description: 'List issues' },
                { action: 'createIssue', description: 'Create issue' }
            ],
            google: [
                { action: 'listCalendarEvents', description: 'List events' },
                { action: 'createCalendarEvent', description: 'Create event' },
                { action: 'sendEmail', description: 'Send email' },
                { action: 'listDriveFiles', description: 'List Drive files' }
            ],
            shopify: [
                { action: 'getProducts', description: 'List products' },
                { action: 'createProduct', description: 'Create product' },
                { action: 'getOrders', description: 'List orders' },
                { action: 'getAnalytics', description: 'Get analytics' },
                { action: 'getInventory', description: 'Check inventory' }
            ],
            spotify: [
                { action: 'getCurrentlyPlaying', description: 'Now playing' },
                { action: 'getTopTracks', description: 'Top tracks' },
                { action: 'getPlaylists', description: 'List playlists' },
                { action: 'createPlaylist', description: 'Create playlist' },
                { action: 'playTrack', description: 'Play' },
                { action: 'pauseTrack', description: 'Pause' },
                { action: 'nextTrack', description: 'Next' },
                { action: 'searchTracks', description: 'Search' }
            ],
            notion: [
                { action: 'listDatabases', description: 'List databases' },
                { action: 'listPages', description: 'List pages' },
                { action: 'createPage', description: 'Create page' },
                { action: 'search', description: 'Search' }
            ],
            discord: [
                { action: 'getUser', description: 'Get profile' },
                { action: 'getGuilds', description: 'List servers' }
            ],
            slack: [
                { action: 'listChannels', description: 'List channels' },
                { action: 'sendMessage', description: 'Send message' }
            ],
            twitter: [
                { action: 'getProfile', description: 'Get profile' },
                { action: 'postTweet', description: 'Post tweet' }
            ],
            strava: [
                { action: 'getActivities', description: 'List activities' },
                { action: 'getStats', description: 'Get stats' }
            ],
            dropbox: [
                { action: 'listFiles', description: 'List files' },
                { action: 'createFolder', description: 'Create folder' }
            ],
            fitbit: [
                { action: 'getActivitySummary', description: 'Activity summary' },
                { action: 'getSleepLog', description: 'Sleep data' }
            ]
        };
        
        for (const platform of connectedPlatforms) {
            const actions = platformActions[platform] || [];
            for (const a of actions) {
                availableActions.push({ tool: platform, ...a });
            }
        }
        
        res.json({ success: true, connectedPlatforms, availableActions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// AUTOMATION ROUTES
// ============================================

router.post('/automations', async (req, res) => {
    try {
        const { email, name, description, task, schedule } = req.body;
        if (!email || !name || !task || !schedule) {
            return res.status(400).json({ error: 'Email, name, task, and schedule required' });
        }
        const automationId = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const automation = {
            id: automationId, name, description: description || '', task, schedule,
            enabled: true, createdAt: new Date(), nextRun: getNextRunTime(parseSchedule(schedule)), lastRun: null, lastResult: null
        };
        await User.updateOne({ email }, { $push: { automations: automation } });
        scheduleAutomation(automationId, email, schedule, task, name);
        res.json({ success: true, automation });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/automations/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email });
        const automations = (user?.automations || []).map(a => ({
            ...a.toObject ? a.toObject() : a,
            isRunning: runningAutomations.has(a.id),
            lastResult: automationResults.get(a.id) || a.lastResult
        }));
        res.json({ success: true, automations });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/automations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { email, enabled, name, task, schedule } = req.body;
        const updateFields = {};
        if (name !== undefined) updateFields['automations.$.name'] = name;
        if (task !== undefined) updateFields['automations.$.task'] = task;
        if (schedule !== undefined) {
            updateFields['automations.$.schedule'] = schedule;
            updateFields['automations.$.nextRun'] = getNextRunTime(parseSchedule(schedule));
        }
        if (enabled !== undefined) updateFields['automations.$.enabled'] = enabled;
        await User.updateOne({ email, 'automations.id': id }, { $set: updateFields });
        if (enabled === false) stopAutomation(id);
        else if (enabled === true || schedule) {
            const user = await User.findOne({ email, 'automations.id': id });
            const auto = user?.automations?.find(a => a.id === id);
            if (auto?.enabled) scheduleAutomation(id, email, auto.schedule, auto.task, auto.name);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/automations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { email } = req.body;
        stopAutomation(id);
        await User.updateOne({ email }, { $pull: { automations: { id } } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/automations/:id/run', async (req, res) => {
    try {
        const { id } = req.params;
        const { email } = req.body;
        const user = await User.findOne({ email, 'automations.id': id });
        const automation = user?.automations?.find(a => a.id === id);
        if (!automation) return res.status(404).json({ error: 'Automation not found' });
        const result = await runAutomation(automation, email);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Initialize automations on startup
setTimeout(async () => {
    try {
        const users = await User.find({ 'automations.0': { $exists: true } });
        let count = 0;
        for (const user of users) {
            for (const auto of user.automations || []) {
                if (auto.enabled) {
                    scheduleAutomation(auto.id, user.email, auto.schedule, auto.task, auto.name);
                    count++;
                }
            }
        }
        console.log(`✅ Initialized ${count} automations for ${users.length} users`);
    } catch (error) {
        console.error('Failed to initialize automations:', error);
    }
}, 5000);

export default router;
