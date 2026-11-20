import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";

export const childProfiles = sqliteTable("child_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nickname: text("nickname").notNull().default("小探险家"),
  avatarId: text("avatar_id").notNull().default("dino-green"),
  companionName: text("companion_name").notNull().default("Dino"),
  totalStars: integer("total_stars").notNull().default(10),
  level: integer("level").notNull().default(1),
  petHunger: integer("pet_hunger").notNull().default(80),
  petMood: integer("pet_mood").notNull().default(90),
  equippedAccessoriesJson: text("equipped_accessories_json").notNull().default("[]"),
  ownedAccessoriesJson: text("owned_accessories_json").notNull().default("[]"),
  dailyGoalMinutes: integer("daily_goal_minutes").notNull().default(15),
  eyeCareMinutes: integer("eye_care_minutes").notNull().default(15),
  streakDays: integer("streak_days").notNull().default(1),
  lastActiveDate: text("last_active_date").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  llmProvider: text("llm_provider").notNull().default("deepseek"),
  llmBaseUrl: text("llm_base_url").notNull().default("https://api.deepseek.com/v1"),
  llmApiKey: text("llm_api_key").notNull().default(""),
  llmModel: text("llm_model").notNull().default("deepseek-chat"),
  llmTemperature: real("llm_temperature").notNull().default(0.6),
  ttsEngine: text("tts_engine").notNull().default("edge"), // 'edge' | 'openai' | 'browser'
  ttsVoiceEn: text("tts_voice_en").notNull().default("en-US-AnaNeural"),
  ttsVoiceZh: text("tts_voice_zh").notNull().default("zh-CN-XiaoxiaoNeural"),
  ttsSpeed: real("tts_speed").notNull().default(0.85),
  ttsAutoPlayZh: integer("tts_auto_play_zh").notNull().default(1),
  ttsApiBaseUrl: text("tts_api_base_url").notNull().default(""),
  ttsApiKey: text("tts_api_key").notNull().default(""),
  ttsApiModel: text("tts_api_model").notNull().default("tts-1"),
  sttEngine: text("stt_engine").notNull().default("browser"), // 'browser' | 'openai' | 'minimax'
  sttApiBaseUrl: text("stt_api_base_url").notNull().default(""),
  sttApiKey: text("stt_api_key").notNull().default(""),
  sttApiModel: text("stt_api_model").notNull().default("whisper-1"),
  parentPin: text("parent_pin").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const unitProgress = sqliteTable(
  "unit_progress",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id").notNull().default(1),
    unitId: text("unit_id").notNull(),
    storyDone: integer("story_done").notNull().default(0),
    phonicsDone: integer("phonics_done").notNull().default(0),
    gameDone: integer("game_done").notNull().default(0),
    roleplayDone: integer("roleplay_done").notNull().default(0),
    starsEarned: integer("stars_earned").notNull().default(0),
    bestGameScore: integer("best_game_score").notNull().default(0),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("unit_progress_profile_unit_idx").on(table.profileId, table.unitId),
  ]
);

export const wordMastery = sqliteTable(
  "word_mastery",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id").notNull().default(1),
    itemKey: text("item_key").notNull(),
    itemType: text("item_type").notNull().default("word"), // 'word' | 'phonics'
    unitId: text("unit_id").notNull(),
    masteryLevel: integer("mastery_level").notNull().default(0), // 0..5
    correctCount: integer("correct_count").notNull().default(0),
    wrongCount: integer("wrong_count").notNull().default(0),
    nextReviewAt: text("next_review_at").notNull(),
    lastPracticedAt: text("last_practiced_at").notNull(),
  },
  (table) => [
    uniqueIndex("word_mastery_profile_item_idx").on(table.profileId, table.itemKey),
  ]
);

export const chatSessions = sqliteTable("chat_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id").notNull().default(1),
  unitId: text("unit_id").notNull(),
  mode: text("mode").notNull().default("roleplay"), // 'roleplay' | 'freetalk'
  completedGoalsJson: text("completed_goals_json").notNull().default("[]"),
  summaryZh: text("summary_zh").notNull().default(""),
  starsEarned: integer("stars_earned").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  role: text("role").notNull(), // 'assistant' | 'user'
  englishText: text("english_text").notNull(),
  chineseText: text("chinese_text").notNull().default(""),
  emotion: text("emotion").notNull().default("happy"),
  suggestionsJson: text("suggestions_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
});

export const dailyLogs = sqliteTable(
  "daily_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id").notNull().default(1),
    dateKey: text("date_key").notNull(), // 'YYYY-MM-DD'
    studySeconds: integer("study_seconds").notNull().default(0),
    activitiesCompleted: integer("activities_completed").notNull().default(0),
    wordsPracticed: integer("words_practiced").notNull().default(0),
  },
  (table) => [
    uniqueIndex("daily_logs_profile_date_idx").on(table.profileId, table.dateKey),
  ]
);

export type ChildProfile = typeof childProfiles.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type UnitProgress = typeof unitProgress.$inferSelect;
export type WordMastery = typeof wordMastery.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type DailyLog = typeof dailyLogs.$inferSelect;
