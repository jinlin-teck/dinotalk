import type { SttEngine, TtsEngine } from "@/lib/speech/constants";

export interface SerializedProfile {
  id: number;
  nickname: string;
  avatarId: string;
  companionName: string;
  totalStars: number;
  level: number;
  petHunger: number;
  petMood: number;
  equippedAccessoriesJson: string;
  ownedAccessoriesJson: string;
  equippedAccessories: string[];
  ownedAccessories: string[];
  ownedSkinIds: string[];
  dailyGoalMinutes: number;
  eyeCareMinutes: number;
  streakDays: number;
  lastActiveDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProfileSummary {
  id: number;
  nickname: string;
  avatarId: string;
  companionName: string;
  totalStars: number;
  level: number;
  streakDays: number;
  equippedAccessories: string[];
  lastActiveDate: string;
}

export interface ParentManagedProfile extends SerializedProfile {
  completedUnitsCount: number;
  totalUnitStars: number;
  masteredItemCount: number;
  totalStudyMinutes: number;
}

export interface UnitProgressRow {
  id?: number;
  profileId?: number;
  unitId: string;
  storyDone: number;
  phonicsDone: number;
  gameDone: number;
  roleplayDone: number;
  starsEarned: number;
  bestGameScore?: number;
  updatedAt?: string;
}

export interface SanitizedSettings {
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKeyMasked: string;
  hasLlmApiKey: boolean;
  isLlmReady: boolean;
  llmModel: string;
  llmTemperature: number;
  ttsEngine: TtsEngine;
  ttsVoiceEn: string;
  ttsVoiceZh: string;
  ttsSpeed: number;
  ttsAutoPlayZh: boolean;
  ttsApiBaseUrl: string;
  ttsApiKeyMasked: string;
  hasTtsApiKey: boolean;
  ttsApiModel: string;
  sttEngine: SttEngine;
  sttApiBaseUrl: string;
  sttApiKeyMasked: string;
  hasSttApiKey: boolean;
  sttApiModel: string;
  hasParentPin: boolean;
  updatedAt: string;
}

export type CurriculumItemType = "word" | "phonics" | "sentence";
export type ReviewQuestionMode = "listen_read" | "blind_listen" | "speak_card";

export interface UnlockedAccessoryNotice {
  id: string;
  nameZh: string;
  emoji: string;
  descZh: string;
}

export interface TodayLogSummary {
  dateKey: string;
  studySeconds: number;
  activitiesCompleted: number;
  wordsPracticed: number;
}

export interface ReportData {
  profile: {
    id: number;
    nickname: string;
    companionName: string;
    totalStars: number;
    level: number;
    streakDays: number;
    dailyGoalMinutes: number;
    eyeCareMinutes: number;
  } | null;
  last7Days: Array<{
    dateKey: string;
    label: string;
    studyMinutes: number;
    activitiesCompleted: number;
    wordsPracticed: number;
  }>;
  unitSummary: Array<{
    unitId: string;
    order: number;
    titleZh: string;
    badgeEmoji: string;
    storyDone: boolean;
    phonicsDone: boolean;
    gameDone: boolean;
    roleplayDone: boolean;
    starsEarned: number;
  }>;
  wordStats: Array<{
    itemKey: string;
    itemType: string;
    unitId: string;
    label: string;
    zh: string;
    masteryLevel: number;
    correctCount: number;
    wrongCount: number;
    isDue?: boolean;
    needsAttention?: boolean;
  }>;
  parentTips?: Array<{
    unitId: string;
    unitTitleZh: string;
    badgeEmoji: string;
    tipZh: string;
    sampleEn: string;
    sampleZh: string;
  }>;
  recentSessions: Array<{
    id: number;
    unitId: string;
    mode: string;
    summaryZh: string;
    starsEarned: number;
    createdAt: string;
    messages: Array<{
      id: number;
      role: string;
      englishText: string;
      chineseText: string;
    }>;
  }>;
}

export interface EnrichedReviewItem {
  itemKey: string;
  itemType: CurriculumItemType;
  unitId: string;
  unitTitleZh: string;
  displayText: string;
  audioText?: string;
  subText: string;
  zh: string;
  visualKey: string;
  masteryLevel: number;
  questionMode?: ReviewQuestionMode;
  distractors: Array<{ text: string; zh: string; visualKey: string }>;
}
