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
    
    if (account.expiresAt && Date.now() > account.expiresAt) {
        console.log(`Token expired for ${platform}, needs refresh`);
        return null;
    }
    
    return {
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        platformUserId: account.platformUserId,
        platformUsername: account.platformUsername,
        shopDomain: account.shopDomain || account.metadata?.shopDomain
    };
}

// ============================================
// TOOL IMPLEMENTATIONS
// ============================================

const tools = {
    // ==========================================
    // GITHUB TOOLS
    // ==========================================
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
        },

        createRepo: async (token, name, description = '', isPrivate = false) => {
            const response = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    name, 
                    description, 
                    private: isPrivate,
                    auto_init: true 
                })
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to create repository');
            }
            return response.json();
        },

        deleteRepo: async (token, repo) => {
            const response = await fetch(`https://api.github.com/repos/${repo}`, {
                method: 'DELETE',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (!response.ok) throw new Error('Failed to delete repository');
            return { success: true, deleted: repo };
        },

        listBranches: async (token, repo) => {
            const response = await fetch(`https://api.github.com/repos/${repo}/branches`, {
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (!response.ok) throw new Error('Failed to fetch branches');
            return response.json();
        },

        listPullRequests: async (token, repo) => {
            const response = await fetch(`https://api.github.com/repos/${repo}/pulls?state=open`, {
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (!response.ok) throw new Error('Failed to fetch pull requests');
            const prs = await response.json();
            return prs.map(pr => ({
                number: pr.number,
                title: pr.title,
                state: pr.state,
                url: pr.html_url,
                author: pr.user.login,
                createdAt: pr.created_at
            }));
        },

        getRepoStats: async (token, repo) => {
            const [repoRes, commitsRes, contributorsRes] = await Promise.all([
                fetch(`https://api.github.com/repos/${repo}`, {
                    headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
                }),
                fetch(`https://api.github.com/repos/${repo}/commits?per_page=5`, {
                    headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
                }),
                fetch(`https://api.github.com/repos/${repo}/contributors?per_page=5`, {
                    headers: { 'Authorization': `Bearer ${token.accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
                })
            ]);
            
            const repoData = await repoRes.json();
            const commits = await commitsRes.json();
            const contributors = await contributorsRes.json();
            
            return {
                name: repoData.name,
                stars: repoData.stargazers_count,
                forks: repoData.forks_count,
                openIssues: repoData.open_issues_count,
                language: repoData.language,
                size: repoData.size,
                recentCommits: commits.slice(0, 5).map(c => ({
                    message: c.commit.message.split('\n')[0],
                    author: c.commit.author.name,
                    date: c.commit.author.date
                })),
                topContributors: contributors.slice(0, 5).map(c => ({
                    name: c.login,
                    contributions: c.contributions
                }))
            };
        },

        createFile: async (token, repo, path, content, message) => {
            const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message || `Create ${path}`,
                    content: Buffer.from(content).toString('base64')
                })
            });
            if (!response.ok) throw new Error('Failed to create file');
            return response.json();
        },

        starRepo: async (token, repo) => {
            const response = await fetch(`https://api.github.com/user/starred/${repo}`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (!response.ok) throw new Error('Failed to star repository');
            return { success: true, starred: repo };
        },

        forkRepo: async (token, repo) => {
            const response = await fetch(`https://api.github.com/repos/${repo}/forks`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (!response.ok) throw new Error('Failed to fork repository');
            return response.json();
        }
    },

    // ==========================================
    // GOOGLE TOOLS
    // ==========================================
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
                location: e.location,
                description: e.description
            })) || [];
        },

        createCalendarEvent: async (token, title, startTime, endTime, description = '', location = '') => {
            const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    summary: title,
                    description,
                    location,
                    start: { dateTime: startTime, timeZone: 'UTC' },
                    end: { dateTime: endTime, timeZone: 'UTC' }
                })
            });
            if (!response.ok) throw new Error('Failed to create event');
            return response.json();
        },

        deleteCalendarEvent: async (token, eventId) => {
            const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to delete event');
            return { success: true, deleted: eventId };
        },

        listEmails: async (token, maxResults = 10) => {
            const response = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`,
                { headers: { 'Authorization': `Bearer ${token.accessToken}` } }
            );
            if (!response.ok) throw new Error('Failed to fetch emails');
            const data = await response.json();
            
            const emails = await Promise.all(
                (data.messages || []).slice(0, 5).map(async (msg) => {
                    const detail = await fetch(
                        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
                        { headers: { 'Authorization': `Bearer ${token.accessToken}` } }
                    );
                    const emailData = await detail.json();
                    const headers = emailData.payload?.headers || [];
                    return {
                        id: msg.id,
                        from: headers.find(h => h.name === 'From')?.value || 'Unknown',
                        subject: headers.find(h => h.name === 'Subject')?.value || 'No Subject',
                        date: headers.find(h => h.name === 'Date')?.value || ''
                    };
                })
            );
            return emails;
        },

        sendEmail: async (token, to, subject, body) => {
            const message = [
                `To: ${to}`,
                `Subject: ${subject}`,
                'Content-Type: text/plain; charset=utf-8',
                '',
                body
            ].join('\n');
            
            const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
            
            const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ raw: encodedMessage })
            });
            if (!response.ok) throw new Error('Failed to send email');
            return response.json();
        },

        listDriveFiles: async (token, maxResults = 10) => {
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?pageSize=${maxResults}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`,
                { headers: { 'Authorization': `Bearer ${token.accessToken}` } }
            );
            if (!response.ok) throw new Error('Failed to fetch drive files');
            const data = await response.json();
            return data.files || [];
        },

        createDriveFolder: async (token, name) => {
            const response = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name,
                    mimeType: 'application/vnd.google-apps.folder'
                })
            });
            if (!response.ok) throw new Error('Failed to create folder');
            return response.json();
        },

        listContacts: async (token) => {
            const response = await fetch(
                'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=20',
                { headers: { 'Authorization': `Bearer ${token.accessToken}` } }
            );
            if (!response.ok) throw new Error('Failed to fetch contacts');
            const data = await response.json();
            return (data.connections || []).map(c => ({
                name: c.names?.[0]?.displayName || 'Unknown',
                email: c.emailAddresses?.[0]?.value || null,
                phone: c.phoneNumbers?.[0]?.value || null
            }));
        }
    },

    // ==========================================
    // DISCORD TOOLS
    // ==========================================
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
                isOwner: g.owner,
                memberCount: g.approximate_member_count
            }));
        },

        getGuildChannels: async (token, guildId) => {
            const response = await fetch(`https://discord.com/api/guilds/${guildId}/channels`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch channels');
            const channels = await response.json();
            return channels.filter(c => c.type === 0).map(c => ({
                id: c.id,
                name: c.name,
                type: c.type
            }));
        },

        getDMs: async (token) => {
            const response = await fetch('https://discord.com/api/users/@me/channels', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch DMs');
            return response.json();
        },

        getConnections: async (token) => {
            const response = await fetch('https://discord.com/api/users/@me/connections', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch connections');
            return response.json();
        }
    },

    // ==========================================
    // SPOTIFY TOOLS
    // ==========================================
    spotify: {
        getProfile: async (token) => {
            const response = await fetch('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch Spotify profile');
            return response.json();
        },
        
        getTopTracks: async (token, timeRange = 'medium_term') => {
            const response = await fetch(`https://api.spotify.com/v1/me/top/tracks?limit=10&time_range=${timeRange}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch top tracks');
            const data = await response.json();
            return data.items?.map(t => ({
                name: t.name,
                artist: t.artists.map(a => a.name).join(', '),
                album: t.album.name,
                url: t.external_urls.spotify,
                previewUrl: t.preview_url
            })) || [];
        },

        getTopArtists: async (token, timeRange = 'medium_term') => {
            const response = await fetch(`https://api.spotify.com/v1/me/top/artists?limit=10&time_range=${timeRange}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch top artists');
            const data = await response.json();
            return data.items?.map(a => ({
                name: a.name,
                genres: a.genres.slice(0, 3),
                followers: a.followers.total,
                url: a.external_urls.spotify,
                image: a.images?.[0]?.url
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
                album: data.item?.album?.name,
                albumArt: data.item?.album?.images?.[0]?.url,
                progress: data.progress_ms,
                duration: data.item?.duration_ms
            };
        },

        getPlaylists: async (token) => {
            const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=20', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch playlists');
            const data = await response.json();
            return data.items?.map(p => ({
                id: p.id,
                name: p.name,
                tracks: p.tracks.total,
                url: p.external_urls.spotify,
                image: p.images?.[0]?.url,
                isPublic: p.public
            })) || [];
        },

        createPlaylist: async (token, name, description = '', isPublic = true) => {
            const userRes = await fetch('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            const user = await userRes.json();
            
            const response = await fetch(`https://api.spotify.com/v1/users/${user.id}/playlists`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, description, public: isPublic })
            });
            if (!response.ok) throw new Error('Failed to create playlist');
            return response.json();
        },

        playTrack: async (token) => {
            const response = await fetch('https://api.spotify.com/v1/me/player/play', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok && response.status !== 204) throw new Error('Failed to play');
            return { success: true, action: 'play' };
        },

        pauseTrack: async (token) => {
            const response = await fetch('https://api.spotify.com/v1/me/player/pause', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok && response.status !== 204) throw new Error('Failed to pause');
            return { success: true, action: 'pause' };
        },

        nextTrack: async (token) => {
            const response = await fetch('https://api.spotify.com/v1/me/player/next', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok && response.status !== 204) throw new Error('Failed to skip');
            return { success: true, action: 'next' };
        },

        previousTrack: async (token) => {
            const response = await fetch('https://api.spotify.com/v1/me/player/previous', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok && response.status !== 204) throw new Error('Failed to go back');
            return { success: true, action: 'previous' };
        },

        searchTracks: async (token, query) => {
            const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to search');
            const data = await response.json();
            return data.tracks?.items?.map(t => ({
                id: t.id,
                name: t.name,
                artist: t.artists.map(a => a.name).join(', '),
                album: t.album.name,
                url: t.external_urls.spotify
            })) || [];
        },

        getRecentlyPlayed: async (token) => {
            const response = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=10', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch recently played');
            const data = await response.json();
            return data.items?.map(item => ({
                track: item.track.name,
                artist: item.track.artists.map(a => a.name).join(', '),
                playedAt: item.played_at
            })) || [];
        },

        getSavedTracks: async (token) => {
            const response = await fetch('https://api.spotify.com/v1/me/tracks?limit=20', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch saved tracks');
            const data = await response.json();
            return data.items?.map(item => ({
                name: item.track.name,
                artist: item.track.artists.map(a => a.name).join(', '),
                album: item.track.album.name,
                addedAt: item.added_at
            })) || [];
        }
    },

    // ==========================================
    // SHOPIFY TOOLS
    // ==========================================
    shopify: {
        getShopInfo: async (token, shopDomain) => {
            const response = await fetch(`https://${shopDomain}/admin/api/2024-01/shop.json`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch shop info');
            const data = await response.json();
            return data.shop;
        },

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
                inventory: p.variants?.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
                images: p.images?.length || 0,
                createdAt: p.created_at
            })) || [];
        },

        createProduct: async (token, shopDomain, productData) => {
            const response = await fetch(`https://${shopDomain}/admin/api/2024-01/products.json`, {
                method: 'POST',
                headers: { 
                    'X-Shopify-Access-Token': token.accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    product: {
                        title: productData.title,
                        body_html: productData.description || '',
                        vendor: productData.vendor || 'My Store',
                        product_type: productData.type || '',
                        status: productData.status || 'draft',
                        variants: [{
                            price: productData.price || '0.00',
                            inventory_quantity: productData.inventory || 0,
                            inventory_management: 'shopify'
                        }]
                    }
                })
            });
            if (!response.ok) throw new Error('Failed to create product');
            return response.json();
        },

        updateProduct: async (token, shopDomain, productId, updates) => {
            const response = await fetch(`https://${shopDomain}/admin/api/2024-01/products/${productId}.json`, {
                method: 'PUT',
                headers: { 
                    'X-Shopify-Access-Token': token.accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ product: updates })
            });
            if (!response.ok) throw new Error('Failed to update product');
            return response.json();
        },

        deleteProduct: async (token, shopDomain, productId) => {
            const response = await fetch(`https://${shopDomain}/admin/api/2024-01/products/${productId}.json`, {
                method: 'DELETE',
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to delete product');
            return { success: true, deleted: productId };
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
                subtotal: o.subtotal_price,
                status: o.financial_status,
                fulfillment: o.fulfillment_status || 'unfulfilled',
                createdAt: o.created_at,
                customer: o.customer?.email || 'Guest',
                itemCount: o.line_items?.length || 0
            })) || [];
        },

        getOrderDetails: async (token, shopDomain, orderId) => {
            const response = await fetch(`https://${shopDomain}/admin/api/2024-01/orders/${orderId}.json`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch order');
            return response.json();
        },

        fulfillOrder: async (token, shopDomain, orderId) => {
            const response = await fetch(`https://${shopDomain}/admin/api/2024-01/orders/${orderId}/fulfillments.json`, {
                method: 'POST',
                headers: { 
                    'X-Shopify-Access-Token': token.accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fulfillment: { notify_customer: true } })
            });
            if (!response.ok) throw new Error('Failed to fulfill order');
            return response.json();
        },

        getAnalytics: async (token, shopDomain) => {
            const ordersResponse = await fetch(`https://${shopDomain}/admin/api/2024-01/orders.json?status=any&limit=250`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!ordersResponse.ok) throw new Error('Failed to fetch analytics');
            const ordersData = await ordersResponse.json();
            
            const orders = ordersData.orders || [];
            const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
            const totalOrders = orders.length;
            const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
            
            const today = new Date().toISOString().split('T')[0];
            const todayOrders = orders.filter(o => o.created_at?.startsWith(today));
            const todayRevenue = todayOrders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
            
            return {
                totalRevenue: totalRevenue.toFixed(2),
                totalOrders,
                avgOrderValue: avgOrderValue.toFixed(2),
                todayRevenue: todayRevenue.toFixed(2),
                todayOrders: todayOrders.length,
                recentOrders: orders.slice(0, 5).map(o => ({
                    orderNumber: o.order_number,
                    total: o.total_price,
                    date: o.created_at
                }))
            };
        },

        getCustomers: async (token, shopDomain) => {
            const response = await fetch(`https://${shopDomain}/admin/api/2024-01/customers.json?limit=20`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch customers');
            const data = await response.json();
            return data.customers?.map(c => ({
                id: c.id,
                email: c.email,
                name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
                ordersCount: c.orders_count,
                totalSpent: c.total_spent,
                createdAt: c.created_at
            })) || [];
        },

        createDiscount: async (token, shopDomain, discountData) => {
            const response = await fetch(`https://${shopDomain}/admin/api/2024-01/price_rules.json`, {
                method: 'POST',
                headers: { 
                    'X-Shopify-Access-Token': token.accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    price_rule: {
                        title: discountData.code,
                        target_type: 'line_item',
                        target_selection: 'all',
                        allocation_method: 'across',
                        value_type: discountData.type || 'percentage',
                        value: `-${discountData.value}`,
                        customer_selection: 'all',
                        starts_at: new Date().toISOString()
                    }
                })
            });
            if (!response.ok) throw new Error('Failed to create discount');
            const priceRule = await response.json();
            
            const codeResponse = await fetch(`https://${shopDomain}/admin/api/2024-01/price_rules/${priceRule.price_rule.id}/discount_codes.json`, {
                method: 'POST',
                headers: { 
                    'X-Shopify-Access-Token': token.accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ discount_code: { code: discountData.code } })
            });
            
            return { priceRule: priceRule.price_rule, discountCode: await codeResponse.json() };
        },

        getCollections: async (token, shopDomain) => {
            const response = await fetch(`https://${shopDomain}/admin/api/2024-01/custom_collections.json`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch collections');
            const data = await response.json();
            return data.custom_collections || [];
        },

        createCollection: async (token, shopDomain, title, description = '') => {
            const response = await fetch(`https://${shopDomain}/admin/api/2024-01/custom_collections.json`, {
                method: 'POST',
                headers: { 
                    'X-Shopify-Access-Token': token.accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    custom_collection: { title, body_html: description }
                })
            });
            if (!response.ok) throw new Error('Failed to create collection');
            return response.json();
        },

        getThemes: async (token, shopDomain) => {
            const response = await fetch(`https://${shopDomain}/admin/api/2024-01/themes.json`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!response.ok) throw new Error('Failed to fetch themes');
            const data = await response.json();
            return data.themes?.map(t => ({
                id: t.id,
                name: t.name,
                role: t.role,
                previewable: t.previewable
            })) || [];
        },

        getInventory: async (token, shopDomain) => {
            const productsRes = await fetch(`https://${shopDomain}/admin/api/2024-01/products.json?limit=50`, {
                headers: { 'X-Shopify-Access-Token': token.accessToken }
            });
            if (!productsRes.ok) throw new Error('Failed to fetch inventory');
            const data = await productsRes.json();
            
            let lowStock = [];
            let outOfStock = [];
            let totalInventory = 0;
            
            data.products?.forEach(p => {
                p.variants?.forEach(v => {
                    const qty = v.inventory_quantity || 0;
                    totalInventory += qty;
                    if (qty === 0) {
                        outOfStock.push({ product: p.title, variant: v.title, sku: v.sku });
                    } else if (qty < 10) {
                        lowStock.push({ product: p.title, variant: v.title, quantity: qty, sku: v.sku });
                    }
                });
            });
            
            return { totalInventory, lowStock, outOfStock, totalProducts: data.products?.length || 0 };
        }
    },

    // ==========================================
    // NOTION TOOLS
    // ==========================================
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
        },

        listPages: async (token) => {
            const response = await fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ filter: { property: 'object', value: 'page' } })
            });
            if (!response.ok) throw new Error('Failed to fetch pages');
            const data = await response.json();
            return data.results?.slice(0, 20).map(p => ({
                id: p.id,
                title: p.properties?.title?.title?.[0]?.plain_text || 
                       p.properties?.Name?.title?.[0]?.plain_text || 'Untitled',
                url: p.url,
                lastEdited: p.last_edited_time
            })) || [];
        },

        createPage: async (token, parentId, title, content = '') => {
            const response = await fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    parent: { page_id: parentId },
                    properties: {
                        title: { title: [{ text: { content: title } }] }
                    },
                    children: content ? [{
                        object: 'block',
                        type: 'paragraph',
                        paragraph: { rich_text: [{ text: { content } }] }
                    }] : []
                })
            });
            if (!response.ok) throw new Error('Failed to create page');
            return response.json();
        },

        queryDatabase: async (token, databaseId) => {
            const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ page_size: 20 })
            });
            if (!response.ok) throw new Error('Failed to query database');
            return response.json();
        },

        search: async (token, query) => {
            const response = await fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query })
            });
            if (!response.ok) throw new Error('Failed to search');
            const data = await response.json();
            return data.results?.slice(0, 10).map(r => ({
                id: r.id,
                type: r.object,
                title: r.properties?.title?.title?.[0]?.plain_text || 
                       r.properties?.Name?.title?.[0]?.plain_text ||
                       r.title?.[0]?.plain_text || 'Untitled',
                url: r.url
            })) || [];
        }
    },

    // ==========================================
    // STRAVA TOOLS
    // ==========================================
    strava: {
        getAthlete: async (token) => {
            const response = await fetch('https://www.strava.com/api/v3/athlete', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch athlete');
            return response.json();
        },
        
        getActivities: async (token, perPage = 10) => {
            const response = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}`, {
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
                elevation: Math.round(a.total_elevation_gain) + ' m',
                date: a.start_date_local,
                calories: a.calories || 0
            }));
        },

        getActivityDetails: async (token, activityId) => {
            const response = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch activity');
            return response.json();
        },

        getStats: async (token) => {
            const athleteRes = await fetch('https://www.strava.com/api/v3/athlete', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            const athlete = await athleteRes.json();
            
            const response = await fetch(`https://www.strava.com/api/v3/athletes/${athlete.id}/stats`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch stats');
            return response.json();
        },

        getSegmentEfforts: async (token, segmentId) => {
            const response = await fetch(`https://www.strava.com/api/v3/segment_efforts?segment_id=${segmentId}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch segment efforts');
            return response.json();
        }
    },

    // ==========================================
    // SLACK TOOLS
    // ==========================================
    slack: {
        getProfile: async (token) => {
            const response = await fetch('https://slack.com/api/users.identity', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch profile');
            return response.json();
        },

        listChannels: async (token) => {
            const response = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch channels');
            const data = await response.json();
            return data.channels?.map(c => ({
                id: c.id,
                name: c.name,
                isPrivate: c.is_private,
                memberCount: c.num_members
            })) || [];
        },

        sendMessage: async (token, channel, text) => {
            const response = await fetch('https://slack.com/api/chat.postMessage', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ channel, text })
            });
            if (!response.ok) throw new Error('Failed to send message');
            return response.json();
        },

        getMessages: async (token, channel, limit = 10) => {
            const response = await fetch(`https://slack.com/api/conversations.history?channel=${channel}&limit=${limit}`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch messages');
            return response.json();
        }
    },

    // ==========================================
    // TWITTER/X TOOLS
    // ==========================================
    twitter: {
        getProfile: async (token) => {
            const response = await fetch('https://api.twitter.com/2/users/me?user.fields=public_metrics,description,profile_image_url', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch profile');
            return response.json();
        },

        getTweets: async (token) => {
            const userRes = await fetch('https://api.twitter.com/2/users/me', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            const user = await userRes.json();
            
            const response = await fetch(`https://api.twitter.com/2/users/${user.data.id}/tweets?max_results=10&tweet.fields=public_metrics,created_at`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch tweets');
            return response.json();
        },

        postTweet: async (token, text) => {
            const response = await fetch('https://api.twitter.com/2/tweets', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text })
            });
            if (!response.ok) throw new Error('Failed to post tweet');
            return response.json();
        },

        getFollowers: async (token) => {
            const userRes = await fetch('https://api.twitter.com/2/users/me', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            const user = await userRes.json();
            
            const response = await fetch(`https://api.twitter.com/2/users/${user.data.id}/followers?max_results=20`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch followers');
            return response.json();
        }
    },

    // ==========================================
    // LINKEDIN TOOLS
    // ==========================================
    linkedin: {
        getProfile: async (token) => {
            const response = await fetch('https://api.linkedin.com/v2/userinfo', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch profile');
            return response.json();
        }
    },

    // ==========================================
    // DROPBOX TOOLS
    // ==========================================
    dropbox: {
        listFiles: async (token, path = '') => {
            const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path: path || '', limit: 20 })
            });
            if (!response.ok) throw new Error('Failed to list files');
            const data = await response.json();
            return data.entries?.map(e => ({
                name: e.name,
                type: e['.tag'],
                path: e.path_display,
                size: e.size,
                modified: e.server_modified
            })) || [];
        },

        createFolder: async (token, path) => {
            const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path })
            });
            if (!response.ok) throw new Error('Failed to create folder');
            return response.json();
        },

        getSpaceUsage: async (token) => {
            const response = await fetch('https://api.dropboxapi.com/2/users/get_space_usage', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to get space usage');
            return response.json();
        },

        search: async (token, query) => {
            const response = await fetch('https://api.dropboxapi.com/2/files/search_v2', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query })
            });
            if (!response.ok) throw new Error('Failed to search');
            return response.json();
        }
    },

    // ==========================================
    // FITBIT TOOLS
    // ==========================================
    fitbit: {
        getProfile: async (token) => {
            const response = await fetch('https://api.fitbit.com/1/user/-/profile.json', {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch profile');
            return response.json();
        },

        getActivitySummary: async (token) => {
            const today = new Date().toISOString().split('T')[0];
            const response = await fetch(`https://api.fitbit.com/1/user/-/activities/date/${today}.json`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch activity');
            return response.json();
        },

        getSleepLog: async (token) => {
            const today = new Date().toISOString().split('T')[0];
            const response = await fetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${today}.json`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch sleep');
            return response.json();
        },

        getHeartRate: async (token) => {
            const today = new Date().toISOString().split('T')[0];
            const response = await fetch(`https://api.fitbit.com/1/user/-/activities/heart/date/${today}/1d.json`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch heart rate');
            return response.json();
        },

        getWeightLog: async (token) => {
            const today = new Date().toISOString().split('T')[0];
            const response = await fetch(`https://api.fitbit.com/1/user/-/body/log/weight/date/${today}/1m.json`, {
                headers: { 'Authorization': `Bearer ${token.accessToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch weight');
            return response.json();
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
        if (lowerMessage.includes('create') && (lowerMessage.includes('repo') || lowerMessage.includes('repository'))) {
            const nameMatch = message.match(/(?:called|named|name[d]?|")\s*["']?([a-zA-Z0-9_-]+)["']?/i) ||
                              message.match(/repo(?:sitory)?\s+["']?([a-zA-Z0-9_-]+)["']?/i);
            return { tool: 'github', action: 'createRepo', params: { name: nameMatch?.[1] } };
        }
        if (lowerMessage.includes('delete') && (lowerMessage.includes('repo') || lowerMessage.includes('repository'))) {
            return { tool: 'github', action: 'deleteRepo', needsParam: 'repo' };
        }
        if (lowerMessage.includes('repo') || lowerMessage.includes('repositor')) {
            return { tool: 'github', action: 'listRepos' };
        }
        if (lowerMessage.includes('pull request') || lowerMessage.includes('pr')) {
            return { tool: 'github', action: 'listPullRequests', needsParam: 'repo' };
        }
        if (lowerMessage.includes('branch')) {
            return { tool: 'github', action: 'listBranches', needsParam: 'repo' };
        }
        if (lowerMessage.includes('issue') && lowerMessage.includes('create')) {
            return { tool: 'github', action: 'createIssue', needsParam: 'repo' };
        }
        if (lowerMessage.includes('issue')) {
            return { tool: 'github', action: 'listIssues', needsParam: 'repo' };
        }
        if (lowerMessage.includes('star') && lowerMessage.includes('repo')) {
            return { tool: 'github', action: 'starRepo', needsParam: 'repo' };
        }
        if (lowerMessage.includes('fork')) {
            return { tool: 'github', action: 'forkRepo', needsParam: 'repo' };
        }
        if (lowerMessage.includes('stats') || lowerMessage.includes('statistics')) {
            return { tool: 'github', action: 'getRepoStats', needsParam: 'repo' };
        }
        if (lowerMessage.includes('github') && (lowerMessage.includes('profile') || lowerMessage.includes('account') || lowerMessage.includes('user'))) {
            return { tool: 'github', action: 'getUser' };
        }
    }
    
    // Google/Calendar/Gmail intents
    if (connectedPlatforms.includes('google')) {
        if (lowerMessage.includes('create') && (lowerMessage.includes('event') || lowerMessage.includes('meeting') || lowerMessage.includes('appointment'))) {
            return { tool: 'google', action: 'createCalendarEvent', needsParams: ['title', 'startTime', 'endTime'] };
        }
        if (lowerMessage.includes('calendar') || lowerMessage.includes('event') || lowerMessage.includes('schedule') || lowerMessage.includes('meeting')) {
            return { tool: 'google', action: 'listCalendarEvents' };
        }
        if (lowerMessage.includes('send') && lowerMessage.includes('email')) {
            return { tool: 'google', action: 'sendEmail', needsParams: ['to', 'subject', 'body'] };
        }
        if (lowerMessage.includes('email') || lowerMessage.includes('inbox') || lowerMessage.includes('mail')) {
            return { tool: 'google', action: 'listEmails' };
        }
        if (lowerMessage.includes('drive') || lowerMessage.includes('files') || lowerMessage.includes('documents')) {
            return { tool: 'google', action: 'listDriveFiles' };
        }
        if (lowerMessage.includes('create') && lowerMessage.includes('folder')) {
            return { tool: 'google', action: 'createDriveFolder', needsParam: 'name' };
        }
        if (lowerMessage.includes('contact')) {
            return { tool: 'google', action: 'listContacts' };
        }
    }
    
    // Discord intents
    if (connectedPlatforms.includes('discord')) {
        if (lowerMessage.includes('discord') && (lowerMessage.includes('server') || lowerMessage.includes('guild'))) {
            return { tool: 'discord', action: 'getGuilds' };
        }
        if (lowerMessage.includes('channel')) {
            return { tool: 'discord', action: 'getGuildChannels', needsParam: 'guildId' };
        }
        if (lowerMessage.includes('dm') || lowerMessage.includes('direct message')) {
            return { tool: 'discord', action: 'getDMs' };
        }
        if (lowerMessage.includes('discord') && lowerMessage.includes('profile')) {
            return { tool: 'discord', action: 'getUser' };
        }
        if (lowerMessage.includes('connection')) {
            return { tool: 'discord', action: 'getConnections' };
        }
    }
    
    // Spotify intents
    if (connectedPlatforms.includes('spotify')) {
        if (lowerMessage.includes('play') && !lowerMessage.includes('playlist')) {
            return { tool: 'spotify', action: 'playTrack' };
        }
        if (lowerMessage.includes('pause') || lowerMessage.includes('stop')) {
            return { tool: 'spotify', action: 'pauseTrack' };
        }
        if (lowerMessage.includes('next') || lowerMessage.includes('skip')) {
            return { tool: 'spotify', action: 'nextTrack' };
        }
        if (lowerMessage.includes('previous') || lowerMessage.includes('back')) {
            return { tool: 'spotify', action: 'previousTrack' };
        }
        if (lowerMessage.includes('playing') || lowerMessage.includes('listening') || lowerMessage.includes('current song')) {
            return { tool: 'spotify', action: 'getCurrentlyPlaying' };
        }
        if (lowerMessage.includes('create') && lowerMessage.includes('playlist')) {
            const nameMatch = message.match(/(?:called|named|")\s*["']?([^"']+)["']?/i);
            return { tool: 'spotify', action: 'createPlaylist', params: { name: nameMatch?.[1] } };
        }
        if (lowerMessage.includes('playlist')) {
            return { tool: 'spotify', action: 'getPlaylists' };
        }
        if (lowerMessage.includes('top') && lowerMessage.includes('artist')) {
            return { tool: 'spotify', action: 'getTopArtists' };
        }
        if (lowerMessage.includes('top') && (lowerMessage.includes('track') || lowerMessage.includes('song'))) {
            return { tool: 'spotify', action: 'getTopTracks' };
        }
        if (lowerMessage.includes('recent') || lowerMessage.includes('history')) {
            return { tool: 'spotify', action: 'getRecentlyPlayed' };
        }
        if (lowerMessage.includes('saved') || lowerMessage.includes('liked')) {
            return { tool: 'spotify', action: 'getSavedTracks' };
        }
        if (lowerMessage.includes('search')) {
            const queryMatch = message.match(/search\s+(?:for\s+)?["']?([^"']+)["']?/i);
            return { tool: 'spotify', action: 'searchTracks', params: { query: queryMatch?.[1] } };
        }
        if (lowerMessage.includes('spotify') && lowerMessage.includes('profile')) {
            return { tool: 'spotify', action: 'getProfile' };
        }
    }
    
    // Shopify intents
    if (connectedPlatforms.includes('shopify')) {
        if (lowerMessage.includes('shop') && lowerMessage.includes('info')) {
            return { tool: 'shopify', action: 'getShopInfo' };
        }
        if (lowerMessage.includes('create') && lowerMessage.includes('product')) {
            return { tool: 'shopify', action: 'createProduct', needsParams: ['title', 'price'] };
        }
        if (lowerMessage.includes('delete') && lowerMessage.includes('product')) {
            return { tool: 'shopify', action: 'deleteProduct', needsParam: 'productId' };
        }
        if (lowerMessage.includes('product')) {
            return { tool: 'shopify', action: 'getProducts' };
        }
        if (lowerMessage.includes('fulfill') && lowerMessage.includes('order')) {
            return { tool: 'shopify', action: 'fulfillOrder', needsParam: 'orderId' };
        }
        if (lowerMessage.includes('order')) {
            return { tool: 'shopify', action: 'getOrders' };
        }
        if (lowerMessage.includes('customer')) {
            return { tool: 'shopify', action: 'getCustomers' };
        }
        if (lowerMessage.includes('discount') || lowerMessage.includes('coupon')) {
            return { tool: 'shopify', action: 'createDiscount', needsParams: ['code', 'value'] };
        }
        if (lowerMessage.includes('collection')) {
            if (lowerMessage.includes('create')) {
                return { tool: 'shopify', action: 'createCollection', needsParam: 'title' };
            }
            return { tool: 'shopify', action: 'getCollections' };
        }
        if (lowerMessage.includes('theme')) {
            return { tool: 'shopify', action: 'getThemes' };
        }
        if (lowerMessage.includes('inventory') || lowerMessage.includes('stock')) {
            return { tool: 'shopify', action: 'getInventory' };
        }
        if (lowerMessage.includes('analytics') || lowerMessage.includes('revenue') || lowerMessage.includes('sales')) {
            return { tool: 'shopify', action: 'getAnalytics' };
        }
    }
    
    // Notion intents
    if (connectedPlatforms.includes('notion')) {
        if (lowerMessage.includes('create') && lowerMessage.includes('page')) {
            return { tool: 'notion', action: 'createPage', needsParams: ['parentId', 'title'] };
        }
        if (lowerMessage.includes('search') && lowerMessage.includes('notion')) {
            const queryMatch = message.match(/search\s+(?:for\s+)?["']?([^"']+)["']?/i);
            return { tool: 'notion', action: 'search', params: { query: queryMatch?.[1] } };
        }
        if (lowerMessage.includes('database')) {
            return { tool: 'notion', action: 'listDatabases' };
        }
        if (lowerMessage.includes('page') || lowerMessage.includes('notion')) {
            return { tool: 'notion', action: 'listPages' };
        }
    }
    
    // Strava intents
    if (connectedPlatforms.includes('strava')) {
        if (lowerMessage.includes('stats') || lowerMessage.includes('statistics')) {
            return { tool: 'strava', action: 'getStats' };
        }
        if (lowerMessage.includes('activit') || lowerMessage.includes('workout') || lowerMessage.includes('run') || lowerMessage.includes('ride') || lowerMessage.includes('exercise')) {
            return { tool: 'strava', action: 'getActivities' };
        }
        if (lowerMessage.includes('strava') && lowerMessage.includes('profile')) {
            return { tool: 'strava', action: 'getAthlete' };
        }
    }

    // Slack intents
    if (connectedPlatforms.includes('slack')) {
        if (lowerMessage.includes('send') && lowerMessage.includes('message')) {
            return { tool: 'slack', action: 'sendMessage', needsParams: ['channel', 'text'] };
        }
        if (lowerMessage.includes('channel')) {
            return { tool: 'slack', action: 'listChannels' };
        }
        if (lowerMessage.includes('slack') && lowerMessage.includes('profile')) {
            return { tool: 'slack', action: 'getProfile' };
        }
    }

    // Twitter intents
    if (connectedPlatforms.includes('twitter')) {
        if (lowerMessage.includes('tweet') && (lowerMessage.includes('post') || lowerMessage.includes('send') || lowerMessage.includes('create'))) {
            const textMatch = message.match(/(?:tweet|post)\s+["']?([^"']+)["']?/i);
            return { tool: 'twitter', action: 'postTweet', params: { text: textMatch?.[1] } };
        }
        if (lowerMessage.includes('tweet')) {
            return { tool: 'twitter', action: 'getTweets' };
        }
        if (lowerMessage.includes('follower')) {
            return { tool: 'twitter', action: 'getFollowers' };
        }
        if (lowerMessage.includes('twitter') && lowerMessage.includes('profile')) {
            return { tool: 'twitter', action: 'getProfile' };
        }
    }

    // Dropbox intents
    if (connectedPlatforms.includes('dropbox')) {
        if (lowerMessage.includes('create') && lowerMessage.includes('folder')) {
            return { tool: 'dropbox', action: 'createFolder', needsParam: 'path' };
        }
        if (lowerMessage.includes('space') || lowerMessage.includes('storage')) {
            return { tool: 'dropbox', action: 'getSpaceUsage' };
        }
        if (lowerMessage.includes('search') && lowerMessage.includes('dropbox')) {
            return { tool: 'dropbox', action: 'search', needsParam: 'query' };
        }
        if (lowerMessage.includes('dropbox') || lowerMessage.includes('file')) {
            return { tool: 'dropbox', action: 'listFiles' };
        }
    }

    // Fitbit intents
    if (connectedPlatforms.includes('fitbit')) {
        if (lowerMessage.includes('sleep')) {
            return { tool: 'fitbit', action: 'getSleepLog' };
        }
        if (lowerMessage.includes('heart') || lowerMessage.includes('pulse')) {
            return { tool: 'fitbit', action: 'getHeartRate' };
        }
        if (lowerMessage.includes('weight')) {
            return { tool: 'fitbit', action: 'getWeightLog' };
        }
        if (lowerMessage.includes('activity') || lowerMessage.includes('steps') || lowerMessage.includes('fitbit')) {
            return { tool: 'fitbit', action: 'getActivitySummary' };
        }
        if (lowerMessage.includes('fitbit') && lowerMessage.includes('profile')) {
            return { tool: 'fitbit', action: 'getProfile' };
        }
    }

    // LinkedIn intents
    if (connectedPlatforms.includes('linkedin')) {
        if (lowerMessage.includes('linkedin')) {
            return { tool: 'linkedin', action: 'getProfile' };
        }
    }
    
    return null;
}

// ============================================
// FORMAT TOOL RESULTS
// ============================================

function formatToolResults(tool, action, data) {
    switch (`${tool}.${action}`) {
        // GitHub
        case 'github.listRepos':
            if (!data.length) return 'No repositories found.';
            return `Found ${data.length} repositories:\n\n` + 
                data.slice(0, 10).map(r => 
                    `- **${r.name}**${r.description ? `: ${r.description}` : ''} (${r.language || 'No language'}, ${r.stars} stars)`
                ).join('\n');
        
        case 'github.getUser':
            return `**GitHub Profile**\n- Username: ${data.login}\n- Name: ${data.name || 'Not set'}\n- Public repos: ${data.public_repos}\n- Followers: ${data.followers}\n- Following: ${data.following}\n- Bio: ${data.bio || 'Not set'}`;
        
        case 'github.listIssues':
            if (!data.length) return 'No open issues found.';
            return `Found ${data.length} open issues:\n` + 
                data.map(i => `- #${i.number}: ${i.title}`).join('\n');

        case 'github.createRepo':
            return `**Repository created successfully!**\n- Name: ${data.name}\n- URL: ${data.html_url}\n- Private: ${data.private ? 'Yes' : 'No'}`;

        case 'github.deleteRepo':
            return `Repository **${data.deleted}** has been deleted.`;

        case 'github.listBranches':
            return `Branches:\n` + data.map(b => `- ${b.name}`).join('\n');

        case 'github.listPullRequests':
            if (!data.length) return 'No open pull requests.';
            return `Open Pull Requests:\n` + data.map(pr => `- #${pr.number}: ${pr.title} by ${pr.author}`).join('\n');

        case 'github.getRepoStats':
            return `**${data.name} Stats**\n- Stars: ${data.stars}\n- Forks: ${data.forks}\n- Open Issues: ${data.openIssues}\n- Language: ${data.language}\n\n**Recent Commits:**\n${data.recentCommits.map(c => `- ${c.message} (${c.author})`).join('\n')}`;

        case 'github.starRepo':
            return `Successfully starred **${data.starred}**`;

        case 'github.forkRepo':
            return `**Repository forked!**\n- New repo: ${data.full_name}\n- URL: ${data.html_url}`;
        
        // Google
        case 'google.listCalendarEvents':
            if (!data.length) return 'No upcoming events found.';
            return `**Upcoming Events:**\n` + 
                data.map(e => `- **${e.title}** - ${new Date(e.start).toLocaleString()}${e.location ? ` at ${e.location}` : ''}`).join('\n');

        case 'google.createCalendarEvent':
            return `**Event created!**\n- Title: ${data.summary}\n- When: ${data.start?.dateTime}\n- Link: ${data.htmlLink}`;

        case 'google.listEmails':
            if (!data.length) return 'No emails found.';
            return `**Recent Emails:**\n` + data.map(e => `- **${e.subject}** from ${e.from}`).join('\n');

        case 'google.sendEmail':
            return `**Email sent successfully!** Message ID: ${data.id}`;

        case 'google.listDriveFiles':
            if (!data.length) return 'No files found.';
            return `**Google Drive Files:**\n` + data.map(f => `- ${f.name} (${f.mimeType?.split('.').pop() || 'file'})`).join('\n');

        case 'google.createDriveFolder':
            return `**Folder created!** - ${data.name}`;

        case 'google.listContacts':
            if (!data.length) return 'No contacts found.';
            return `**Contacts:**\n` + data.map(c => `- ${c.name}${c.email ? ` (${c.email})` : ''}`).join('\n');
        
        // Discord
        case 'discord.getGuilds':
            if (!data.length) return 'No Discord servers found.';
            return `**Your Discord Servers:**\n` + 
                data.map(g => `- **${g.name}**${g.isOwner ? ' (Owner)' : ''}`).join('\n');
        
        case 'discord.getUser':
            return `**Discord Profile**\n- Username: ${data.username}\n- ID: ${data.id}`;

        case 'discord.getGuildChannels':
            return `**Channels:**\n` + data.map(c => `- #${c.name}`).join('\n');

        case 'discord.getConnections':
            return `**Connected Accounts:**\n` + data.map(c => `- ${c.type}: ${c.name}`).join('\n');
        
        // Spotify
        case 'spotify.getCurrentlyPlaying':
            if (!data.isPlaying) return 'Nothing is currently playing on Spotify.';
            return `**Now Playing:**\n- Track: ${data.track}\n- Artist: ${data.artist}\n- Album: ${data.album}`;
        
        case 'spotify.getTopTracks':
            if (!data.length) return 'No top tracks found.';
            return `**Your Top Tracks:**\n` + 
                data.map((t, i) => `${i + 1}. **${t.name}** by ${t.artist}`).join('\n');

        case 'spotify.getTopArtists':
            if (!data.length) return 'No top artists found.';
            return `**Your Top Artists:**\n` + data.map((a, i) => `${i + 1}. **${a.name}** (${a.genres.join(', ')})`).join('\n');

        case 'spotify.getPlaylists':
            if (!data.length) return 'No playlists found.';
            return `**Your Playlists:**\n` + data.map(p => `- **${p.name}** (${p.tracks} tracks)`).join('\n');

        case 'spotify.createPlaylist':
            return `**Playlist created!**\n- Name: ${data.name}\n- URL: ${data.external_urls?.spotify}`;

        case 'spotify.playTrack':
        case 'spotify.pauseTrack':
        case 'spotify.nextTrack':
        case 'spotify.previousTrack':
            return `Playback: **${data.action}** executed successfully.`;

        case 'spotify.searchTracks':
            if (!data.length) return 'No tracks found.';
            return `**Search Results:**\n` + data.map(t => `- **${t.name}** by ${t.artist}`).join('\n');

        case 'spotify.getRecentlyPlayed':
            return `**Recently Played:**\n` + data.map(t => `- ${t.track} by ${t.artist}`).join('\n');

        case 'spotify.getSavedTracks':
            return `**Saved Tracks:**\n` + data.map(t => `- **${t.name}** by ${t.artist}`).join('\n');
        
        // Shopify
        case 'shopify.getShopInfo':
            return `**Shop Info:**\n- Name: ${data.name}\n- Domain: ${data.domain}\n- Email: ${data.email}\n- Currency: ${data.currency}\n- Plan: ${data.plan_name}`;

        case 'shopify.getProducts':
            if (!data.length) return 'No products found in your store.';
            return `**Your Products (${data.length}):**\n` + 
                data.slice(0, 10).map(p => `- **${p.title}**: $${p.price} (${p.inventory} in stock)`).join('\n');

        case 'shopify.createProduct':
            return `**Product created!**\n- Title: ${data.product?.title}\n- ID: ${data.product?.id}\n- Status: ${data.product?.status}`;

        case 'shopify.deleteProduct':
            return `Product **${data.deleted}** has been deleted.`;
        
        case 'shopify.getOrders':
            if (!data.length) return 'No orders found.';
            return `**Recent Orders:**\n` + 
                data.slice(0, 10).map(o => `- Order #${o.orderNumber}: $${o.total} (${o.status}) - ${o.customer}`).join('\n');

        case 'shopify.fulfillOrder':
            return `**Order fulfilled!** Fulfillment ID: ${data.fulfillment?.id}`;

        case 'shopify.getCustomers':
            if (!data.length) return 'No customers found.';
            return `**Customers:**\n` + data.map(c => `- ${c.name} (${c.email}) - ${c.ordersCount} orders, $${c.totalSpent} spent`).join('\n');

        case 'shopify.createDiscount':
            return `**Discount created!**\n- Code: ${data.discountCode?.discount_code?.code}\n- Value: ${data.priceRule?.value}%`;

        case 'shopify.getCollections':
            if (!data.length) return 'No collections found.';
            return `**Collections:**\n` + data.map(c => `- ${c.title}`).join('\n');

        case 'shopify.createCollection':
            return `**Collection created!** - ${data.custom_collection?.title}`;

        case 'shopify.getThemes':
            return `**Themes:**\n` + data.map(t => `- ${t.name} (${t.role})`).join('\n');

        case 'shopify.getInventory':
            return `**Inventory Summary:**\n- Total Products: ${data.totalProducts}\n- Total Inventory: ${data.totalInventory} units\n- Low Stock Items: ${data.lowStock.length}\n- Out of Stock: ${data.outOfStock.length}${data.lowStock.length > 0 ? `\n\n**Low Stock:**\n${data.lowStock.slice(0, 5).map(i => `- ${i.product}: ${i.quantity} left`).join('\n')}` : ''}`;
        
        case 'shopify.getAnalytics':
            return `**Store Analytics:**\n- Total Revenue: $${data.totalRevenue}\n- Total Orders: ${data.totalOrders}\n- Avg Order Value: $${data.avgOrderValue}\n- Today's Revenue: $${data.todayRevenue}\n- Today's Orders: ${data.todayOrders}`;
        
        // Notion
        case 'notion.listDatabases':
            if (!data.length) return 'No Notion databases found.';
            return `**Your Notion Databases:**\n` + 
                data.map(d => `- ${d.title}`).join('\n');

        case 'notion.listPages':
            if (!data.length) return 'No pages found.';
            return `**Your Notion Pages:**\n` + data.map(p => `- ${p.title}`).join('\n');

        case 'notion.createPage':
            return `**Page created!**\n- URL: ${data.url}`;

        case 'notion.search':
            if (!data.length) return 'No results found.';
            return `**Search Results:**\n` + data.map(r => `- ${r.title} (${r.type})`).join('\n');
        
        // Strava
        case 'strava.getActivities':
            if (!data.length) return 'No recent activities found.';
            return `**Recent Activities:**\n` + 
                data.map(a => `- **${a.name}** (${a.type}): ${a.distance} in ${a.duration}, ${a.elevation} elevation`).join('\n');
        
        case 'strava.getAthlete':
            return `**Strava Profile:**\n- Name: ${data.firstname} ${data.lastname}\n- City: ${data.city || 'Not set'}\n- Country: ${data.country || 'Not set'}`;

        case 'strava.getStats':
            return `**Strava Stats:**\n- All-time runs: ${data.all_run_totals?.count || 0}\n- All-time distance: ${((data.all_run_totals?.distance || 0) / 1000).toFixed(1)} km\n- Recent runs: ${data.recent_run_totals?.count || 0}`;

        // Slack
        case 'slack.listChannels':
            if (!data.length) return 'No channels found.';
            return `**Slack Channels:**\n` + data.map(c => `- #${c.name}${c.isPrivate ? ' (private)' : ''}`).join('\n');

        case 'slack.sendMessage':
            return `**Message sent!** to channel ${data.channel}`;

        // Twitter
        case 'twitter.getProfile':
            return `**Twitter Profile:**\n- Name: ${data.data?.name}\n- Username: @${data.data?.username}\n- Followers: ${data.data?.public_metrics?.followers_count}\n- Following: ${data.data?.public_metrics?.following_count}`;

        case 'twitter.getTweets':
            if (!data.data?.length) return 'No tweets found.';
            return `**Recent Tweets:**\n` + data.data.map(t => `- ${t.text.slice(0, 100)}...`).join('\n');

        case 'twitter.postTweet':
            return `**Tweet posted!** ID: ${data.data?.id}`;

        // Dropbox
        case 'dropbox.listFiles':
            if (!data.length) return 'No files found.';
            return `**Dropbox Files:**\n` + data.map(f => `- ${f.name} (${f.type})`).join('\n');

        case 'dropbox.createFolder':
            return `**Folder created!** - ${data.metadata?.name}`;

        case 'dropbox.getSpaceUsage':
            const used = (data.used / 1024 / 1024 / 1024).toFixed(2);
            const allocated = (data.allocation?.allocated / 1024 / 1024 / 1024).toFixed(2);
            return `**Dropbox Storage:**\n- Used: ${used} GB\n- Total: ${allocated} GB`;

        // Fitbit
        case 'fitbit.getActivitySummary':
            const summary = data.summary;
            return `**Today's Activity:**\n- Steps: ${summary?.steps || 0}\n- Calories: ${summary?.caloriesOut || 0}\n- Distance: ${summary?.distances?.[0]?.distance || 0} km\n- Active Minutes: ${summary?.fairlyActiveMinutes + summary?.veryActiveMinutes || 0}`;

        case 'fitbit.getSleepLog':
            const sleep = data.sleep?.[0];
            return sleep ? `**Last Night's Sleep:**\n- Duration: ${Math.round(sleep.duration / 3600000)} hours\n- Efficiency: ${sleep.efficiency}%` : 'No sleep data found.';

        case 'fitbit.getHeartRate':
            const hr = data['activities-heart']?.[0]?.value;
            return `**Heart Rate:**\n- Resting: ${hr?.restingHeartRate || 'N/A'} bpm`;

        // Default
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
                    // Get additional metadata
                    const user = await User.findOne({ email: email.toLowerCase() });
                    const account = user?.connectedAccounts?.find(a => a.platform === intent.tool);
                    const shopDomain = account?.shopDomain || account?.metadata?.shopDomain || token.shopDomain;
                    
                    // Execute the tool
                    let data;
                    const toolFn = tools[intent.tool]?.[intent.action];
                    
                    if (!toolFn) {
                        throw new Error(`Unknown action: ${intent.action}`);
                    }

                    // Handle different parameter requirements
                    if (intent.tool === 'shopify') {
                        if (!shopDomain) throw new Error('Shop domain not found');
                        if (intent.params) {
                            data = await toolFn(token, shopDomain, intent.params);
                        } else {
                            data = await toolFn(token, shopDomain);
                        }
                    } else if (intent.params) {
                        // For actions with extracted parameters (like createRepo with name)
                        const paramValues = Object.values(intent.params).filter(Boolean);
                        if (paramValues.length > 0) {
                            data = await toolFn(token, ...paramValues);
                        } else if (intent.needsParam || intent.needsParams) {
                            throw new Error(`Please specify: ${intent.needsParam || intent.needsParams.join(', ')}`);
                        } else {
                            data = await toolFn(token);
                        }
                    } else if (intent.needsParam) {
                        throw new Error(`Please specify the ${intent.needsParam}`);
                    } else {
                        data = await toolFn(token);
                    }
                    
                    toolResult = formatToolResults(intent.tool, intent.action, data);
                    toolUsed = intent.tool;
                    actionTaken = intent.action;
                    
                    console.log(`Tool executed successfully: ${intent.tool}.${intent.action}`);
                } catch (toolError) {
                    console.error(`Tool error: ${toolError.message}`);
                    toolResult = `I tried to use ${intent.tool}.${intent.action} but encountered an error: ${toolError.message}`;
                }
            } else {
                toolResult = `${intent.tool} is not connected or the token has expired. Please reconnect from the Settings tab.`;
            }
        }

        // Build AI context
        const systemPrompt = `You are Master Agent, a powerful AI assistant integrated with the user's connected apps and services.

User: ${userName || 'User'}
Goal: ${goal?.title || 'Not specified'}
Connected platforms: ${connectedPlatforms.length > 0 ? connectedPlatforms.join(', ') : 'None'}
Active tools: ${activeTools.length > 0 ? activeTools.join(', ') : 'None'}

${toolResult ? `TOOL RESULT (${toolUsed}.${actionTaken}):\n${toolResult}\n\nUse this real data to answer the user's question. Present it clearly and offer helpful insights or next actions.` : ''}

Guidelines:
- If you have tool results, present them clearly and offer insights
- If the user asks about something you can't access, explain what they need to connect
- Be concise but helpful
- Use **bold** for emphasis
- Suggest relevant actions the user can take
- For create/delete actions, confirm what was done
- If parameters are missing, ask the user to provide them`;

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

        const user = await User.findOne({ email: email.toLowerCase() });
        const account = user?.connectedAccounts?.find(a => a.platform === tool);
        const shopDomain = account?.shopDomain || account?.metadata?.shopDomain || token.shopDomain;

        let data;
        if (tool === 'shopify') {
            data = await tools[tool][action](token, shopDomain, ...Object.values(params));
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
