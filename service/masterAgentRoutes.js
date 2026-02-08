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
// HELPER FUNCTIONS
// ============================================
async function getUserToken(email, platform) {
    const user = await User.findOne({ email });
    if (!user) throw new Error('User not found');
    
    const account = user.connectedAccounts?.find(a => 
        a.platform?.toLowerCase() === platform.toLowerCase()
    );
    
    if (!account) throw new Error(`${platform} not connected`);
    
    if (account.tokenExpiry && new Date(account.tokenExpiry) < new Date()) {
        throw new Error(`${platform} token expired - please reconnect`);
    }
    
    return {
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        shopDomain: account.shopDomain || account.metadata?.shopDomain,
        metadata: account.metadata || {}
    };
}

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
    const systemPrompt = `You are an autonomous AI agent planner. Your job is to break down user requests into executable steps.

CONNECTED PLATFORMS: ${connectedPlatforms.join(', ') || 'None'}

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
- github.listPullRequests - List PRs (params: repo, state)
- github.listBranches - List branches (params: repo)
- github.getRepoStats - Get repo statistics (params: repo)
- github.searchRepos - Search repositories (params: query)
- github.searchCode - Search code (params: query)
- github.forkRepo - Fork repository (params: repo)
- github.starRepo - Star repository (params: repo)
` : ''}

${connectedPlatforms.includes('google') ? `
GOOGLE:
- google.getProfile - Get user profile
- google.listCalendarEvents - List calendar events (params: maxResults, timeMin)
- google.createCalendarEvent - Create event (params: summary, description, startTime, endTime, location)
- google.deleteCalendarEvent - Delete event (params: eventId)
- google.listEmails - List emails (params: maxResults, query)
- google.sendEmail - Send email (params: to, subject, body)
- google.listDriveFiles - List Drive files (params: query, maxResults)
- google.createDriveFolder - Create folder (params: name, parentId)
- google.listContacts - List contacts
` : ''}

${connectedPlatforms.includes('shopify') ? `
SHOPIFY:
- shopify.getShopInfo - Get shop details
- shopify.getProducts - List products (params: limit)
- shopify.createProduct - Create product (params: title, description, price, vendor, type, inventory)
- shopify.updateProduct - Update product (params: productId, updates)
- shopify.deleteProduct - Delete product (params: productId)
- shopify.getOrders - List orders (params: status, limit)
- shopify.getOrderDetails - Get order details (params: orderId)
- shopify.fulfillOrder - Fulfill order (params: orderId)
- shopify.getCustomers - List customers (params: limit)
- shopify.getAnalytics - Get shop analytics
- shopify.getInventory - Get inventory levels
- shopify.createDiscount - Create discount (params: code, value, type)
- shopify.getCollections - List collections
- shopify.createCollection - Create collection (params: title, description)
- shopify.getThemes - List themes
` : ''}

${connectedPlatforms.includes('spotify') ? `
SPOTIFY:
- spotify.getProfile - Get user profile
- spotify.getCurrentlyPlaying - Get current track
- spotify.getTopTracks - Get top tracks (params: timeRange, limit)
- spotify.getTopArtists - Get top artists (params: timeRange, limit)
- spotify.getPlaylists - List playlists
- spotify.createPlaylist - Create playlist (params: name, description, isPublic)
- spotify.addToPlaylist - Add tracks to playlist (params: playlistId, trackUris)
- spotify.removeFromPlaylist - Remove tracks (params: playlistId, trackUris)
- spotify.playTrack - Play/resume (params: uri)
- spotify.pauseTrack - Pause playback
- spotify.nextTrack - Skip to next
- spotify.previousTrack - Go to previous
- spotify.setVolume - Set volume (params: volumePercent)
- spotify.searchTracks - Search tracks (params: query, limit)
- spotify.searchArtists - Search artists (params: query, limit)
- spotify.searchAlbums - Search albums (params: query, limit)
- spotify.getRecentlyPlayed - Get recently played
- spotify.getSavedTracks - Get liked songs
- spotify.saveTracks - Like tracks (params: trackIds)
- spotify.getArtist - Get artist details (params: artistId)
- spotify.getAlbum - Get album details (params: albumId)
- spotify.getPlaylistTracks - Get playlist tracks (params: playlistId)
` : ''}

${connectedPlatforms.includes('notion') ? `
NOTION:
- notion.listDatabases - List all databases
- notion.listPages - List pages
- notion.getPage - Get page details (params: pageId)
- notion.createPage - Create page (params: parentId, title, content, properties)
- notion.updatePage - Update page (params: pageId, properties)
- notion.deletePage - Archive page (params: pageId)
- notion.queryDatabase - Query database (params: databaseId, filter, sorts)
- notion.createDatabase - Create database (params: parentId, title, properties)
- notion.search - Search Notion (params: query)
- notion.getBlock - Get block (params: blockId)
- notion.appendBlocks - Append blocks to page (params: pageId, blocks)
` : ''}

${connectedPlatforms.includes('discord') ? `
DISCORD:
- discord.getUser - Get user profile
- discord.getGuilds - List servers
- discord.getGuildChannels - List channels (params: guildId)
- discord.getChannel - Get channel details (params: channelId)
- discord.sendMessage - Send message (params: channelId, content)
- discord.getMessages - Get messages (params: channelId, limit)
- discord.createReaction - Add reaction (params: channelId, messageId, emoji)
- discord.deleteMessage - Delete message (params: channelId, messageId)
` : ''}

${connectedPlatforms.includes('slack') ? `
SLACK:
- slack.getProfile - Get user profile
- slack.listChannels - List channels
- slack.getChannel - Get channel info (params: channelId)
- slack.sendMessage - Send message (params: channel, text, blocks)
- slack.updateMessage - Update message (params: channel, ts, text)
- slack.deleteMessage - Delete message (params: channel, ts)
- slack.getMessages - Get messages (params: channel, limit)
- slack.addReaction - Add reaction (params: channel, timestamp, name)
- slack.listUsers - List workspace users
- slack.uploadFile - Upload file (params: channels, content, filename)
` : ''}

${connectedPlatforms.includes('twitter') ? `
TWITTER:
- twitter.getProfile - Get user profile
- twitter.getTweets - Get user tweets (params: limit)
- twitter.postTweet - Post tweet (params: text)
- twitter.deleteTweet - Delete tweet (params: tweetId)
- twitter.likeTweet - Like tweet (params: tweetId)
- twitter.retweet - Retweet (params: tweetId)
- twitter.getFollowers - Get followers (params: limit)
- twitter.getFollowing - Get following (params: limit)
- twitter.searchTweets - Search tweets (params: query, limit)
` : ''}

${connectedPlatforms.includes('linkedin') ? `
LINKEDIN:
- linkedin.getProfile - Get user profile
- linkedin.getConnections - Get connections
- linkedin.sharePost - Share post (params: text, visibility)
` : ''}

${connectedPlatforms.includes('strava') ? `
STRAVA:
- strava.getAthlete - Get athlete profile
- strava.getActivities - List activities (params: perPage)
- strava.getActivity - Get activity details (params: activityId)
- strava.getStats - Get athlete stats
- strava.getSegmentEfforts - Get segment efforts (params: segmentId)
- strava.getRoutes - Get routes
` : ''}

${connectedPlatforms.includes('dropbox') ? `
DROPBOX:
- dropbox.listFiles - List files (params: path)
- dropbox.getFile - Download file (params: path)
- dropbox.uploadFile - Upload file (params: path, content)
- dropbox.createFolder - Create folder (params: path)
- dropbox.deleteFile - Delete file (params: path)
- dropbox.moveFile - Move file (params: fromPath, toPath)
- dropbox.copyFile - Copy file (params: fromPath, toPath)
- dropbox.getSpaceUsage - Get space usage
- dropbox.search - Search files (params: query)
- dropbox.getSharedLinks - Get shared links (params: path)
- dropbox.createSharedLink - Create shared link (params: path)
` : ''}

${connectedPlatforms.includes('fitbit') ? `
FITBIT:
- fitbit.getProfile - Get user profile
- fitbit.getActivitySummary - Get activity summary (params: date)
- fitbit.getSleepLog - Get sleep log (params: date)
- fitbit.getHeartRate - Get heart rate (params: date, period)
- fitbit.getWeightLog - Get weight log (params: date)
- fitbit.getWaterLog - Get water log (params: date)
- fitbit.logWater - Log water (params: amount, date)
- fitbit.getDevices - Get devices
- fitbit.getBadges - Get badges
` : ''}

${connectedPlatforms.includes('asana') ? `
ASANA:
- asana.getWorkspaces - Get workspaces
- asana.getProjects - Get projects (params: workspaceId)
- asana.getTasks - Get tasks (params: projectId)
- asana.createTask - Create task (params: projectId, name, notes, dueDate)
- asana.updateTask - Update task (params: taskId, updates)
- asana.completeTask - Complete task (params: taskId)
- asana.deleteTask - Delete task (params: taskId)
` : ''}

${connectedPlatforms.includes('todoist') ? `
TODOIST:
- todoist.getProjects - Get projects
- todoist.getTasks - Get tasks (params: projectId)
- todoist.createTask - Create task (params: content, projectId, dueDate, priority)
- todoist.updateTask - Update task (params: taskId, updates)
- todoist.completeTask - Complete task (params: taskId)
- todoist.deleteTask - Delete task (params: taskId)
- todoist.createProject - Create project (params: name)
` : ''}

AI TOOLS (always available):
- ai.generateCode - Generate code (params: description, language, context)
- ai.generateProject - Generate full project structure (params: name, type, description)
- ai.analyzeData - Analyze data (params: data, question)
- ai.summarize - Summarize text (params: text, maxLength)
- ai.translate - Translate text (params: text, targetLanguage)
- ai.explain - Explain concept (params: topic, level)
- ai.writeContent - Write content (params: type, topic, tone, length)
- ai.refactorCode - Refactor code (params: code, language, improvements)
- ai.reviewCode - Review code (params: code, language)
- ai.generateTests - Generate tests (params: code, language, framework)

USER CONTEXT:
- Name: ${userContext.userName || 'User'}
- Goal: ${userContext.goal || 'Not specified'}

RULES FOR PLANNING:
1. Break complex requests into simple, sequential steps
2. Each step should use ONE tool/action
3. Reference previous step results with $step1, $step2, etc. (e.g., $step1.name, $step1.id)
4. If a required platform is not connected, mark canComplete as false
5. Extract specific values from the request (names, descriptions, settings)
6. For code/project generation: first use ai.generateCode, then github.createFile
7. Be proactive - if user wants a repo with files, plan both repo creation AND file creation
8. Estimate realistic times for each step

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
            "dependsOn": null,
            "estimatedSeconds": 2
        }
    ],
    "summary": "What will be accomplished",
    "totalEstimatedSeconds": 10,
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
            return { login: user.login, name: user.name, email: user.email, bio: user.bio, followers: user.followers, following: user.following, publicRepos: user.public_repos, avatarUrl: user.avatar_url };
        },

        async createRepo(token, params) {
            const response = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: params.name, description: params.description || '', private: params.isPrivate === true || params.isPrivate === 'true', auto_init: true })
            });
            const data = await response.json();
            if (data.errors || data.message) throw new Error(data.errors?.[0]?.message || data.message || 'Failed to create repo');
            return { name: data.name, fullName: data.full_name, url: data.html_url, private: data.private, description: data.description };
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
            return items.map(item => ({ name: item.name, path: item.path, type: item.type, size: item.size, sha: item.sha, url: item.html_url, downloadUrl: item.download_url }));
        },

        async getFileContent(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            const response = await fetch(`https://api.github.com/repos/${fullName}/contents/${params.path}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('File not found');
            const data = await response.json();
            return { name: data.name, path: data.path, sha: data.sha, size: data.size, content: Buffer.from(data.content, 'base64').toString('utf-8'), url: data.html_url };
        },

        async createFile(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            const response = await fetch(`https://api.github.com/repos/${fullName}/contents/${params.path}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: params.message || `Create ${params.path}`, content: Buffer.from(params.content || '').toString('base64') })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to create file');
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
                } catch (e) { /* File doesn't exist, will create */ }
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
            return { success: true, path: data.content?.path, sha: data.content?.sha, url: data.content?.html_url };
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
            const state = params.state || 'open';
            const response = await fetch(`https://api.github.com/repos/${fullName}/issues?state=${state}&per_page=30`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('Failed to fetch issues');
            const issues = await response.json();
            return issues.map(i => ({ number: i.number, title: i.title, state: i.state, body: i.body?.slice(0, 200), author: i.user?.login, labels: i.labels?.map(l => l.name), url: i.html_url, createdAt: i.created_at }));
        },

        async createIssue(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            const response = await fetch(`https://api.github.com/repos/${fullName}/issues`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: params.title, body: params.body || '', labels: params.labels || [] })
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

        async listPullRequests(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            const state = params.state || 'open';
            const response = await fetch(`https://api.github.com/repos/${fullName}/pulls?state=${state}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('Failed to fetch PRs');
            const prs = await response.json();
            return prs.map(pr => ({ number: pr.number, title: pr.title, state: pr.state, author: pr.user?.login, head: pr.head?.ref, base: pr.base?.ref, url: pr.html_url }));
        },

        async listBranches(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            const response = await fetch(`https://api.github.com/repos/${fullName}/branches`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('Failed to fetch branches');
            const branches = await response.json();
            return branches.map(b => ({ name: b.name, protected: b.protected, sha: b.commit?.sha }));
        },

        async getRepoStats(token, params) {
            const fullName = await getFullRepoName(token.accessToken, params.repo);
            const [repoRes, commitsRes, contribRes] = await Promise.all([
                fetch(`https://api.github.com/repos/${fullName}`, { headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' } }),
                fetch(`https://api.github.com/repos/${fullName}/commits?per_page=10`, { headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' } }),
                fetch(`https://api.github.com/repos/${fullName}/contributors?per_page=5`, { headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' } })
            ]);
            const repo = await repoRes.json();
            const commits = await commitsRes.json();
            const contributors = await contribRes.json();
            return {
                name: repo.name, fullName: repo.full_name, description: repo.description, language: repo.language,
                stars: repo.stargazers_count, forks: repo.forks_count, watchers: repo.watchers_count, openIssues: repo.open_issues_count,
                size: repo.size, defaultBranch: repo.default_branch, createdAt: repo.created_at, updatedAt: repo.updated_at,
                recentCommits: (Array.isArray(commits) ? commits : []).slice(0, 5).map(c => ({ message: c.commit?.message?.split('\n')[0], author: c.commit?.author?.name, date: c.commit?.author?.date })),
                topContributors: (Array.isArray(contributors) ? contributors : []).slice(0, 5).map(c => ({ login: c.login, contributions: c.contributions }))
            };
        },

        async searchRepos(token, params) {
            const response = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(params.query)}&per_page=10`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            return data.items?.map(r => ({ name: r.name, fullName: r.full_name, description: r.description, url: r.html_url, stars: r.stargazers_count, language: r.language })) || [];
        },

        async searchCode(token, params) {
            const response = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(params.query)}&per_page=10`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            return data.items?.map(i => ({ name: i.name, path: i.path, repo: i.repository?.full_name, url: i.html_url })) || [];
        },

        async forkRepo(token, params) {
            const response = await fetch(`https://api.github.com/repos/${params.repo}/forks`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (!response.ok) throw new Error('Failed to fork');
            const data = await response.json();
            return { name: data.name, fullName: data.full_name, url: data.html_url };
        },

        async starRepo(token, params) {
            const response = await fetch(`https://api.github.com/user/starred/${params.repo}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Length': '0' }
            });
            if (!response.ok && response.status !== 204) throw new Error('Failed to star');
            return { success: true, starred: params.repo };
        }
    },

    // ============================================
    // TOOL IMPLEMENTATIONS - GOOGLE
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
            const maxResults = params.maxResults || 10;
            const timeMin = params.timeMin || new Date().toISOString();
            const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${maxResults}&timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime`,
                { headers: { 'Authorization': `Bearer ${token.accessToken}` } }
            );
            if (!response.ok) throw new Error('Failed to fetch events');
            const data = await response.json();
            return (data.items || []).map(e => ({
                id: e.id, title: e.summary, description: e.description,
                start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date,
                location: e.location, url: e.htmlLink
            }));
        },

        async createCalendarEvent(token, params) {
            const event = {
                summary: params.summary || params.title,
                description: params.description || '',
                location: params.location || '',
                start: { dateTime: params.startTime, timeZone: params.timeZone || 'UTC' },
                end: { dateTime: params.endTime, timeZone: params.timeZone || 'UTC' }
            };
            const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(event)
            });
            if (!response.ok) throw new Error('Failed to create event');
            const data = await response.json();
            return { id: data.id, title: data.summary, url: data.htmlLink, start: data.start?.dateTime };
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
            const maxResults = params.maxResults || 10;
            const query = params.query ? `&q=${encodeURIComponent(params.query)}` : '';
            const response = await fetch(
                `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}${query}`,
                { headers: { 'Authorization': `Bearer ${token.accessToken}` } }
            );
            if (!response.ok) throw new Error('Failed to fetch emails');
            const data = await response.json();
            
            const emails = await Promise.all((data.messages || []).slice(0, 5).map(async (msg) => {
                const detail = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
                    headers: { 'Authorization': `Bearer ${token.accessToken}` }
                });
                const emailData = await detail.json();
                const headers = emailData.payload?.headers || [];
                return {
                    id: msg.id,
                    from: headers.find(h => h.name === 'From')?.value,
                    subject: headers.find(h => h.name === 'Subject')?.value,
                    date: headers.find(h => h.name === 'Date')?.value,
                    snippet: emailData.snippet
                };
            }));
            return emails;
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
            return { success: true, messageId: data.id, threadId: data.threadId };
        },

        async listDriveFiles(token, params = {}) {
            const maxResults = params.maxResults || 20;
            const query = params.query ? `&q=${encodeURIComponent(params.query)}` : '';
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?pageSize=${maxResults}${query}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink)`,
                { headers: { 'Authorization': `Bearer ${token.accessToken}` } }
            );
            if (!response.ok) throw new Error('Failed to fetch files');
            const data = await response.json();
            return data.files || [];
        },

        async createDriveFolder(token, params) {
            const metadata = {
                name: params.name,
                mimeType: 'application/vnd.google-apps.folder',
                ...(params.parentId && { parents: [params.parentId] })
            };
            const response = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(metadata)
            });
            if (!response.ok) throw new Error('Failed to create folder');
            return await response.json();
        },

        async listContacts(token) {
            const response = await fetch(
                'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=50',
                { headers: { 'Authorization': `Bearer ${token.accessToken}` } }
            );
            if (!response.ok) throw new Error('Failed to fetch contacts');
            const data = await response.json();
            return (data.connections || []).map(c => ({
                name: c.names?.[0]?.displayName,
                email: c.emailAddresses?.[0]?.value,
                phone: c.phoneNumbers?.[0]?.value
            }));
        }
    },

    // ============================================
    // TOOL IMPLEMENTATIONS - SHOPIFY
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
            const limit = params.limit || 50;
            const response = await fetch(`https://${token.shopDomain}/admin/api/2024-01/products.json?limit=${limit}`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch products');
            const data = await response.json();
            return (data.products || []).map(p => ({
                id: p.id, title: p.title, description: p.body_html, vendor: p.vendor, type: p.product_type,
                status: p.status, price: p.variants?.[0]?.price,
                inventory: p.variants?.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
                images: p.images?.length || 0, createdAt: p.created_at
            }));
        },

        async createProduct(token, params) {
            const product = {
                title: params.title,
                body_html: params.description || '',
                vendor: params.vendor || '',
                product_type: params.type || '',
                status: params.status || 'draft',
                variants: [{ price: params.price || '0.00', inventory_quantity: params.inventory || 0, inventory_management: 'shopify' }]
            };
            const response = await fetch(`https://${token.shopDomain}/admin/api/2024-01/products.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ product })
            });
            if (!response.ok) throw new Error('Failed to create product');
            const data = await response.json();
            return { id: data.product.id, title: data.product.title, status: data.product.status };
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
            const limit = params.limit || 50;
            const status = params.status || 'any';
            const response = await fetch(`https://${token.shopDomain}/admin/api/2024-01/orders.json?limit=${limit}&status=${status}`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch orders');
            const data = await response.json();
            return (data.orders || []).map(o => ({
                id: o.id, orderNumber: o.order_number, totalPrice: o.total_price, subtotal: o.subtotal_price,
                currency: o.currency, status: o.financial_status, fulfillment: o.fulfillment_status || 'unfulfilled',
                customer: o.customer?.email || 'Guest', itemCount: o.line_items?.length || 0, createdAt: o.created_at
            }));
        },

        async getOrderDetails(token, params) {
            const response = await fetch(`https://${token.shopDomain}/admin/api/2024-01/orders/${params.orderId}.json`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch order');
            const data = await response.json();
            return data.order;
        },

        async fulfillOrder(token, params) {
            const response = await fetch(`https://${token.shopDomain}/admin/api/2024-01/orders/${params.orderId}/fulfillments.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ fulfillment: { notify_customer: true } })
            });
            if (!response.ok) throw new Error('Failed to fulfill order');
            return await response.json();
        },

        async getCustomers(token, params = {}) {
            const limit = params.limit || 50;
            const response = await fetch(`https://${token.shopDomain}/admin/api/2024-01/customers.json?limit=${limit}`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch customers');
            const data = await response.json();
            return (data.customers || []).map(c => ({
                id: c.id, email: c.email, name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
                ordersCount: c.orders_count, totalSpent: c.total_spent, createdAt: c.created_at
            }));
        },

        async getAnalytics(token) {
            const [ordersRes, productsRes, customersRes] = await Promise.all([
                this.getOrders(token, { limit: 250 }),
                this.getProducts(token, { limit: 250 }),
                this.getCustomers(token, { limit: 250 })
            ]);
            const totalRevenue = ordersRes.reduce((sum, o) => sum + parseFloat(o.totalPrice || 0), 0);
            const paidOrders = ordersRes.filter(o => o.status === 'paid');
            const today = new Date().toISOString().split('T')[0];
            const todayOrders = ordersRes.filter(o => o.createdAt?.startsWith(today));
            return {
                totalOrders: ordersRes.length, totalRevenue: totalRevenue.toFixed(2),
                averageOrderValue: ordersRes.length ? (totalRevenue / ordersRes.length).toFixed(2) : '0.00',
                paidOrders: paidOrders.length, pendingOrders: ordersRes.filter(o => o.status === 'pending').length,
                totalProducts: productsRes.length, totalCustomers: customersRes.length,
                todayOrders: todayOrders.length, todayRevenue: todayOrders.reduce((sum, o) => sum + parseFloat(o.totalPrice || 0), 0).toFixed(2)
            };
        },

        async getInventory(token) {
            const products = await this.getProducts(token, { limit: 250 });
            const lowStock = products.filter(p => (p.inventory || 0) > 0 && (p.inventory || 0) < 10);
            const outOfStock = products.filter(p => (p.inventory || 0) === 0);
            return {
                totalProducts: products.length,
                lowStockCount: lowStock.length, outOfStockCount: outOfStock.length,
                lowStockItems: lowStock.slice(0, 10).map(p => ({ title: p.title, inventory: p.inventory })),
                outOfStockItems: outOfStock.slice(0, 10).map(p => p.title)
            };
        },

        async createDiscount(token, params) {
            const priceRule = {
                title: params.code, target_type: 'line_item', target_selection: 'all',
                allocation_method: 'across', value_type: params.type || 'percentage',
                value: `-${params.value}`, customer_selection: 'all', starts_at: new Date().toISOString()
            };
            const priceRuleRes = await fetch(`https://${token.shopDomain}/admin/api/2024-01/price_rules.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ price_rule: priceRule })
            });
            if (!priceRuleRes.ok) throw new Error('Failed to create price rule');
            const priceRuleData = await priceRuleRes.json();
            
            await fetch(`https://${token.shopDomain}/admin/api/2024-01/price_rules/${priceRuleData.price_rule.id}/discount_codes.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ discount_code: { code: params.code } })
            });
            return { success: true, code: params.code, type: params.type || 'percentage', value: params.value };
        },

        async getCollections(token) {
            const response = await fetch(`https://${token.shopDomain}/admin/api/2024-01/custom_collections.json`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch collections');
            const data = await response.json();
            return data.custom_collections || [];
        },

        async createCollection(token, params) {
            const response = await fetch(`https://${token.shopDomain}/admin/api/2024-01/custom_collections.json`, {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ custom_collection: { title: params.title, body_html: params.description || '' } })
            });
            if (!response.ok) throw new Error('Failed to create collection');
            return await response.json();
        },

        async getThemes(token) {
            const response = await fetch(`https://${token.shopDomain}/admin/api/2024-01/themes.json`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch themes');
            const data = await response.json();
            return (data.themes || []).map(t => ({ id: t.id, name: t.name, role: t.role }));
        }
    },

    // ============================================
    // TOOL IMPLEMENTATIONS - SPOTIFY
    // ============================================
    spotify: {
        async getProfile(token) {
            const response = await fetch('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch profile');
            const data = await response.json();
            return { id: data.id, name: data.display_name, email: data.email, followers: data.followers?.total, country: data.country, product: data.product };
        },

        async getCurrentlyPlaying(token) {
            const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (response.status === 204) return { playing: false, message: 'Nothing currently playing' };
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return {
                playing: data.is_playing, track: data.item?.name,
                artist: data.item?.artists?.map(a => a.name).join(', '),
                album: data.item?.album?.name, progress: data.progress_ms, duration: data.item?.duration_ms,
                uri: data.item?.uri, url: data.item?.external_urls?.spotify
            };
        },

        async getTopTracks(token, params = {}) {
            const timeRange = params.timeRange || 'medium_term';
            const limit = params.limit || 20;
            const response = await fetch(`https://api.spotify.com/v1/me/top/tracks?time_range=${timeRange}&limit=${limit}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch top tracks');
            const data = await response.json();
            return (data.items || []).map((t, i) => ({
                rank: i + 1, name: t.name, artist: t.artists?.map(a => a.name).join(', '),
                album: t.album?.name, uri: t.uri, url: t.external_urls?.spotify
            }));
        },

        async getTopArtists(token, params = {}) {
            const timeRange = params.timeRange || 'medium_term';
            const limit = params.limit || 20;
            const response = await fetch(`https://api.spotify.com/v1/me/top/artists?time_range=${timeRange}&limit=${limit}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch top artists');
            const data = await response.json();
            return (data.items || []).map((a, i) => ({
                rank: i + 1, name: a.name, genres: a.genres?.slice(0, 3),
                followers: a.followers?.total, uri: a.uri, url: a.external_urls?.spotify
            }));
        },

        async getPlaylists(token, params = {}) {
            const limit = params.limit || 50;
            const response = await fetch(`https://api.spotify.com/v1/me/playlists?limit=${limit}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch playlists');
            const data = await response.json();
            return (data.items || []).map(p => ({
                id: p.id, name: p.name, description: p.description, tracks: p.tracks?.total,
                public: p.public, collaborative: p.collaborative, uri: p.uri, url: p.external_urls?.spotify
            }));
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
            return { id: data.id, name: data.name, url: data.external_urls?.spotify, uri: data.uri };
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
            const response = await fetch('https://api.spotify.com/v1/me/player/play', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: Object.keys(body).length ? JSON.stringify(body) : undefined
            });
            if (!response.ok && response.status !== 204) throw new Error('Failed to play');
            return { success: true, action: 'play' };
        },

        async pauseTrack(token) {
            const response = await fetch('https://api.spotify.com/v1/me/player/pause', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok && response.status !== 204) throw new Error('Failed to pause');
            return { success: true, action: 'pause' };
        },

        async nextTrack(token) {
            const response = await fetch('https://api.spotify.com/v1/me/player/next', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok && response.status !== 204) throw new Error('Failed to skip');
            return { success: true, action: 'next' };
        },

        async previousTrack(token) {
            const response = await fetch('https://api.spotify.com/v1/me/player/previous', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok && response.status !== 204) throw new Error('Failed');
            return { success: true, action: 'previous' };
        },

        async setVolume(token, params) {
            const volume = Math.min(100, Math.max(0, params.volumePercent || 50));
            const response = await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${volume}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok && response.status !== 204) throw new Error('Failed to set volume');
            return { success: true, volume };
        },

        async searchTracks(token, params) {
            const limit = params.limit || 10;
            const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(params.query)}&type=track&limit=${limit}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            return (data.tracks?.items || []).map(t => ({
                id: t.id, name: t.name, artist: t.artists?.map(a => a.name).join(', '),
                album: t.album?.name, uri: t.uri, url: t.external_urls?.spotify, duration: t.duration_ms
            }));
        },

        async searchArtists(token, params) {
            const limit = params.limit || 10;
            const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(params.query)}&type=artist&limit=${limit}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            return (data.artists?.items || []).map(a => ({
                id: a.id, name: a.name, genres: a.genres?.slice(0, 3),
                followers: a.followers?.total, uri: a.uri, url: a.external_urls?.spotify
            }));
        },

        async getRecentlyPlayed(token, params = {}) {
            const limit = params.limit || 20;
            const response = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return (data.items || []).map(i => ({
                track: i.track?.name, artist: i.track?.artists?.map(a => a.name).join(', '),
                playedAt: i.played_at, uri: i.track?.uri
            }));
        },

        async getSavedTracks(token, params = {}) {
            const limit = params.limit || 20;
            const response = await fetch(`https://api.spotify.com/v1/me/tracks?limit=${limit}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            return (data.items || []).map(i => ({
                name: i.track?.name, artist: i.track?.artists?.map(a => a.name).join(', '),
                album: i.track?.album?.name, addedAt: i.added_at, uri: i.track?.uri
            }));
        }
    },

    // ============================================
    // TOOL IMPLEMENTATIONS - NOTION
    // ============================================
    notion: {
        async listDatabases(token) {
            const response = await fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
                body: JSON.stringify({ filter: { property: 'object', value: 'database' } })
            });
            if (!response.ok) throw new Error('Failed to fetch databases');
            const data = await response.json();
            return (data.results || []).map(db => ({
                id: db.id, title: db.title?.[0]?.plain_text || 'Untitled', url: db.url
            }));
        },

        async listPages(token, params = {}) {
            const response = await fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
                body: JSON.stringify({ filter: { property: 'object', value: 'page' }, page_size: params.limit || 20 })
            });
            if (!response.ok) throw new Error('Failed to fetch pages');
            const data = await response.json();
            return (data.results || []).map(p => ({
                id: p.id,
                title: p.properties?.title?.title?.[0]?.plain_text || p.properties?.Name?.title?.[0]?.plain_text || 'Untitled',
                url: p.url, createdAt: p.created_time
            }));
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

        async queryDatabase(token, params) {
            const body = {};
            if (params.filter) body.filter = params.filter;
            if (params.sorts) body.sorts = params.sorts;
            const response = await fetch(`https://api.notion.com/v1/databases/${params.databaseId}/query`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!response.ok) throw new Error('Failed to query database');
            return await response.json();
        },

        async search(token, params) {
            const response = await fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: params.query, page_size: params.limit || 10 })
            });
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            return (data.results || []).map(r => ({
                id: r.id, type: r.object,
                title: r.properties?.title?.title?.[0]?.plain_text || r.title?.[0]?.plain_text || 'Untitled',
                url: r.url
            }));
        }
    },

    // ============================================
    // TOOL IMPLEMENTATIONS - DISCORD
    // ============================================
    discord: {
        async getUser(token) {
            const response = await fetch('https://discord.com/api/users/@me', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch user');
            const data = await response.json();
            return { id: data.id, username: data.username, discriminator: data.discriminator, email: data.email, avatar: data.avatar };
        },

        async getGuilds(token) {
            const response = await fetch('https://discord.com/api/users/@me/guilds', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch guilds');
            const guilds = await response.json();
            return guilds.map(g => ({ id: g.id, name: g.name, icon: g.icon, owner: g.owner, permissions: g.permissions }));
        }
    },

    // ============================================
    // TOOL IMPLEMENTATIONS - SLACK
    // ============================================
    slack: {
        async getProfile(token) {
            const response = await fetch('https://slack.com/api/users.profile.get', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch profile');
            return await response.json();
        },

        async listChannels(token) {
            const response = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch channels');
            const data = await response.json();
            return (data.channels || []).map(c => ({ id: c.id, name: c.name, isPrivate: c.is_private, memberCount: c.num_members }));
        },

        async sendMessage(token, params) {
            const response = await fetch('https://slack.com/api/chat.postMessage', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel: params.channel, text: params.text, blocks: params.blocks })
            });
            if (!response.ok) throw new Error('Failed to send message');
            return await response.json();
        },

        async getMessages(token, params) {
            const response = await fetch(`https://slack.com/api/conversations.history?channel=${params.channel}&limit=${params.limit || 20}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch messages');
            return await response.json();
        }
    },

    // ============================================
    // TOOL IMPLEMENTATIONS - TWITTER
    // ============================================
    twitter: {
        async getProfile(token) {
            const response = await fetch('https://api.twitter.com/2/users/me?user.fields=description,public_metrics,profile_image_url', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch profile');
            const data = await response.json();
            return data.data;
        },

        async getTweets(token, params = {}) {
            const profile = await this.getProfile(token);
            const limit = params.limit || 10;
            const response = await fetch(`https://api.twitter.com/2/users/${profile.id}/tweets?max_results=${limit}&tweet.fields=created_at,public_metrics`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch tweets');
            const data = await response.json();
            return data.data || [];
        },

        async postTweet(token, params) {
            const response = await fetch('https://api.twitter.com/2/tweets', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: params.text })
            });
            if (!response.ok) throw new Error('Failed to post tweet');
            return await response.json();
        },

        async getFollowers(token, params = {}) {
            const profile = await this.getProfile(token);
            const response = await fetch(`https://api.twitter.com/2/users/${profile.id}/followers?max_results=${params.limit || 100}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch followers');
            return await response.json();
        }
    },

    // ============================================
    // TOOL IMPLEMENTATIONS - STRAVA
    // ============================================
    strava: {
        async getAthlete(token) {
            const response = await fetch('https://www.strava.com/api/v3/athlete', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch athlete');
            const data = await response.json();
            return { id: data.id, firstname: data.firstname, lastname: data.lastname, city: data.city, country: data.country, followerCount: data.follower_count };
        },

        async getActivities(token, params = {}) {
            const perPage = params.perPage || 30;
            const response = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch activities');
            const activities = await response.json();
            return activities.map(a => ({
                id: a.id, name: a.name, type: a.type,
                distance: (a.distance / 1000).toFixed(2) + ' km',
                duration: Math.round(a.moving_time / 60) + ' min',
                elevation: a.total_elevation_gain + ' m',
                date: a.start_date_local
            }));
        },

        async getStats(token) {
            const athlete = await this.getAthlete(token);
            const response = await fetch(`https://www.strava.com/api/v3/athletes/${athlete.id}/stats`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch stats');
            return await response.json();
        }
    },

    // ============================================
    // TOOL IMPLEMENTATIONS - DROPBOX
    // ============================================
    dropbox: {
        async listFiles(token, params = {}) {
            const path = params.path || '';
            const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, recursive: false, limit: 100 })
            });
            if (!response.ok) throw new Error('Failed to list files');
            const data = await response.json();
            return (data.entries || []).map(e => ({
                name: e.name, path: e.path_display, type: e['.tag'], size: e.size, modified: e.server_modified
            }));
        },

        async createFolder(token, params) {
            const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: params.path, autorename: false })
            });
            if (!response.ok) throw new Error('Failed to create folder');
            return await response.json();
        },

        async getSpaceUsage(token) {
            const response = await fetch('https://api.dropboxapi.com/2/users/get_space_usage', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to get space usage');
            const data = await response.json();
            return {
                used: (data.used / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
                allocated: (data.allocation?.allocated / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
            };
        },

        async search(token, params) {
            const response = await fetch('https://api.dropboxapi.com/2/files/search_v2', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: params.query, options: { max_results: 20 } })
            });
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            return (data.matches || []).map(m => ({
                name: m.metadata?.metadata?.name, path: m.metadata?.metadata?.path_display
            }));
        }
    },

    // ============================================
    // TOOL IMPLEMENTATIONS - FITBIT
    // ============================================
    fitbit: {
        async getProfile(token) {
            const response = await fetch('https://api.fitbit.com/1/user/-/profile.json', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch profile');
            const data = await response.json();
            return data.user;
        },

        async getActivitySummary(token, params = {}) {
            const date = params.date || new Date().toISOString().split('T')[0];
            const response = await fetch(`https://api.fitbit.com/1/user/-/activities/date/${date}.json`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch activity');
            const data = await response.json();
            return { date, steps: data.summary?.steps, calories: data.summary?.caloriesOut, distance: data.summary?.distances?.[0]?.distance, activeMinutes: data.summary?.veryActiveMinutes + data.summary?.fairlyActiveMinutes };
        },

        async getSleepLog(token, params = {}) {
            const date = params.date || new Date().toISOString().split('T')[0];
            const response = await fetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${date}.json`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch sleep');
            const data = await response.json();
            const summary = data.summary;
            return { date, totalSleep: summary?.totalMinutesAsleep, deepSleep: summary?.stages?.deep, remSleep: summary?.stages?.rem, lightSleep: summary?.stages?.light };
        },

        async getHeartRate(token, params = {}) {
            const date = params.date || new Date().toISOString().split('T')[0];
            const response = await fetch(`https://api.fitbit.com/1/user/-/activities/heart/date/${date}/1d.json`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch heart rate');
            const data = await response.json();
            return { date, restingHeartRate: data['activities-heart']?.[0]?.value?.restingHeartRate };
        }
    },

    // ============================================
    // TOOL IMPLEMENTATIONS - LINKEDIN
    // ============================================
    linkedin: {
        async getProfile(token) {
            const response = await fetch('https://api.linkedin.com/v2/me', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch profile');
            return await response.json();
        }
    }
};

// ============================================
// AI TOOLS
// ============================================
const aiTools = {
    async generateCode(params) {
        const prompt = `Generate production-ready ${params.language || 'TypeScript'} code for: ${params.description}

${params.context ? `Context: ${params.context}` : ''}

Requirements:
- Clean, well-documented code with comments
- Follow best practices for the language
- Include proper error handling
- Be complete and immediately usable

Return ONLY valid JSON:
{
    "filename": "suggested_filename.ext",
    "content": "the complete code here",
    "explanation": "brief explanation of what the code does"
}`;
        return await think(prompt, { jsonMode: true, temperature: 0.3 });
    },

    async generateProject(params) {
        const prompt = `Generate a complete ${params.type || 'Node.js'} project structure for: ${params.name}

Description: ${params.description || 'A new project'}

Create a full project with all necessary files. Return ONLY valid JSON:
{
    "files": [
        { "path": "relative/path/to/file.ext", "content": "complete file content" }
    ],
    "description": "Project description",
    "setupInstructions": "How to set up and run"
}

Include at minimum:
- README.md with documentation
- Package configuration (package.json, etc.)
- Main entry point file
- Basic project structure`;
        return await think(prompt, { jsonMode: true, temperature: 0.4 });
    },

    async analyzeData(params) {
        const prompt = `Analyze this data and answer the question:

Data: ${JSON.stringify(params.data)}

Question: ${params.question}

Provide clear insights, patterns, and actionable recommendations.`;
        return await think(prompt, { temperature: 0.5 });
    },

    async summarize(params) {
        const maxLength = params.maxLength || 200;
        const prompt = `Summarize the following in ${maxLength} words or less:\n\n${params.text}`;
        return await think(prompt, { temperature: 0.3 });
    },

    async translate(params) {
        const prompt = `Translate to ${params.targetLanguage}:\n\n${params.text}\n\nProvide only the translation.`;
        return await think(prompt, { temperature: 0.2 });
    },

    async explain(params) {
        const level = params.level || 'intermediate';
        const prompt = `Explain ${params.topic} at a ${level} level. Be clear and use examples.`;
        return await think(prompt, { temperature: 0.5 });
    },

    async writeContent(params) {
        const prompt = `Write ${params.type || 'content'} about: ${params.topic}

Tone: ${params.tone || 'professional'}
Length: ${params.length || 'medium'}

Create engaging, well-structured content.`;
        return await think(prompt, { temperature: 0.7 });
    },

    async refactorCode(params) {
        const prompt = `Refactor this ${params.language || ''} code with these improvements: ${params.improvements || 'general cleanup'}

Code:
${params.code}

Return the improved code with explanations of changes.`;
        return await think(prompt, { temperature: 0.3 });
    },

    async reviewCode(params) {
        const prompt = `Review this ${params.language || ''} code:

${params.code}

Provide:
1. Issues found (bugs, security, performance)
2. Suggestions for improvement
3. Overall quality assessment`;
        return await think(prompt, { temperature: 0.4 });
    },

    async generateTests(params) {
        const prompt = `Generate ${params.framework || 'Jest'} tests for this ${params.language || 'JavaScript'} code:

${params.code}

Include unit tests covering main functionality, edge cases, and error handling.`;
        return await think(prompt, { jsonMode: false, temperature: 0.3 });
    }
};

// ============================================
// STEP EXECUTOR
// ============================================
async function executeStep(step, email, previousResults, connectedPlatforms) {
    console.log(`Executing step ${step.stepNumber}: ${step.tool}.${step.action}`);
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
        console.error(`Step ${step.stepNumber} failed:`, error.message);
        return { error: error.message, step: step.stepNumber };
    }
}

function resolveParams(params, previousResults) {
    if (!params) return {};
    const resolved = {};
    
    for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'string' && value.startsWith('$step')) {
            // Handle $step1.fieldName references
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
        // Check dependencies
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
        
        console.log(`Step ${step.stepNumber} ${result.error ? 'failed' : 'completed'} in ${duration}ms`);
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
    if (lower.includes('daily') || lower.includes('every day')) {
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
    console.log(`Running automation: ${automation.name}`);
    
    try {
        const user = await User.findOne({ email });
        const connectedPlatforms = user?.connectedAccounts?.map(a => a.platform.toLowerCase()) || [];
        
        const plan = await planExecution(automation.task, connectedPlatforms, { automationRun: true });
        
        if (!plan.canComplete) {
            return { success: false, error: 'Cannot complete automation', missing: plan.missingPlatforms };
        }
        
        const { results, executionLog } = await executePlan(plan, email, connectedPlatforms);
        
        automationResults.set(automation.id, {
            lastRun: new Date(),
            success: !executionLog.some(l => l.status === 'failed'),
            results,
            executionLog
        });
        
        await User.updateOne(
            { email, 'automations.id': automation.id },
            { $set: { 'automations.$.lastRun': new Date(), 'automations.$.lastResult': { success: true, summary: `Completed ${executionLog.length} steps` } } }
        );
        
        return { success: true, results, executionLog };
    } catch (error) {
        console.error(`Automation error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

function scheduleAutomation(automationId, email, schedule, task, name) {
    if (runningAutomations.has(automationId)) {
        clearTimeout(runningAutomations.get(automationId).timeout);
    }
    
    const parsedSchedule = parseSchedule(schedule);
    const nextRun = getNextRunTime(parsedSchedule);
    const msUntilRun = Math.min(nextRun.getTime() - Date.now(), 2147483647);
    
    const timeout = setTimeout(async () => {
        await runAutomation({ id: automationId, name, task }, email);
        scheduleAutomation(automationId, email, schedule, task, name);
    }, msUntilRun);
    
    runningAutomations.set(automationId, { timeout, email, schedule, task, name, nextRun });
    console.log(`Scheduled automation "${name}" for ${nextRun.toISOString()}`);
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
        'github.listRepos': () => data?.length ? `📁 Found ${data.length} repositories:\n${data.slice(0, 5).map(r => `• ${r.name} (${r.language || 'Unknown'}) ⭐${r.stars}`).join('\n')}` : 'No repositories found',
        'github.createRepo': () => `✅ Created repository: **${data.name}**\n🔗 ${data.url}${data.private ? ' (Private)' : ''}`,
        'github.createFile': () => `✅ Created file: ${data.path}\n🔗 ${data.url}`,
        'github.updateFile': () => `✅ Updated file: ${data.path}\n🔗 ${data.url}`,
        'github.deleteFile': () => `✅ Deleted: ${data.deleted}`,
        'github.listFiles': () => data?.length ? `📂 Files:\n${data.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}`).join('\n')}` : 'No files found',
        'github.getFileContent': () => `📄 ${data.name} (${data.size} bytes):\n\`\`\`\n${data.content?.slice(0, 500)}${data.content?.length > 500 ? '...' : ''}\n\`\`\``,
        'shopify.getProducts': () => data?.length ? `🛍️ ${data.length} products:\n${data.slice(0, 5).map(p => `• ${p.title} - $${p.price}`).join('\n')}` : 'No products',
        'shopify.createProduct': () => `✅ Created product: ${data.title} (ID: ${data.id})`,
        'shopify.getAnalytics': () => `📊 Analytics:\n• Revenue: $${data.totalRevenue}\n• Orders: ${data.totalOrders}\n• Avg Order: $${data.averageOrderValue}\n• Products: ${data.totalProducts}`,
        'shopify.getInventory': () => `📦 Inventory:\n• Total Products: ${data.totalProducts}\n• Low Stock: ${data.lowStockCount}\n• Out of Stock: ${data.outOfStockCount}`,
        'spotify.getCurrentlyPlaying': () => data.playing ? `🎵 Now playing: **${data.track}** by ${data.artist}` : '⏸️ Nothing currently playing',
        'spotify.getTopTracks': () => data?.length ? `🎵 Top tracks:\n${data.slice(0, 5).map((t, i) => `${i + 1}. ${t.name} - ${t.artist}`).join('\n')}` : 'No top tracks',
        'spotify.createPlaylist': () => `✅ Created playlist: **${data.name}**\n🔗 ${data.url}`,
        'google.listCalendarEvents': () => data?.length ? `📅 Upcoming events:\n${data.slice(0, 5).map(e => `• ${e.title} - ${new Date(e.start).toLocaleDateString()}`).join('\n')}` : 'No upcoming events',
        'google.createCalendarEvent': () => `✅ Created event: ${data.title}`,
        'google.sendEmail': () => `✅ Email sent! (ID: ${data.messageId})`,
        'notion.listDatabases': () => data?.length ? `📚 Databases:\n${data.map(d => `• ${d.title}`).join('\n')}` : 'No databases',
        'strava.getActivities': () => data?.length ? `🏃 Activities:\n${data.slice(0, 5).map(a => `• ${a.name} - ${a.type}, ${a.distance}`).join('\n')}` : 'No activities',
        'ai.generateCode': () => `✅ Generated ${data.filename}:\n\`\`\`\n${data.content?.slice(0, 300)}...\n\`\`\``,
        'ai.generateProject': () => `✅ Generated project with ${data.files?.length || 0} files`
    };
    
    const formatter = formatters[action];
    if (formatter) return formatter();
    
    if (Array.isArray(data)) return `✅ Retrieved ${data.length} items`;
    if (data?.success) return `✅ ${data.message || 'Action completed'}`;
    if (typeof data === 'string') return data;
    return `✅ Completed`;
}

// ============================================
// API ROUTES
// ============================================

// Main chat endpoint - autonomous execution
router.post('/chat', async (req, res) => {
    try {
        const { email, message, connectedPlatforms = [], userName = 'User', history = [], goal } = req.body;
        
        if (!email || !message) {
            return res.status(400).json({ error: 'Email and message required' });
        }
        
        const user = await User.findOne({ email });
        const actualPlatforms = user?.connectedAccounts?.filter(a => a.accessToken)?.map(a => a.platform.toLowerCase()) || connectedPlatforms;
        
        const userContext = { userName, goal, connectedPlatforms: actualPlatforms };
        
        console.log(`\n${'='.repeat(50)}\nMaster Agent: "${message}" for ${email}\nPlatforms: ${actualPlatforms.join(', ') || 'None'}\n${'='.repeat(50)}`);
        
        // Plan execution
        const plan = await planExecution(message, actualPlatforms, userContext);
        console.log('Plan:', JSON.stringify(plan, null, 2));
        
        // Check if we can complete
        if (!plan.canComplete && plan.missingPlatforms?.length) {
            return res.json({
                response: `I'd love to help with that! However, I need access to: **${plan.missingPlatforms.join(', ')}**.\n\nPlease connect these platforms in the Settings tab, then try again.`,
                plan,
                toolsUsed: [],
                needsConnection: plan.missingPlatforms
            });
        }
        
        // Execute the plan
        let executionResult = null;
        let toolsUsed = [];
        
        if (plan.steps?.length) {
            console.log(`Executing ${plan.steps.length} steps...`);
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

${executionResult ? `I executed the following actions:

${resultSummary}

${hasErrors ? 'Some steps encountered errors.' : 'All steps completed successfully.'}` : 'I analyzed your request but no actions were needed.'}

Provide a natural, friendly response. Be concise but informative. If actions were taken, confirm what was done. If there were errors, explain them helpfully and suggest solutions.`;

        const aiResponse = await think(responsePrompt, { temperature: 0.7 });
        
        res.json({
            response: aiResponse,
            plan,
            executionLog: executionResult?.executionLog || [],
            toolsUsed,
            results: executionResult?.results || {}
        });
        
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Execute a pending plan
router.post('/execute-plan', async (req, res) => {
    try {
        const { email, plan } = req.body;
        const user = await User.findOne({ email });
        const connectedPlatforms = user?.connectedAccounts?.map(a => a.platform.toLowerCase()) || [];
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

// Get available actions for user
router.get('/actions/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const user = await User.findOne({ email });
        
        const connectedPlatforms = user?.connectedAccounts?.filter(a => a.accessToken)?.map(a => a.platform.toLowerCase()) || [];
        
        const availableActions = [
            { tool: 'ai', action: 'generateCode', description: 'Generate code in any language' },
            { tool: 'ai', action: 'generateProject', description: 'Generate complete project structure' },
            { tool: 'ai', action: 'analyzeData', description: 'Analyze data and provide insights' },
            { tool: 'ai', action: 'summarize', description: 'Summarize text' },
            { tool: 'ai', action: 'translate', description: 'Translate text' },
            { tool: 'ai', action: 'explain', description: 'Explain a concept' },
            { tool: 'ai', action: 'writeContent', description: 'Write content' },
            { tool: 'ai', action: 'reviewCode', description: 'Review code quality' }
        ];
        
        const platformActions = {
            github: [
                { action: 'listRepos', description: 'List repositories' },
                { action: 'createRepo', description: 'Create repository' },
                { action: 'listFiles', description: 'List files in repo' },
                { action: 'createFile', description: 'Create file' },
                { action: 'updateFile', description: 'Update file' },
                { action: 'deleteFile', description: 'Delete file' },
                { action: 'listIssues', description: 'List issues' },
                { action: 'createIssue', description: 'Create issue' },
                { action: 'getRepoStats', description: 'Get repo statistics' }
            ],
            google: [
                { action: 'listCalendarEvents', description: 'List calendar events' },
                { action: 'createCalendarEvent', description: 'Create calendar event' },
                { action: 'listEmails', description: 'List emails' },
                { action: 'sendEmail', description: 'Send email' },
                { action: 'listDriveFiles', description: 'List Drive files' }
            ],
            shopify: [
                { action: 'getProducts', description: 'List products' },
                { action: 'createProduct', description: 'Create product' },
                { action: 'getOrders', description: 'List orders' },
                { action: 'getAnalytics', description: 'Get analytics' },
                { action: 'getInventory', description: 'Check inventory' },
                { action: 'createDiscount', description: 'Create discount' }
            ],
            spotify: [
                { action: 'getCurrentlyPlaying', description: 'Now playing' },
                { action: 'getTopTracks', description: 'Top tracks' },
                { action: 'getPlaylists', description: 'List playlists' },
                { action: 'createPlaylist', description: 'Create playlist' },
                { action: 'playTrack', description: 'Play' },
                { action: 'pauseTrack', description: 'Pause' },
                { action: 'nextTrack', description: 'Next track' },
                { action: 'searchTracks', description: 'Search tracks' }
            ],
            notion: [
                { action: 'listDatabases', description: 'List databases' },
                { action: 'listPages', description: 'List pages' },
                { action: 'createPage', description: 'Create page' },
                { action: 'search', description: 'Search Notion' }
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
                { action: 'getTweets', description: 'Get tweets' },
                { action: 'postTweet', description: 'Post tweet' }
            ],
            strava: [
                { action: 'getAthlete', description: 'Get profile' },
                { action: 'getActivities', description: 'List activities' },
                { action: 'getStats', description: 'Get stats' }
            ],
            dropbox: [
                { action: 'listFiles', description: 'List files' },
                { action: 'createFolder', description: 'Create folder' },
                { action: 'getSpaceUsage', description: 'Check storage' }
            ],
            fitbit: [
                { action: 'getProfile', description: 'Get profile' },
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
        
        if (enabled === false) {
            stopAutomation(id);
        } else if (enabled === true || schedule) {
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
