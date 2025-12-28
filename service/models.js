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
// USER SCHEMA
// ============================================
const UserSchema = new mongoose.Schema({
    // Authentication
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    
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
    adgemTransactions: [AdgemTransactionSchema],
    
    // Flexible Collections
    chatHistory: { type: Array, default: [] },
    friends: { type: Array, default: [] },
    connectedApps: { type: Array, default: [] },
    myCourses: { type: Array, default: [] },
    myProducts: { type: Array, default: [] },
    completedLessonIds: { type: Array, default: [] },
    
    // Notifications & Alerts
    agentAlerts: { type: Array, default: [] }
});

export const User = mongoose.model('User', UserSchema);
