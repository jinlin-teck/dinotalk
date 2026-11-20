import fs from "node:fs";
import path from "node:path";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  createBetterSqliteCompatClient,
  type BetterSqliteCompatClient,
} from "./node-sqlite-adapter";
import * as schema from "./schema";

type GlobalDbHolder = typeof globalThis & {
  __dinotalkSqlite?: BetterSqliteCompatClient;
  __dinotalkDrizzle?: BetterSQLite3Database<typeof schema>;
  __dinotalkDataDir?: string;
};

export function getDataDir(): string {
  const configured = process.env.DATA_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), "data");
}

export function getAudioCacheDir(): string {
  const dir = path.join(getDataDir(), "audio-cache");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function todayDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function bootstrapDatabase(sqlite: BetterSqliteCompatClient) {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS child_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL DEFAULT '小探险家',
      avatar_id TEXT NOT NULL DEFAULT 'dino-green',
      companion_name TEXT NOT NULL DEFAULT 'Dino',
      total_stars INTEGER NOT NULL DEFAULT 10,
      level INTEGER NOT NULL DEFAULT 1,
      pet_hunger INTEGER NOT NULL DEFAULT 80,
      pet_mood INTEGER NOT NULL DEFAULT 90,
      equipped_accessories_json TEXT NOT NULL DEFAULT '[]',
      owned_accessories_json TEXT NOT NULL DEFAULT '[]',
      daily_goal_minutes INTEGER NOT NULL DEFAULT 15,
      eye_care_minutes INTEGER NOT NULL DEFAULT 15,
      streak_days INTEGER NOT NULL DEFAULT 1,
      last_active_date TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      llm_provider TEXT NOT NULL DEFAULT 'deepseek',
      llm_base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com/v1',
      llm_api_key TEXT NOT NULL DEFAULT '',
      llm_model TEXT NOT NULL DEFAULT 'deepseek-chat',
      llm_temperature REAL NOT NULL DEFAULT 0.6,
      tts_engine TEXT NOT NULL DEFAULT 'edge',
      tts_voice_en TEXT NOT NULL DEFAULT 'en-US-AnaNeural',
      tts_voice_zh TEXT NOT NULL DEFAULT 'zh-CN-XiaoxiaoNeural',
      tts_speed REAL NOT NULL DEFAULT 0.85,
      tts_auto_play_zh INTEGER NOT NULL DEFAULT 1,
      tts_api_base_url TEXT NOT NULL DEFAULT '',
      tts_api_key TEXT NOT NULL DEFAULT '',
      tts_api_model TEXT NOT NULL DEFAULT 'tts-1',
      stt_engine TEXT NOT NULL DEFAULT 'browser',
      stt_api_base_url TEXT NOT NULL DEFAULT '',
      stt_api_key TEXT NOT NULL DEFAULT '',
      stt_api_model TEXT NOT NULL DEFAULT 'whisper-1',
      parent_pin TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS unit_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL DEFAULT 1,
      unit_id TEXT NOT NULL,
      story_done INTEGER NOT NULL DEFAULT 0,
      phonics_done INTEGER NOT NULL DEFAULT 0,
      game_done INTEGER NOT NULL DEFAULT 0,
      roleplay_done INTEGER NOT NULL DEFAULT 0,
      stars_earned INTEGER NOT NULL DEFAULT 0,
      best_game_score INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS unit_progress_profile_unit_idx
      ON unit_progress (profile_id, unit_id);

    CREATE TABLE IF NOT EXISTS word_mastery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL DEFAULT 1,
      item_key TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'word',
      unit_id TEXT NOT NULL,
      mastery_level INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      next_review_at TEXT NOT NULL,
      last_practiced_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS word_mastery_profile_item_idx
      ON word_mastery (profile_id, item_key);

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL DEFAULT 1,
      unit_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'roleplay',
      completed_goals_json TEXT NOT NULL DEFAULT '[]',
      summary_zh TEXT NOT NULL DEFAULT '',
      stars_earned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      english_text TEXT NOT NULL,
      chinese_text TEXT NOT NULL DEFAULT '',
      emotion TEXT NOT NULL DEFAULT 'happy',
      suggestions_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL DEFAULT 1,
      date_key TEXT NOT NULL,
      study_seconds INTEGER NOT NULL DEFAULT 0,
      activities_completed INTEGER NOT NULL DEFAULT 0,
      words_practiced INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS daily_logs_profile_date_idx
      ON daily_logs (profile_id, date_key);
  `);

  const now = new Date().toISOString();
  const today = todayDateKey();

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO child_profiles (
        id, nickname, avatar_id, companion_name, total_stars, level,
        pet_hunger, pet_mood, equipped_accessories_json, owned_accessories_json,
        daily_goal_minutes, eye_care_minutes, streak_days, last_active_date, created_at, updated_at
      ) VALUES (1, '小探险家', 'dino-green', 'Dino', 10, 1, 80, 90, '[]', '[]', 15, 15, 1, ?, ?, ?)`
    )
    .run(today, now, now);

  const envProvider = process.env.LLM_PROVIDER?.trim() || "deepseek";
  const envBaseUrl = process.env.LLM_BASE_URL?.trim() || "https://api.deepseek.com/v1";
  const envApiKey = process.env.LLM_API_KEY?.trim() || "";
  const envModel = process.env.LLM_MODEL?.trim() || "deepseek-chat";

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO app_settings (
        id, llm_provider, llm_base_url, llm_api_key, llm_model, llm_temperature,
        tts_engine, tts_voice_en, tts_voice_zh, tts_speed, tts_auto_play_zh,
        tts_api_base_url, tts_api_key, tts_api_model,
        stt_engine, stt_api_base_url, stt_api_key, stt_api_model,
        parent_pin, updated_at
      ) VALUES (1, ?, ?, ?, ?, 0.6, 'edge', 'en-US-AnaNeural', 'zh-CN-XiaoxiaoNeural', 0.85, 1, '', '', 'tts-1', 'browser', '', '', 'whisper-1', '', ?)`
    )
    .run(envProvider, envBaseUrl, envApiKey, envModel, now);
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  const g = globalThis as GlobalDbHolder;
  const dataDir = getDataDir();

  if (g.__dinotalkDrizzle && g.__dinotalkDataDir === dataDir) {
    return g.__dinotalkDrizzle;
  }

  if (g.__dinotalkSqlite) {
    try {
      g.__dinotalkSqlite.close();
    } catch {
      // ignore close errors during directory switches
    }
  }

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, "audio-cache"), { recursive: true });

  const dbPath = path.join(dataDir, "kids.db");
  const sqlite = createBetterSqliteCompatClient(dbPath);
  bootstrapDatabase(sqlite);

  const db = drizzle(sqlite as never, { schema });
  g.__dinotalkSqlite = sqlite;
  g.__dinotalkDrizzle = db;
  g.__dinotalkDataDir = dataDir;
  return db;
}
