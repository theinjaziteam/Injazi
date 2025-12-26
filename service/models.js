import mongoose from 'mongoose';

// --- Sub-Schemas for Tasks ---
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
  // --- BACKGROUND TIMER FIELDS ---
  timeLeft: { type: Number, default: 0 },
  lastUpdated: { type: Number, default: 0 },
  isTimerActive: { type: Boolean, default: false }
});

// --- Sub-Schemas for Goals ---
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
  savedCurriculum: [mongoose.Schema.Types.Mixed], 
  savedCourses: [mongoose.Schema.Types.Mixed],
  savedProducts: [mongoose.Schema.Types.Mixed],
  savedFeed: [mongoose.Schema.Types.Mixed],
  savedVideos: [mongoose.Schema.Types.Mixed]
});

// --- Main User Schema ---
const UserSchema = new mongoose.Schema({
  // Authentication
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
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

  // Data & Relations
  goal: GoalSchema,           
  allGoals: [GoalSchema],     
  dailyTasks: [TaskSchema],   

  // Flexible Collections
  chatHistory: [mongoose.Schema.Types.Mixed],
  friends: [mongoose.Schema.Types.Mixed],
  connectedApps: [mongoose.Schema.Types.Mixed],
  earnTasks: [mongoose.Schema.Types.Mixed],
  myCourses: [mongoose.Schema.Types.Mixed],
  myProducts: [mongoose.Schema.Types.Mixed]
});

export const User = mongoose.model('User', UserSchema);