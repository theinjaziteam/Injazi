// service/models.js
import mongoose from 'mongoose';

// ============================================
// TASK SCHEMA
// ============================================
const TaskSchema = new mongoose.Schema({
    id: String,
    dayNumber: Number,
    title: String,
    description: String,
    estimatedTimeMinutes: Number,
    difficulty: String,
    videoRequirements: String,
    creditsReward: Number,
    isSelected: Boolean,
    status: { type: String, default: 'pending' },
    verificationMessage: String,
    isSupplementary: Boolean,
    progress: { type: Number, default: 0 },
    maxProgress: { type: Number, default: 1 },
    timeLeft: { type: Number, default: 0 },
    lastUpdated: { type: Number, default: 0 },
    isTimerActive: { type: Boolean, default: false },
    sourceLessonId: String,
    isLessonTask: Boolean
});

// ============================================
// GOAL SCHEMA
// ============================================
const GoalSchema = new mongoose.Schema({
    id: String,
    title: String,
    category: String,
    mode: String,
    summary: String,
    explanation: String,
    difficultyProfile: String,
    durationDays: Number,
    createdAt: Number,
    visualUrl: String,
    dailyQuestions: [String],
    savedTasks: [TaskSchema],
    savedCurriculum: { type: Array, default: [] },
    savedCourses: { type: Array, default: [] },
    savedProducts: { type: Array, default: [] },
    savedFeed: { type: Array, default: [] },
    savedVideos: { type: Array, default: [] },
    savedDay: Number
});

// ============================================
// ADGEM OFFER SCHEMA
// ============================================
const AdgemOfferSchema = new mongoose.Schema({
    id: String,
    visibleId: String,
    storeId: String,
    trackingType: String,
    epc: String,
    icon: String,
    name: String,
    clickUrl: String,
    instructions: String,
    description: String,
    shortDescription: String,
    category1: String,
    category2: String,
    amount: Number,
    completionDifficulty: Number,
    renderSticker: Boolean,
    stickerText: String,
    stickerColor: String,
    os: {
        android: Boolean,
        ios: Boolean,
        web: Boolean
    }
});

// ============================================
// ADGEM TRANSACTION SCHEMA
// ============================================
const AdgemTransactionSchema = new mongoose.Schema({
    transactionId: { type: String, required: true },
    visibleId: String,
    campaignId: String,
    offerId: String,
    offerName: String,
    credits: Number,
    payout: Number,
    goalId: String,
    goalName: String,
    completedAt: { type: Number, default: Date.now }
});

// ============================================
// E-COMMERCE SCHEMAS (NEW)
// ============================================

// Connected Account Schema
const ConnectedAccountSchema = new mongoose.Schema({
    id: String,
    platform: { 
        type: String, 
        enum: ['shopify', 'klaviyo', 'mailchimp', 'tiktok', 'instagram', 'facebook', 'youtube', 'google_analytics', 'meta_ads'] 
    },
    accessToken: String,
    refreshToken: String,
    expiresAt: Number,
    isConnected: { type: Boolean, default: false },
    connectedAt: Number,
    permissions: [String],
    metadata: mongoose.Schema.Types.Mixed
});

// E-commerce Goal Schema
const EcommerceGoalSchema = new mongoose.Schema({
    id: String,
    storeNiche: String,
    targetAudience: String,
    pricingStrategy: { 
        type: String, 
        enum: ['budget', 'mid_range', 'premium', 'luxury'] 
    },
    monthlyRevenueTarget: Number,
    preferredPlatforms: [String],
    createdAt: Number,
    updatedAt: Number
});

// Shipping Zone Schema
const ShippingZoneSchema = new mongoose.Schema({
    id: String,
    name: String,
    countries: [String],
    rates: [{
        name: String,
        price: Number,
        minOrder: Number
    }]
});

// Shopify Store Schema
const ShopifyStoreSchema = new mongoose.Schema({
    id: String,
    shopifyId: String,
    storeName: String,
    storeUrl: String,
    theme: String,
    currency: String,
    language: String,
    status: { 
        type: String, 
        enum: ['pending', 'active', 'paused'], 
        default: 'pending' 
    },
    createdAt: Number,
    settings: {
        paymentProviders: [String],
        shippingZones: [ShippingZoneSchema]
    }
});

// Product Variant Schema
const ProductVariantSchema = new mongoose.Schema({
    id: String,
    title: String,
    sku: String,
    price: Number,
    inventoryQuantity: Number,
    options: mongoose.Schema.Types.Mixed
});

// Product Draft Schema
const ProductDraftSchema = new mongoose.Schema({
    id: String,
    sourceUrl: String,
    sourcePlatform: { 
        type: String, 
        enum: ['aliexpress', 'amazon', 'alibaba', 'other'] 
    },
    scrapedAt: Number,
    status: { 
        type: String, 
        enum: ['scraped', 'optimized', 'approved', 'published', 'rejected'], 
        default: 'scraped' 
    },
    originalData: {
        title: String,
        description: String,
        images: [String],
        variants: [ProductVariantSchema],
        specs: mongoose.Schema.Types.Mixed,
        originalPrice: Number,
        currency: String
    },
    optimizedData: {
        title: String,
        description: String,
        seoTitle: String,
        seoDescription: String,
        tags: [String],
        collections: [String]
    },
    finalData: {
        title: String,
        description: String,
        price: Number,
        compareAtPrice: Number,
        profitMargin: Number,
        images: [String],
        variants: [ProductVariantSchema],
        tags: [String],
        collections: [String]
    },
    shopifyProductId: String,
    publishedAt: Number
});

// AI Insight Schema
const AIInsightSchema = new mongoose.Schema({
    id: String,
    type: { 
        type: String, 
        enum: ['positive', 'negative', 'neutral', 'action_required'] 
    },
    title: String,
    description: String,
    metric: String,
    change: Number,
    suggestedAction: String,
    priority: { 
        type: String, 
        enum: ['high', 'medium', 'low'] 
    }
});

// Analytics Snapshot Schema
const AnalyticsSnapshotSchema = new mongoose.Schema({
    id: String,
    timestamp: Number,
    period: { 
        type: String, 
        enum: ['daily', 'weekly', 'monthly'] 
    },
    revenue: Number,
    orders: Number,
    conversionRate: Number,
    averageOrderValue: Number,
    traffic: {
        total: Number,
        organic: Number,
        paid: Number,
        social: Number,
        direct: Number
    },
    topProducts: [{
        productId: String,
        title: String,
        revenue: Number,
        units: Number
    }],
    underperformingProducts: [{
        productId: String,
        title: String,
        views: Number,
        conversionRate: Number
    }],
    cartAbandonment: {
        rate: Number,
        recoveredRevenue: Number,
        abandonedCarts: Number
    },
    insights: [AIInsightSchema]
});

// Email Campaign Draft Schema
const EmailCampaignDraftSchema = new mongoose.Schema({
    id: String,
    type: { 
        type: String, 
        enum: ['launch', 'abandoned_cart', 'promo', 'newsletter', 'welcome', 'win_back'] 
    },
    status: { 
        type: String, 
        enum: ['draft', 'preview', 'approved', 'scheduled', 'sent'], 
        default: 'draft' 
    },
    createdAt: Number,
    subject: String,
    preheader: String,
    htmlContent: String,
    plainTextContent: String,
    segmentId: String,
    segmentName: String,
    recipientCount: Number,
    scheduledAt: Number,
    sentAt: Number,
    metrics: {
        sent: Number,
        delivered: Number,
        opened: Number,
        clicked: Number,
        unsubscribed: Number,
        revenue: Number
    }
});

// Social Content Draft Schema
const SocialContentDraftSchema = new mongoose.Schema({
    id: String,
    platform: { 
        type: String, 
        enum: ['tiktok', 'instagram', 'facebook', 'youtube'] 
    },
    contentType: { 
        type: String, 
        enum: ['post', 'story', 'reel', 'short', 'video'] 
    },
    status: { 
        type: String, 
        enum: ['draft', 'preview', 'approved', 'scheduled', 'published'], 
        default: 'draft' 
    },
    createdAt: Number,
    caption: String,
    hashtags: [String],
    mediaUrls: [String],
    videoScript: String,
    linkedProductId: String,
    scheduledAt: Number,
    publishedAt: Number,
    metrics: {
        views: Number,
        likes: Number,
        comments: Number,
        shares: Number,
        clicks: Number
    }
});

// AI Action Log Schema
const AIActionLogSchema = new mongoose.Schema({
    id: String,
    timestamp: Number,
    agentType: { 
        type: String, 
        enum: ['shopify_setup', 'product_ingestion', 'analytics', 'email_marketing', 'social_media'] 
    },
    actionType: { 
        type: String, 
        enum: ['suggest', 'read_only', 'execute_with_approval', 'auto_execute'] 
    },
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected', 'executed', 'failed'], 
        default: 'pending' 
    },
    title: String,
    description: String,
    payload: mongoose.Schema.Types.Mixed,
    requiresApproval: Boolean,
    approvedAt: Number,
    approvedBy: String,
    rejectedAt: Number,
    rejectedReason: String,
    executedAt: Number,
    result: mongoose.Schema.Types.Mixed,
    error: String,
    isReversible: Boolean,
    reversedAt: Number
});

// Agent Suggestion Schema
const AgentSuggestionSchema = new mongoose.Schema({
    id: String,
    timestamp: Number,
    agentType: String,
    title: String,
    description: String,
    reasoning: String,
    priority: { 
        type: String, 
        enum: ['high', 'medium', 'low'] 
    },
    actionPayload: mongoose.Schema.Types.Mixed,
    estimatedImpact: String,
    status: { 
        type: String, 
        enum: ['pending', 'accepted', 'dismissed', 'snoozed'], 
        default: 'pending' 
    },
    snoozedUntil: Number
});

// Master Agent Context Schema
const MasterAgentContextSchema = new mongoose.Schema({
    userId: String,
    userPreferences: {
        communicationStyle: { 
            type: String, 
            enum: ['detailed', 'concise'], 
            default: 'detailed' 
        },
        autoApprove: [String],
        notificationFrequency: { 
            type: String, 
            enum: ['realtime', 'daily', 'weekly'], 
            default: 'daily' 
        }
    },
    totalActionsExecuted: { type: Number, default: 0 },
    successRate: { type: Number, default: 100 }
});

// ============================================
// USER SCHEMA - WITH EMAIL VERIFICATION & E-COMMERCE
// ============================================
const UserSchema = new mongoose.Schema({
    // Authentication
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    
    // EMAIL VERIFICATION FIELDS
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationCode: String,
    emailVerificationExpires: Number,
    passwordResetCode: String,
    passwordResetExpires: Number,
    passwordResetLastSent: Number,
    
    // Profile
    name: { type: String, default: 'Architect' },
    country: { type: String, default: 'Unknown' },
    createdAt: { type: Number, default: Date.now },
    privacyAccepted: { type: Boolean, default: false },
    
    // Game State
    credits: { type: Number, default: 100 },
    realMoneyBalance: { type: Number, default: 0.0 },
    streak: { type: Number, default: 0 },
    currentDay: { type: Number, default: 1 },
    isPremium: { type: Boolean, default: false },
    activePlanId: { type: String, default: 'free' },
    maxGoalSlots: { type: Number, default: 3 },
    userProfile: { type: String, default: '' },
    lastCheckInDate: Number,
    
    // Goals & Tasks
    goal: GoalSchema,
    allGoals: [GoalSchema],
    dailyTasks: [TaskSchema],
    
    // AdGem Integration
    adgemOffers: [AdgemOfferSchema],
    adgemTransactions: [AdgemTransactionSchema],
    adgemLastSync: Number,
    
    // Flexible Collections
    chatHistory: { type: Array, default: [] },
    friends: { type: Array, default: [] },
    connectedApps: { type: Array, default: [] },
    myCourses: { type: Array, default: [] },
    myProducts: { type: Array, default: [] },
    completedLessonIds: { type: Array, default: [] },
    extraLogs: { type: Array, default: [] },
    
    // Notifications & Alerts
    agentAlerts: { type: Array, default: [] },
    
    // Guide Conversations
    guideConversations: { type: Array, default: [] },
    
    // ============================================
    // E-COMMERCE AGENT FIELDS (NEW)
    // ============================================
    ecommerceGoal: EcommerceGoalSchema,
    shopifyStores: [ShopifyStoreSchema],
    productDrafts: [ProductDraftSchema],
    analyticsSnapshots: [AnalyticsSnapshotSchema],
    emailCampaignDrafts: [EmailCampaignDraftSchema],
    socialContentDrafts: [SocialContentDraftSchema],
    aiActionLogs: [AIActionLogSchema],
    connectedEcommerceAccounts: [ConnectedAccountSchema],
    agentSuggestions: [AgentSuggestionSchema],
    masterAgentContext: MasterAgentContextSchema
});

export const User = mongoose.model('User', UserSchema);
