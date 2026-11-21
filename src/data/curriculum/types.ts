export type EmotionMood = "idle" | "happy" | "talking" | "thinking" | "cheering" | "sleeping" | "excited";

export interface VocabCard {
  id: string;
  word: string;
  phonetic: string;
  phonicsSplit: string;
  zh: string;
  memoryTipZh: string;
  exampleEn: string;
  exampleZh: string;
  visualKey: string;
  accentColor: string;
}

export interface PhonicsItem {
  id: string;
  letter: string; // e.g. "S" or "CAT" for CVC
  lowercase?: string; // e.g. "s" for single-letter uppercase/lowercase pairing
  soundLabel: string; // e.g. "/s/" or "/k/-/æ/-/t/"
  mnemonicZh: string;
  mouthTipZh: string;
  confusableTipZh?: string; // e.g. b/d, p/q memory trick
  quizHintMask?: string; // e.g. "_at" / "_ite" to disambiguate C(/k/) vs K(/k/)
  blendParts?: string[]; // e.g. ["c", "a", "t"] for CVC blending interaction
  sampleWords: Array<{
    word: string;
    zh: string;
    highlight: string;
    visualKey: string;
  }>;
  isCvc?: boolean;
}

export interface SentencePattern {
  id: string;
  en: string;
  zh: string;
  tipZh: string;
}

export interface SuggestionChip {
  en: string;
  zh: string;
  icon: string;
}

export interface SceneGoal {
  id: string;
  titleZh: string;
  hintZh: string;
  targetExampleEn: string;
  keywords: string[];
}

export interface RoleplayScenario {
  sceneKey: string;
  sceneNameZh: string;
  npcName: string;
  npcRoleZh: string;
  introZh: string;
  openingEn: string;
  openingZh: string;
  openingSuggestions: SuggestionChip[];
  goals: SceneGoal[];
  goalReplies: Record<
    string,
    {
      englishReply: string;
      chineseHint: string;
      praise: string;
      emotion: EmotionMood;
      nextSuggestions: SuggestionChip[];
    }
  >;
  closingReply: {
    englishReply: string;
    chineseHint: string;
    praise: string;
  };
}

export interface UnitDef {
  id: string;
  order: number;
  levelId: "L0" | "L1" | "L2";
  titleZh: string;
  titleEn: string;
  subtitleZh: string;
  themeColor: string;
  badgeEmoji: string;
  phonicsLabel: string;
  parentTipZh?: string;
  vocab: VocabCard[];
  sentences: SentencePattern[];
  phonics: PhonicsItem[];
  roleplay: RoleplayScenario;
}

export interface LevelDef {
  id: "L0" | "L1" | "L2";
  nameZh: string;
  subtitleZh: string;
  ageHintZh: string;
  status: "active" | "upcoming";
  previewTopics: string[];
}
