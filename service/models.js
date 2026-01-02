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
// ADMOB REWARD TRANSACTION SCHEMA
// ============================================
const AdMobRewardTransactionSchema = new mongoose.Schema({
    transactionId: { type: String, required: true, index: true },
    adUnit: String,
    adNetwork: String,
    rewardType: { 
        type: String, 
        enum: ['credits', 'premium_time', 'streak_freeze', 'goal_slot', 'real_money', 'xp_boost', 'extra_task'],
        default: 'credits'
    },
    amount: { type: Number, default: 0 },
    rewardDetails: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    timestamp: { type: Number, default: Date.now },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'completed'
    },
    ipAddress: String,
    userAgent: String
});

// ============================================
// WALLET TRANSACTION SCHEMA
// ============================================
const WalletTransactionSchema = new mongoose.Schema({
    id: String,
    date: { type: Number, default: Date.now },
    amount: Number,
    type: { 
        type: String, 
        enum: ['deposit', 'withdrawal', 'earning', 'redemption', 'ad_reward', 'referral', 'bonus'],
        default: 'earning'
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'completed'
    },
    description: String,
    reference: String
});

// ============================================
// GUIDE CONVERSATION SCHEMA
// ============================================
const JourneyStepSchema = new mongoose.Schema({
    id: String,
    title: String,
    content: String,
    position: {
        lat: Number,
        lng: Number
    },
    isActive: Boolean,
    isCompleted: Boolean
});

const ChatMessageSchema = new mongoose.Schema({
    id: String,
    role: { type: String, enum: ['user', 'model', 'ai'] },
    text: String,
    timestamp: Number,
    attachment: {
        type: { type: String, enum: ['image', 'pdf', 'audio'] },
        mimeType: String,
        data: String
    }
});

const GuideConversationSchema = new mongoose.Schema({
    id: String,
    name: String,
    createdAt: { type: Number, default: Date.now },
    messages: [ChatMessageSchema],
    journeySteps: [JourneyStepSchema]
});

// ============================================
// CONNECTED APP SCHEMA (Legacy - for metrics tracking)
// ============================================
const LiveMetricSchema = new mongoose.Schema({
    id: String,
    name: String,
    value: Number,
    unit: String,
    threshold: Number,
    condition: { type: String, enum: ['lt', 'gt'] },
    status: { type: String, enum: ['good', 'warning', 'critical'] },
    history: [Number]
});

const ConnectedAppSchema = new mongoose.Schema({
    id: String,
    name: String,
    icon: String,
    isConnected: { type: Boolean, default: false },
    allowedCategories: [String],
    metrics: [LiveMetricSchema],
    accessToken: String,
    refreshToken: String,
    tokenExpiry: Number,
    lastSync: Number
});

// ============================================
// CONNECTED OAUTH ACCOUNT SCHEMA (NEW - for OAuth integrations)
// ============================================
const ConnectedOAuthAccountSchema = new mongoose.Schema({
    platform: {
        type: String,
        required: true,
        enum: [
            // E-commerce
            'shopify', 'woocommerce', 'bigcommerce', 'etsy', 'amazon_seller',
            // Email Marketing
            'klaviyo', 'mailchimp', 'sendgrid', 'constant_contact', 'convertkit',
            // Social Media
            'tiktok', 'meta', 'instagram', 'facebook', 'twitter', 'pinterest', 'linkedin', 'youtube', 'snapchat', 'reddit',
            // Productivity
            'notion', 'slack', 'discord', 'trello', 'asana', 'todoist', 'monday', 'clickup', 'airtable',
            // Google Services
            'google', 'google_analytics', 'google_ads', 'google_fit', 'google_calendar', 'gmail',
            // Fitness & Health
            'fitbit', 'strava', 'withings', 'oura', 'whoop', 'garmin', 'myfitnesspal', 'peloton',
            // Finance & Payments
            'stripe', 'paypal', 'square', 'quickbooks', 'xero', 'wave', 'freshbooks', 'plaid',
            // Investment
            'coinbase', 'robinhood', 'etrade', 'fidelity', 'schwab',
            // CRM & Sales
            'hubspot', 'salesforce', 'pipedrive', 'zoho', 'intercom', 'zendesk',
            // Cloud Storage
            'dropbox', 'google_drive', 'onedrive', 'box',
            // Communication
            'zoom', 'calendly', 'microsoft_teams', 'webex',
            // Development
            'github', 'gitlab', 'bitbucket', 'jira', 'linear',
            // Music & Media
            'spotify', 'apple_music', 'twitch',
            // Other
            'amazon', 'ebay', 'walmart', 'aliexpress', 'zapier', 'make', 'ifttt'
        ]
    },
    platformUserId: String,
    platformUsername: String,
    platformEmail: String,
    platformAvatar: String,
    accessToken: { type: String, select: false },
    refreshToken: { type: String, select: false },
    expiresAt: Number,
    tokenType: { type: String, default: 'Bearer' },
    scope: String,
    isConnected: { type: Boolean, default: true },
    connectedAt: { type: Number, default: Date.now },
    lastRefreshedAt: Number,
    lastUsedAt: Number,
    lastSyncAt: Number,
    syncEnabled: { type: Boolean, default: true },
    permissions: [String],
    metadata: mongoose.Schema.Types.Mixed,
    settings: {
        autoSync: { type: Boolean, default: true },
        syncFrequency: { type: String, enum: ['realtime', 'hourly', 'daily', 'weekly'], default: 'daily' },
        notifications: { type: Boolean, default: true }
    }
});

// ============================================
// AGENT ALERT SCHEMA
// ============================================
const AgentAlertSchema = new mongoose.Schema({
    id: String,
    timestamp: { type: Number, default: Date.now },
    appId: String,
    metricName: String,
    title: String,
    description: String,
    message: String,
    analysis: String,
    actions: [String],
    severity: { 
        type: String, 
        enum: ['high', 'medium', 'info', 'low'],
        default: 'info'
    },
    isRead: { type: Boolean, default: false },
    date: Number,
    actionLabel: String,
    actionLink: String
});

// ============================================
// FRIEND SCHEMA
// ============================================
const FriendSchema = new mongoose.Schema({
    id: String,
    name: String,
    avatar: String,
    streak: Number,
    lastActive: String,
    isChallenged: Boolean,
    goalTitle: String,
    progress: Number,
    email: String
});

// ============================================
// EARN TASK SCHEMA
// ============================================
const EarnTaskSchema = new mongoose.Schema({
    id: String,
    title: String,
    subtitle: String,
    reward: Number,
    icon: String,
    isCompleted: { type: Boolean, default: false },
    progress: { type: Number, default: 0 },
    maxProgress: { type: Number, default: 1 },
    type: String,
    lastCompletedAt: Number
});

// ============================================
// TODO ITEM SCHEMA
// ============================================
const TodoItemSchema = new mongoose.Schema({
    id: String,
    text: String,
    completed: { type: Boolean, default: false },
    createdAt: { type: Number, default: Date.now }
});

// ============================================
// EXTRA LOG SCHEMA
// ============================================
const ExtraLogSchema = new mongoose.Schema({
    id: String,
    timestamp: { type: Number, default: Date.now },
    text: String,
    goalId: String
});

// ============================================
// HISTORICAL DATA SCHEMA
// ============================================
const HistoricalDataSchema = new mongoose.Schema({
    date: Number,
    tasksCompleted: Number,
    tasksTotal: Number,
    mood: String,
    summary: String,
    chatSnapshot: [String]
});

// ============================================
// FUTURE REMINDER SCHEMA
// ============================================
const FutureReminderSchema = new mongoose.Schema({
    id: String,
    date: Number,
    text: String,
    isCompleted: { type: Boolean, default: false }
});

// ============================================
// E-COMMERCE STORE SCHEMA (For Master Agent)
// ============================================
const EcommerceStoreSchema = new mongoose.Schema({
    id: String,
    platform: { type: String, default: 'shopify' },
    storeName: String,
    storeUrl: String,
    accessToken: String,
    isConnected: { type: Boolean, default: false },
    connectedAt: Number,
    settings: {
        currency: String,
        language: String,
        timezone: String
    },
    stats: {
        totalProducts: Number,
        totalOrders: Number,
        totalRevenue: Number,
        lastSync: Number
    }
});

// ============================================
// PRODUCT DRAFT SCHEMA (For E-commerce Agent)
// ============================================
const ProductDraftSchema = new mongoose.Schema({
    id: String,
    sourceUrl: String,
    sourcePlatform: String,
    originalData: {
        title: String,
        description: String,
        images: [String],
        variants: [mongoose.Schema.Types.Mixed],
        specs: mongoose.Schema.Types.Mixed,
        price: Number
    },
    optimizedData: {
        title: String,
        description: String,
        tags: [String],
        collections: [String],
        seoTitle: String,
        seoDescription: String
    },
    pricing: {
        cost: Number,
        sellingPrice: Number,
        profitMargin: Number
    },
    status: {
        type: String,
        enum: ['draft', 'pending_approval', 'approved', 'published', 'rejected'],
        default: 'draft'
    },
    createdAt: { type: Number, default: Date.now },
    publishedAt: Number,
    shopifyProductId: String
});

// ============================================
// AI ACTION LOG SCHEMA (For Master Agent)
// ============================================
const AIActionLogSchema = new mongoose.Schema({
    id: String,
    agentType: {
        type: String,
        enum: ['master', 'shopify', 'scraper', 'analytics', 'email', 'social'],
        default: 'master'
    },
    action: String,
    description: String,
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'requires_approval'],
        default: 'pending'
    },
    input: mongoose.Schema.Types.Mixed,
    output: mongoose.Schema.Types.Mixed,
    error: String,
    timestamp: { type: Number, default: Date.now },
    completedAt: Number,
    approvedAt: Number,
    approvedBy: String
});

// ============================================
// USER SCHEMA - COMPLETE
// ============================================
const UserSchema = new mongoose.Schema({
    // ========== AUTHENTICATION ==========
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    
    // ========== EMAIL VERIFICATION ==========
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationCode: String,
    emailVerificationExpires: Number,
    passwordResetCode: String,
    passwordResetExpires: Number,
    passwordResetLastSent: Number,
    
    // ========== PROFILE ==========
    name: { type: String, default: 'Architect' },
    country: { type: String, default: 'Unknown' },
    createdAt: { type: Number, default: Date.now },
    lastLoginAt: Number,
    privacyAccepted: { type: Boolean, default: false },
    avatarUrl: String,
    bio: String,
    
    // ========== GAME STATE ==========
    credits: { type: Number, default: 100 },
    realMoneyBalance: { type: Number, default: 0.0 },
    streak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    currentDay: { type: Number, default: 1 },
    totalXP: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    
    // ========== PREMIUM & SUBSCRIPTIONS ==========
    isPremium: { type: Boolean, default: false },
    premiumUntil: Date,
    activePlanId: { type: String, default: 'free' },
    subscriptionId: String,
    
    // ========== GOALS & TASKS ==========
    goal: GoalSchema,
    allGoals: [GoalSchema],
    dailyTasks: [TaskSchema],
    maxGoalSlots: { type: Number, default: 3 },
    userProfile: { type: String, default: '' },
    lastCheckInDate: Number,
    
    // ========== STREAK & FREEZES ==========
    streakFreezes: { type: Number, default: 0 },
    lastStreakUpdate: Number,
    
    // ========== ADMOB REWARDS ==========
    adRewardTransactions: [AdMobRewardTransactionSchema],
    totalAdsWatched: { type: Number, default: 0 },
    lastAdWatchedAt: Number,
    dailyAdCount: { type: Number, default: 0 },
    dailyAdCountResetAt: Number,
    
    // ========== ADGEM INTEGRATION ==========
    adgemOffers: [AdgemOfferSchema],
    adgemTransactions: [AdgemTransactionSchema],
    adgemLastSync: Number,
    
    // ========== WALLET & EARNINGS ==========
    earnings: [WalletTransactionSchema],
    totalEarnings: { type: Number, default: 0 },
    pendingWithdrawal: { type: Number, default: 0 },
    
    // ========== SOCIAL ==========
    friends: [FriendSchema],
    friendRequests: [{
        id: String,
        fromEmail: String,
        fromName: String,
        status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
        sentAt: Number
    }],
    referralCode: String,
    referredBy: String,
    referralCount: { type: Number, default: 0 },
    
    // ========== CHAT & GUIDE ==========
    chatHistory: [ChatMessageSchema],
    guideConversations: [GuideConversationSchema],
    
    // ========== CONNECTED APPS (Legacy) ==========
    connectedApps: [ConnectedAppSchema],
    
    // ========== CONNECTED OAUTH ACCOUNTS (NEW) ==========
    connectedAccounts: [ConnectedOAuthAccountSchema],
    
    // ========== NOTIFICATIONS & ALERTS ==========
    agentAlerts: [AgentAlertSchema],
    pushToken: String,
    notificationSettings: {
        dailyReminder: { type: Boolean, default: true },
        taskReminder: { type: Boolean, default: true },
        streakReminder: { type: Boolean, default: true },
        marketingEmails: { type: Boolean, default: false }
    },
    
    // ========== LEARNING & PROGRESS ==========
    completedLessonIds: [String],
    completedPhaseIds: [String],
    earnTasks: [EarnTaskSchema],
    todoList: [TodoItemSchema],
    extraLogs: [ExtraLogSchema],
    history: [HistoricalDataSchema],
    reminders: [FutureReminderSchema],
    
    // ========== MARKETPLACE ==========
    myCourses: [{ type: mongoose.Schema.Types.Mixed }],
    myProducts: [{ type: mongoose.Schema.Types.Mixed }],
    myVideos: [{ type: mongoose.Schema.Types.Mixed }],
    purchaseHistory: [{
        id: String,
        itemType: { type: String, enum: ['course', 'product', 'premium'] },
        itemId: String,
        amount: Number,
        currency: { type: String, enum: ['credits', 'usd'] },
        purchasedAt: Number
    }],
    
    // ========== E-COMMERCE (Master Agent) ==========
    ecommerceStores: [EcommerceStoreSchema],
    productDrafts: [ProductDraftSchema],
    aiActionLogs: [AIActionLogSchema],
    ecommerceGoal: {
        type: String,
        targetRevenue: Number,
        targetProducts: Number,
        niche: String,
        targetAudience: String,
        pricingStrategy: String
    },
    
    // ========== ANALYTICS SNAPSHOTS ==========
    analyticsSnapshots: [{
        id: String,
        date: Number,
        source: { type: String, enum: ['shopify', 'google', 'meta', 'tiktok'] },
        metrics: {
            revenue: Number,
            orders: Number,
            visitors: Number,
            conversionRate: Number,
            averageOrderValue: Number,
            topProducts: [String],
            cartAbandonment: Number
        }
    }],
    
    // ========== CONTENT DRAFTS (Social Media Agent) ==========
    contentDrafts: [{
        id: String,
        platform: { type: String, enum: ['tiktok', 'instagram', 'facebook', 'youtube', 'twitter', 'pinterest', 'linkedin'] },
        contentType: { type: String, enum: ['post', 'reel', 'story', 'video', 'short', 'tweet', 'pin'] },
        caption: String,
        hashtags: [String],
        mediaUrls: [String],
        scheduledFor: Number,
        status: { type: String, enum: ['draft', 'pending_approval', 'scheduled', 'published', 'failed'], default: 'draft' },
        createdAt: { type: Number, default: Date.now },
        publishedAt: Number,
        analytics: {
            views: Number,
            likes: Number,
            comments: Number,
            shares: Number,
            clicks: Number,
            engagement: Number
        }
    }],
    
    // ========== EMAIL CAMPAIGNS (Email Agent) ==========
    emailCampaigns: [{
        id: String,
        campaignType: { type: String, enum: ['welcome', 'abandoned_cart', 'promo', 'newsletter', 'custom', 'win_back', 'product_launch'] },
        subject: String,
        preheader: String,
        content: String,
        htmlContent: String,
        segment: String,
        segmentSize: Number,
        status: { type: String, enum: ['draft', 'pending_approval', 'scheduled', 'sending', 'sent', 'failed'], default: 'draft' },
        scheduledFor: Number,
        sentAt: Number,
        createdAt: { type: Number, default: Date.now },
        stats: {
            sent: Number,
            delivered: Number,
            opened: Number,
            clicked: Number,
            unsubscribed: Number,
            bounced: Number,
            revenue: Number
        }
    }],
    
    // ========== WEBHOOK SUBSCRIPTIONS ==========
    webhookSubscriptions: [{
        id: String,
        platform: String,
        eventType: String,
        webhookUrl: String,
        secret: String,
        isActive: { type: Boolean, default: true },
        createdAt: { type: Number, default: Date.now },
        lastTriggeredAt: Number
    }]
    
}, {
    timestamps: true,
    minimize: false
});

// ========== INDEXES ==========
UserSchema.index({ email: 1 });
UserSchema.index({ referralCode: 1 });
UserSchema.index({ 'adRewardTransactions.transactionId': 1 });
UserSchema.index({ 'connectedAccounts.platform': 1 });
UserSchema.index({ createdAt: -1 });

// ========== METHODS ==========
UserSchema.methods.addCredits = function(amount, description = 'Credit added') {
    this.credits = (this.credits || 0) + amount;
    this.earnings.push({
        id: `earn_${Date.now()}`,
        date: Date.now(),
        amount,
        type: 'earning',
        status: 'completed',
        description
    });
    return this.save();
};

UserSchema.methods.hasWatchedAdToday = function() {
    const today = new Date().setHours(0, 0, 0, 0);
    const resetAt = this.dailyAdCountResetAt || 0;
    
    if (resetAt < today) {
        this.dailyAdCount = 0;
        this.dailyAdCountResetAt = today;
    }
    
    return this.dailyAdCount;
};

UserSchema.methods.canWatchMoreAds = function(maxDaily = 10) {
    return this.hasWatchedAdToday() < maxDaily;
};

// Method to get connected account by platform
UserSchema.methods.getConnectedAccount = function(platform) {
    return this.connectedAccounts?.find(acc => acc.platform === platform && acc.isConnected);
};

// Method to check if platform is connected
UserSchema.methods.isPlatformConnected = function(platform) {
    const account = this.getConnectedAccount(platform);
    if (!account) return false;
    if (account.expiresAt && Date.now() > account.expiresAt) return false;
    return true;
};

// ========== EXPORT ==========
export const User = mongoose.model('User', UserSchema);
