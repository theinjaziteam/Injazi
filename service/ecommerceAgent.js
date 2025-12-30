// service/ecommerceAgent.js
import express from 'express';
import { User } from './models.js';

const router = express.Router();


const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ============================================
// HELPER: AI Completion
// ============================================
async function aiCompletion(messages, jsonMode = false) {
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
            max_tokens: 4096,
            ...(jsonMode && { response_format: { type: "json_object" } })
        })
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
}

// ============================================
// MASTER AGENT ORCHESTRATION
// ============================================
router.post('/orchestrate', async (req, res) => {
    try {
        const { email, userMessage, context } = req.body;
        
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Build system prompt for orchestrator
        const systemPrompt = `You are the Master E-commerce AI Agent. You help users grow their Shopify store by:
1. Setting up their store
2. Adding and optimizing products
3. Analyzing store performance
4. Running email marketing campaigns
5. Creating social media content

Current User Context:
- Store: ${user.shopifyStores?.[0]?.storeName || 'Not set up yet'}
- Goal: ${user.ecommerceGoal?.storeNiche || 'Not defined'}
- Target Revenue: $${user.ecommerceGoal?.monthlyRevenueTarget || 'Not set'}
- Connected Accounts: ${user.connectedEcommerceAccounts?.filter(a => a.isConnected).map(a => a.platform).join(', ') || 'None'}

Your job is to:
1. Understand what the user wants
2. Determine which sub-agent to invoke
3. Provide helpful guidance
4. Suggest proactive actions when relevant

Respond with JSON:
{
  "intent": "shopify_setup | product_add | analytics | email_marketing | social_media | general_help",
  "subAgentRequired": "shopify_setup | product_ingestion | analytics | email_marketing | social_media | none",
  "response": "Your conversational response to the user",
  "suggestedActions": [
    {
      "title": "Action title",
      "description": "What this action does",
      "priority": "high | medium | low",
      "agentType": "sub-agent type"
    }
  ],
  "requiresUserInput": ["list of required inputs if any"],
  "nextSteps": "What happens next"
}`;

        const response = await aiCompletion([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ], true);

        const parsed = JSON.parse(response);

        // Log the action
        const actionLog = {
            id: `action-${Date.now()}`,
            timestamp: Date.now(),
            agentType: parsed.subAgentRequired || 'general',
            actionType: 'suggest',
            status: 'pending',
            title: 'Master Agent Response',
            description: parsed.response,
            payload: { userMessage, parsed },
            requiresApproval: false,
            isReversible: false
        };

        await User.findOneAndUpdate(
            { email },
            { $push: { aiActionLogs: actionLog } }
        );

        res.json({
            success: true,
            ...parsed,
            actionLogId: actionLog.id
        });

    } catch (error) {
        console.error('Orchestration error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// ============================================
// SHOPIFY SETUP AGENT
// ============================================
router.post('/shopify/setup', async (req, res) => {
    try {
        const { email, storeName, currency, language, niche } = req.body;

        // In production, this would call Shopify Partner API
        // For now, we simulate the store creation
        const store = {
            id: `store-${Date.now()}`,
            storeName,
            currency: currency || 'USD',
            language: language || 'en',
            status: 'pending',
            createdAt: Date.now(),
            settings: {
                paymentProviders: [],
                shippingZones: []
            }
        };

        await User.findOneAndUpdate(
            { email },
            { 
                $push: { shopifyStores: store },
                $set: { 
                    'ecommerceGoal.storeNiche': niche,
                    'ecommerceGoal.updatedAt': Date.now()
                }
            }
        );

        // Log the action
        const actionLog = {
            id: `action-${Date.now()}`,
            timestamp: Date.now(),
            agentType: 'shopify_setup',
            actionType: 'execute_with_approval',
            status: 'executed',
            title: 'Store Created',
            description: `Created Shopify store: ${storeName}`,
            payload: { store },
            requiresApproval: false,
            isReversible: true,
            executedAt: Date.now(),
            result: { storeId: store.id }
        };

        await User.findOneAndUpdate(
            { email },
            { $push: { aiActionLogs: actionLog } }
        );

        res.json({ success: true, store, actionLogId: actionLog.id });

    } catch (error) {
        console.error('Shopify setup error:', error);
        res.status(500).json({ error: 'Failed to set up store' });
    }
});

// ============================================
// PRODUCT INGESTION AGENT
// ============================================
router.post('/products/scrape', async (req, res) => {
    try {
        const { email, productUrls } = req.body;

        if (!productUrls || !Array.isArray(productUrls)) {
            return res.status(400).json({ error: 'Product URLs required' });
        }

        const drafts = [];

        for (const url of productUrls.slice(0, 10)) { // Limit to 10 products
            // Determine source platform
            let sourcePlatform = 'other';
            if (url.includes('aliexpress')) sourcePlatform = 'aliexpress';
            else if (url.includes('amazon')) sourcePlatform = 'amazon';
            else if (url.includes('alibaba')) sourcePlatform = 'alibaba';

            // In production, this would actually scrape the page
            // For now, we use AI to generate mock product data
            const scrapePrompt = `Generate realistic scraped product data for this URL: ${url}
Source: ${sourcePlatform}

Return JSON:
{
  "title": "Product title",
  "description": "Full product description",
  "images": ["url1", "url2"],
  "variants": [{"id": "v1", "title": "Default", "price": 19.99, "inventoryQuantity": 100, "options": {}}],
  "specs": {"Material": "Cotton", "Size": "M"},
  "originalPrice": 19.99,
  "currency": "USD"
}`;

            const scrapedResponse = await aiCompletion([
                { role: 'system', content: 'You generate realistic e-commerce product data. Always return valid JSON.' },
                { role: 'user', content: scrapePrompt }
            ], true);

            const scrapedData = JSON.parse(scrapedResponse);

            // Now optimize with AI
            const optimizePrompt = `Optimize this product for Shopify e-commerce:

Original Title: ${scrapedData.title}
Original Description: ${scrapedData.description}

Create:
1. SEO-optimized title (max 70 chars)
2. Compelling product description with benefits
3. SEO meta title and description
4. Relevant tags (5-10)
5. Suggested collections

Return JSON:
{
  "title": "Optimized title",
  "description": "Optimized description with HTML formatting",
  "seoTitle": "SEO meta title",
  "seoDescription": "SEO meta description",
  "tags": ["tag1", "tag2"],
  "collections": ["collection1"]
}`;

            const optimizedResponse = await aiCompletion([
                { role: 'system', content: 'You are an e-commerce SEO expert. Optimize products for maximum conversions.' },
                { role: 'user', content: optimizePrompt }
            ], true);

            const optimizedData = JSON.parse(optimizedResponse);

            const draft = {
                id: `product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                sourceUrl: url,
                sourcePlatform,
                scrapedAt: Date.now(),
                status: 'optimized',
                originalData: scrapedData,
                optimizedData
            };

            drafts.push(draft);
        }

        // Save drafts to user
        await User.findOneAndUpdate(
            { email },
            { $push: { productDrafts: { $each: drafts } } }
        );

        // Log the action
        const actionLog = {
            id: `action-${Date.now()}`,
            timestamp: Date.now(),
            agentType: 'product_ingestion',
            actionType: 'execute_with_approval',
            status: 'executed',
            title: `Scraped ${drafts.length} Products`,
            description: `Scraped and optimized ${drafts.length} products from provided URLs`,
            payload: { urls: productUrls, draftIds: drafts.map(d => d.id) },
            requiresApproval: false,
            isReversible: true,
            executedAt: Date.now()
        };

        await User.findOneAndUpdate(
            { email },
            { $push: { aiActionLogs: actionLog } }
        );

        res.json({ success: true, drafts, actionLogId: actionLog.id });

    } catch (error) {
        console.error('Product scrape error:', error);
        res.status(500).json({ error: 'Failed to scrape products' });
    }
});

router.post('/products/approve', async (req, res) => {
    try {
        const { email, productId, finalData } = req.body;

        await User.findOneAndUpdate(
            { email, 'productDrafts.id': productId },
            { 
                $set: { 
                    'productDrafts.$.status': 'approved',
                    'productDrafts.$.finalData': finalData
                }
            }
        );

        res.json({ success: true, message: 'Product approved' });

    } catch (error) {
        res.status(500).json({ error: 'Failed to approve product' });
    }
});

router.post('/products/publish', async (req, res) => {
    try {
        const { email, productId } = req.body;

        const user = await User.findOne({ email });
        const draft = user.productDrafts?.find(p => p.id === productId);

        if (!draft || draft.status !== 'approved') {
            return res.status(400).json({ error: 'Product must be approved first' });
        }

        // In production, this would call Shopify API to create the product
        const shopifyProductId = `shopify-${Date.now()}`;

        await User.findOneAndUpdate(
            { email, 'productDrafts.id': productId },
            { 
                $set: { 
                    'productDrafts.$.status': 'published',
                    'productDrafts.$.shopifyProductId': shopifyProductId,
                    'productDrafts.$.publishedAt': Date.now()
                }
            }
        );

        // Log the action
        const actionLog = {
            id: `action-${Date.now()}`,
            timestamp: Date.now(),
            agentType: 'product_ingestion',
            actionType: 'execute_with_approval',
            status: 'executed',
            title: 'Product Published',
            description: `Published product to Shopify: ${draft.finalData?.title || draft.optimizedData?.title}`,
            payload: { productId, shopifyProductId },
            requiresApproval: true,
            executedAt: Date.now(),
            isReversible: true
        };

        await User.findOneAndUpdate(
            { email },
            { $push: { aiActionLogs: actionLog } }
        );

        res.json({ success: true, shopifyProductId, actionLogId: actionLog.id });

    } catch (error) {
        res.status(500).json({ error: 'Failed to publish product' });
    }
});

// ============================================
// ANALYTICS AGENT
// ============================================
router.get('/analytics/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const { period = 'daily' } = req.query;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });

        // In production, this would pull from Shopify Analytics API
        // For now, generate AI-powered insights based on mock data
        const analyticsPrompt = `Generate realistic e-commerce analytics for a ${user.ecommerceGoal?.storeNiche || 'general'} store.
Period: ${period}
Target Monthly Revenue: $${user.ecommerceGoal?.monthlyRevenueTarget || 5000}

Return JSON with this structure:
{
  "revenue": 1234.56,
  "orders": 45,
  "conversionRate": 2.5,
  "averageOrderValue": 27.43,
  "traffic": {
    "total": 1800,
    "organic": 600,
    "paid": 400,
    "social": 500,
    "direct": 300
  },
  "topProducts": [
    {"productId": "p1", "title": "Product Name", "revenue": 450, "units": 15}
  ],
  "underperformingProducts": [
    {"productId": "p2", "title": "Product Name", "views": 200, "conversionRate": 0.5}
  ],
  "cartAbandonment": {
    "rate": 68.5,
    "recoveredRevenue": 234.50,
    "abandonedCarts": 52
  },
  "insights": [
    {
      "id": "i1",
      "type": "action_required",
      "title": "High Cart Abandonment",
      "description": "Your cart abandonment rate is above industry average",
      "metric": "68.5%",
      "suggestedAction": "Set up abandoned cart email sequence",
      "priority": "high"
    }
  ]
}`;

        const analyticsResponse = await aiCompletion([
            { role: 'system', content: 'You are an e-commerce analytics expert. Generate realistic and actionable data.' },
            { role: 'user', content: analyticsPrompt }
        ], true);

        const analyticsData = JSON.parse(analyticsResponse);

        const snapshot = {
            id: `analytics-${Date.now()}`,
            timestamp: Date.now(),
            period,
            ...analyticsData
        };

        // Save snapshot
        await User.findOneAndUpdate(
            { email },
            { $push: { analyticsSnapshots: snapshot } }
        );

        res.json({ success: true, analytics: snapshot });

    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// ============================================
// EMAIL MARKETING AGENT
// ============================================
router.post('/email/generate', async (req, res) => {
    try {
        const { email, campaignType, productId, customPrompt } = req.body;

        const user = await User.findOne({ email });
        const store = user.shopifyStores?.[0];
        const product = productId ? user.productDrafts?.find(p => p.id === productId) : null;

        const emailPrompt = `Generate an email campaign for an e-commerce store.

Store: ${store?.storeName || 'My Store'}
Niche: ${user.ecommerceGoal?.storeNiche || 'General'}
Campaign Type: ${campaignType}
${product ? `Featured Product: ${product.finalData?.title || product.optimizedData?.title}` : ''}
${customPrompt ? `Custom Instructions: ${customPrompt}` : ''}

Return JSON:
{
  "subject": "Email subject line (max 50 chars)",
  "preheader": "Preview text (max 100 chars)",
  "htmlContent": "<html>Full email HTML content with inline styles</html>",
  "plainTextContent": "Plain text version",
  "suggestedSegment": "all | vip | new_customers | abandoned_cart | inactive"
}`;

        const emailResponse = await aiCompletion([
            { role: 'system', content: 'You are an email marketing expert specializing in e-commerce. Create high-converting emails.' },
            { role: 'user', content: emailPrompt }
        ], true);

        const emailData = JSON.parse(emailResponse);

        const draft = {
            id: `email-${Date.now()}`,
            type: campaignType,
            status: 'draft',
            createdAt: Date.now(),
            ...emailData,
            segmentName: emailData.suggestedSegment
        };

        await User.findOneAndUpdate(
            { email },
            { $push: { emailCampaignDrafts: draft } }
        );

        // Log action
        const actionLog = {
            id: `action-${Date.now()}`,
            timestamp: Date.now(),
            agentType: 'email_marketing',
            actionType: 'suggest',
            status: 'pending',
            title: `Email Draft: ${campaignType}`,
            description: `Generated ${campaignType} email campaign draft`,
            payload: { draftId: draft.id, type: campaignType },
            requiresApproval: true,
            isReversible: true
        };

        await User.findOneAndUpdate(
            { email },
            { $push: { aiActionLogs: actionLog } }
        );

        res.json({ success: true, draft, actionLogId: actionLog.id });

    } catch (error) {
        console.error('Email generation error:', error);
        res.status(500).json({ error: 'Failed to generate email' });
    }
});

router.post('/email/approve', async (req, res) => {
    try {
        const { email, draftId, scheduledAt } = req.body;

        await User.findOneAndUpdate(
            { email, 'emailCampaignDrafts.id': draftId },
            { 
                $set: { 
                    'emailCampaignDrafts.$.status': scheduledAt ? 'scheduled' : 'approved',
                    'emailCampaignDrafts.$.scheduledAt': scheduledAt
                }
            }
        );

        res.json({ success: true, message: 'Email approved' });

    } catch (error) {
        res.status(500).json({ error: 'Failed to approve email' });
    }
});

// ============================================
// SOCIAL MEDIA AGENT
// ============================================
router.post('/social/generate', async (req, res) => {
    try {
        const { email, platform, contentType, productId, customPrompt } = req.body;

        const user = await User.findOne({ email });
        const product = productId ? user.productDrafts?.find(p => p.id === productId) : null;

        const socialPrompt = `Generate social media content for ${platform}.

Content Type: ${contentType}
Niche: ${user.ecommerceGoal?.storeNiche || 'General'}
${product ? `Product: ${product.finalData?.title || product.optimizedData?.title}` : ''}
${customPrompt ? `Custom Instructions: ${customPrompt}` : ''}

Return JSON:
{
  "caption": "Engaging caption with emojis (platform appropriate length)",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
  "videoScript": "If applicable, a short video script",
  "suggestedMediaDescription": "Description of what media to use",
  "bestPostingTime": "Suggested time to post",
  "hooks": ["Hook option 1", "Hook option 2", "Hook option 3"]
}`;

        const socialResponse = await aiCompletion([
            { role: 'system', content: `You are a ${platform} content expert. Create viral, engaging content.` },
            { role: 'user', content: socialPrompt }
        ], true);

        const socialData = JSON.parse(socialResponse);

        const draft = {
            id: `social-${Date.now()}`,
            platform,
            contentType,
            status: 'draft',
            createdAt: Date.now(),
            caption: socialData.caption,
            hashtags: socialData.hashtags,
            videoScript: socialData.videoScript,
            mediaUrls: [],
            linkedProductId: productId
        };

        await User.findOneAndUpdate(
            { email },
            { $push: { socialContentDrafts: draft } }
        );

        // Log action
        const actionLog = {
            id: `action-${Date.now()}`,
            timestamp: Date.now(),
            agentType: 'social_media',
            actionType: 'suggest',
            status: 'pending',
            title: `${platform} ${contentType} Draft`,
            description: `Generated ${contentType} content for ${platform}`,
            payload: { draftId: draft.id, platform, contentType },
            requiresApproval: true,
            isReversible: true
        };

        await User.findOneAndUpdate(
            { email },
            { $push: { aiActionLogs: actionLog } }
        );

        res.json({ success: true, draft, socialData, actionLogId: actionLog.id });

    } catch (error) {
        console.error('Social generation error:', error);
        res.status(500).json({ error: 'Failed to generate social content' });
    }
});

// ============================================
// ACTION LOG & APPROVALS
// ============================================
router.get('/actions/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const { status, limit = 50 } = req.query;

        const user = await User.findOne({ email });
        let actions = user.aiActionLogs || [];

        if (status) {
            actions = actions.filter(a => a.status === status);
        }

        actions = actions.sort((a, b) => b.timestamp - a.timestamp).slice(0, parseInt(limit));

        res.json({ success: true, actions });

    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch actions' });
    }
});

router.post('/actions/approve', async (req, res) => {
    try {
        const { email, actionId } = req.body;

        await User.findOneAndUpdate(
            { email, 'aiActionLogs.id': actionId },
            { 
                $set: { 
                    'aiActionLogs.$.status': 'approved',
                    'aiActionLogs.$.approvedAt': Date.now()
                }
            }
        );

        res.json({ success: true, message: 'Action approved' });

    } catch (error) {
        res.status(500).json({ error: 'Failed to approve action' });
    }
});

router.post('/actions/reject', async (req, res) => {
    try {
        const { email, actionId, reason } = req.body;

        await User.findOneAndUpdate(
            { email, 'aiActionLogs.id': actionId },
            { 
                $set: { 
                    'aiActionLogs.$.status': 'rejected',
                    'aiActionLogs.$.rejectedAt': Date.now(),
                    'aiActionLogs.$.rejectedReason': reason
                }
            }
        );

        res.json({ success: true, message: 'Action rejected' });

    } catch (error) {
        res.status(500).json({ error: 'Failed to reject action' });
    }
});

// ============================================
// OAUTH CONNECTIONS (Stubs)
// ============================================
router.get('/oauth/:platform/url', (req, res) => {
    const { platform } = req.params;
    // In production, generate actual OAuth URLs
    const oauthUrls = {
        shopify: `https://accounts.shopify.com/oauth/authorize?client_id=YOUR_APP_ID`,
        klaviyo: `https://www.klaviyo.com/oauth/authorize`,
        tiktok: `https://open-api.tiktok.com/platform/oauth/connect`,
        instagram: `https://api.instagram.com/oauth/authorize`,
        facebook: `https://www.facebook.com/v18.0/dialog/oauth`
    };

    res.json({ url: oauthUrls[platform] || null });
});

router.post('/oauth/callback', async (req, res) => {
    try {
        const { email, platform, code } = req.body;

        // In production, exchange code for tokens
        const account = {
            id: `account-${Date.now()}`,
            platform,
            isConnected: true,
            connectedAt: Date.now(),
            permissions: ['read', 'write']
        };

        await User.findOneAndUpdate(
            { email },
            { $push: { connectedEcommerceAccounts: account } }
        );

        res.json({ success: true, account });

    } catch (error) {
        res.status(500).json({ error: 'OAuth failed' });
    }
});

export default router;
