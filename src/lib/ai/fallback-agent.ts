import { getAllVocab, type IndexedVocabCard } from "@/data/curriculum";
import type { EmotionMood, SuggestionChip, UnitDef } from "@/data/curriculum/types";

export interface TutorResponse {
  englishReply: string;
  chineseHint: string;
  emotion: EmotionMood;
  praise: string;
  completedGoalIds: string[];
  nextSuggestions: SuggestionChip[];
  masteredWords: string[];
  isSceneComplete: boolean;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeEnglishWord(normalizedText: string, word: string): boolean {
  const cleanWord = word.trim().toLowerCase();
  if (!cleanWord) return false;
  const pattern = new RegExp(`(?:^|\\s)${escapeRegex(cleanWord)}(?:$|\\s)`);
  return pattern.test(normalizedText);
}

function normalizeInput(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]s\b/g, " is")
    .replace(/i['’]m/g, "i am")
    .replace(/[^a-z0-9\u4e00-\u9fa5\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectMatchingWords(unit: UnitDef, normalizedInput: string): string[] {
  const matched: string[] = [];
  for (const card of unit.vocab) {
    if (containsWholeEnglishWord(normalizedInput, card.word)) {
      matched.push(card.word);
    }
  }
  return matched;
}

export function runFallbackRoleplayTurn(
  unit: UnitDef,
  userText: string,
  alreadyCompletedGoalIds: string[]
): TutorResponse {
  const norm = normalizeInput(userText);
  const completedSet = new Set(
    alreadyCompletedGoalIds.filter((id) => unit.roleplay.goals.some((g) => g.id === id))
  );
  const matchedWords = detectMatchingWords(unit, norm);

  let newlyCompletedGoalId: string | null = null;
  for (const goal of unit.roleplay.goals) {
    if (completedSet.has(goal.id)) continue;
    const hit = goal.keywords.some((kw) => norm.includes(kw.toLowerCase()));
    if (hit) {
      newlyCompletedGoalId = goal.id;
      completedSet.add(goal.id);
      break;
    }
  }

  const remainingGoals = unit.roleplay.goals.filter((g) => !completedSet.has(g.id));
  const completedArr = unit.roleplay.goals
    .filter((g) => completedSet.has(g.id))
    .map((g) => g.id);

  if (completedArr.length >= unit.roleplay.goals.length) {
    return {
      englishReply: unit.roleplay.closingReply.englishReply,
      chineseHint: unit.roleplay.closingReply.chineseHint,
      emotion: "cheering",
      praise: unit.roleplay.closingReply.praise,
      completedGoalIds: completedArr,
      nextSuggestions: [
        { en: "Thank you, Dino!", zh: "谢谢小恐龙！", icon: "🌟" },
        { en: "Bye-bye!", zh: "再见！", icon: "👋" },
      ],
      masteredWords: matchedWords,
      isSceneComplete: true,
    };
  }

  if (newlyCompletedGoalId && unit.roleplay.goalReplies[newlyCompletedGoalId]) {
    const reply = unit.roleplay.goalReplies[newlyCompletedGoalId];
    return {
      englishReply: reply.englishReply,
      chineseHint: reply.chineseHint,
      emotion: reply.emotion,
      praise: reply.praise,
      completedGoalIds: completedArr,
      nextSuggestions: reply.nextSuggestions,
      masteredWords: matchedWords,
      isSceneComplete: false,
    };
  }

  const nextGoal = remainingGoals[0] ?? unit.roleplay.goals[0];
  const fallbackChips: SuggestionChip[] = [
    {
      en: nextGoal.targetExampleEn,
      zh: `试试说：${nextGoal.titleZh}`,
      icon: "💬",
    },
    ...(unit.roleplay.openingSuggestions.slice(0, 1)),
  ];

  return {
    englishReply: `Good try! Let's say: ${nextGoal.targetExampleEn}`,
    chineseHint: `勇敢开口真棒！当前小任务「${nextGoal.titleZh}」：${nextGoal.hintZh}`,
    emotion: "talking",
    praise: "敢于开口就是最棒的小探险家！",
    completedGoalIds: completedArr,
    nextSuggestions: fallbackChips,
    masteredWords: matchedWords,
    isSceneComplete: false,
  };
}

function getZhTokens(zh: string): string[] {
  return zh
    .split(/[\s\/、，,()（）]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 1);
}

function buildVocabLookupReply(item: IndexedVocabCard): TutorResponse {
  return {
    englishReply: `It is "${item.word}"! ${item.exampleEn}`,
    chineseHint: `“${item.zh}”用英语说是 ${item.word}（${item.phonetic}）！例句：${item.exampleEn}（${item.exampleZh}）`,
    emotion: "excited",
    praise: "好爱问问题的小朋友！点小喇叭听听看吧~",
    completedGoalIds: [],
    nextSuggestions: [
      { en: item.exampleEn, zh: `跟读：${item.exampleZh}`, icon: "🔊" },
      { en: "Give me another riddle!", zh: "考我一个谜语！", icon: "🎲" },
    ],
    masteredWords: [item.word],
    isSceneComplete: false,
  };
}

function extractExplicitWordQuery(raw: string): string | null {
  const patterns = [
    /^(?:请问)?(.+?)(?:用?英语|用?英文)(?:怎么|如何)说[？?！!。.~ ]*$/,
    /^(?:请问)?(.+?)(?:的英文|的英语)是(?:什么|啥)[？?！!。.~ ]*$/,
    /^(?:how to say|what is)\s+(.+?)(?:\s+in english)?[？?！!。.~ ]*$/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m && m[1]) {
      return m[1].trim().replace(/^[“"'「]+|[”"'」]+$/g, "");
    }
  }
  return null;
}

function findVocabByExplicitQuery(
  query: string,
  allVocab: IndexedVocabCard[]
): IndexedVocabCard | null {
  const normQuery = normalizeInput(query);
  // 1. Exact match on Chinese token or English word (supports 1-char queries like "九")
  for (const item of allVocab) {
    const tokens = getZhTokens(item.zh);
    if (tokens.some((t) => t === query) || item.word.toLowerCase() === normQuery) {
      return item;
    }
  }
  // 2. Multi-character Chinese token containment sorted by longest token first
  const candidates: Array<{ item: IndexedVocabCard; len: number }> = [];
  for (const item of allVocab) {
    for (const token of getZhTokens(item.zh)) {
      if (token.length >= 2 && query.includes(token)) {
        candidates.push({ item, len: token.length });
      }
    }
  }
  candidates.sort((a, b) => b.len - a.len);
  return candidates[0]?.item ?? null;
}

export function runFallbackFreeTalkTurn(userText: string): TutorResponse {
  const raw = userText.trim();
  const norm = normalizeInput(raw);
  const allVocab = getAllVocab();

  // 1. Explicit "XX用英语怎么说？" word lookup queries
  const explicitQuery = extractExplicitWordQuery(raw);
  if (explicitQuery) {
    const found = findVocabByExplicitQuery(explicitQuery, allVocab);
    if (found) {
      return buildVocabLookupReply(found);
    }
  }

  // 2. Explicit activity intents (riddle / story / greeting) before general vocab fallback
  if (containsWholeEnglishWord(norm, "riddle") || raw.includes("猜") || raw.includes("谜")) {
    return {
      englishReply: "Riddle time! It is yellow and sweet. Monkeys love it! What fruit is it?",
      chineseHint: "来猜猜看：它是黄色的，弯弯的甜甜的，小猴子最爱吃！是什么水果呀？",
      emotion: "thinking",
      praise: "猜谜语开始咯！",
      completedGoalIds: [],
      nextSuggestions: [
        { en: "It's a banana!", zh: "是香蕉 banana！", icon: "🍌" },
        { en: "It's an apple!", zh: "是苹果 apple！", icon: "🍎" },
      ],
      masteredWords: [],
      isSceneComplete: false,
    };
  }

  if (
    containsWholeEnglishWord(norm, "story") ||
    norm.includes("tell me more") ||
    raw.includes("故事")
  ) {
    return {
      englishReply:
        "One sunny day, Dino meets a cute rabbit. They share a sweet cake and feel so happy!",
      chineseHint:
        "故事续集：晴朗的一天，Dino 遇见了一只可爱的小兔子，它们一起分享甜蛋糕，开心极啦！",
      emotion: "happy",
      praise: "爱听英文故事磨耳朵太棒了！",
      completedGoalIds: [],
      nextSuggestions: [
        { en: "Let's share!", zh: "我们一起分享！", icon: "🎂" },
        { en: "I am happy!", zh: "我好开心！", icon: "😄" },
      ],
      masteredWords: ["sunny", "rabbit", "cake", "happy"],
      isSceneComplete: false,
    };
  }

  if (
    containsWholeEnglishWord(norm, "hello") ||
    containsWholeEnglishWord(norm, "hi") ||
    /^(?:你好|嗨|哈喽|早上好)[！!。.~ ]*$/u.test(raw)
  ) {
    return {
      englishReply: "Hello, my super friend! How are you today?",
      chineseHint: "你好呀好朋友！今天感觉怎么样？可以说 I am happy! 哦~",
      emotion: "happy",
      praise: "问好真有礼貌！",
      completedGoalIds: [],
      nextSuggestions: [
        { en: "I am happy!", zh: "我很开心！", icon: "😄" },
        { en: "I like blue!", zh: "我喜欢蓝色！", icon: "🔵" },
      ],
      masteredWords: ["hello"],
      isSceneComplete: false,
    };
  }

  // 3. General vocab match (whole English words, or >=2-char Chinese tokens / exact 1-char input)
  const rawBare = raw.replace(/[？?！!。.~ ]+/g, "");
  const zhCandidates: Array<{ item: IndexedVocabCard; len: number }> = [];
  for (const item of allVocab) {
    if (containsWholeEnglishWord(norm, item.word)) {
      return buildVocabLookupReply(item);
    }
    for (const token of getZhTokens(item.zh)) {
      if (token.length >= 2 && raw.includes(token)) {
        zhCandidates.push({ item, len: token.length });
      } else if (token.length === 1 && rawBare === token) {
        zhCandidates.push({ item, len: 1 });
      }
    }
  }
  if (zhCandidates.length > 0) {
    zhCandidates.sort((a, b) => b.len - a.len);
    return buildVocabLookupReply(zhCandidates[0].item);
  }

  return {
    englishReply: "That is cool! You can ask me words, or say: I am happy!",
    chineseHint:
      "当前处于本地试玩伙伴模式（家长在「家长中心」填入大模型 Key 后即可解锁 Dino 无限自由对话哦！）。你可以试着问“太阳用英语怎么说？”",
    emotion: "talking",
    praise: "跟 Dino 聊天真开心！",
    completedGoalIds: [],
    nextSuggestions: [
      { en: "太阳用英语怎么说？", zh: "问“太阳”", icon: "☀️" },
      { en: "Give me another riddle!", zh: "玩动物猜谜！", icon: "🐼" },
      { en: "I am happy!", zh: "我很开心！", icon: "😄" },
    ],
    masteredWords: [],
    isSceneComplete: false,
  };
}
