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

export function personalizeSuggestionChips(
  chips: SuggestionChip[],
  childNickname?: string
): SuggestionChip[] {
  const cleanName = childNickname?.trim();
  if (!cleanName || cleanName === "小探险家") {
    return chips;
  }
  return chips.map((chip) => ({
    ...chip,
    en: chip.en.replace(/\b(?:Alex|Leo)\b/g, () => cleanName),
    zh: chip.zh.replace(/(?:Alex|Leo)/g, () => cleanName),
  }));
}

interface RiddleDef {
  id: string;
  promptEn: string;
  promptZh: string;
  answer: string;
  answerZh: string;
  keywords: string[];
  chips: SuggestionChip[];
}

const OFFLINE_RIDDLES: RiddleDef[] = [
  {
    id: "banana",
    promptEn: "Riddle time! It is yellow and sweet. Monkeys love it! What fruit is it?",
    promptZh: "来猜猜看：它是黄色的，弯弯的甜甜的，小猴子最爱吃！是什么水果呀？",
    answer: "banana",
    answerZh: "香蕉",
    keywords: ["banana", "bananas", "香蕉"],
    chips: [
      { en: "It's a banana!", zh: "是香蕉 banana！", icon: "🍌" },
      { en: "It's an apple!", zh: "是苹果 apple！", icon: "🍎" },
    ],
  },
  {
    id: "cat",
    promptEn: "Riddle time! It is small and cute. It says meow, meow! What animal is it?",
    promptZh: "猜谜时间：它小小的毛茸茸，会喵喵叫！是哪种小动物呀？",
    answer: "cat",
    answerZh: "小猫",
    keywords: ["cat", "cats", "小猫", "猫"],
    chips: [
      { en: "It's a cat!", zh: "是小猫 cat！", icon: "🐱" },
      { en: "It's a dog!", zh: "是小狗 dog！", icon: "🐶" },
    ],
  },
  {
    id: "sun",
    promptEn: "Riddle time! It is big, yellow, and hot in the sky. What is it?",
    promptZh: "猜谜时间：它大大的、黄黄的、热热的，每天挂在天上！它是什么？",
    answer: "sun",
    answerZh: "太阳",
    keywords: ["sun", "sunny", "太阳"],
    chips: [
      { en: "It's the sun!", zh: "是太阳 sun！", icon: "☀️" },
      { en: "It's a cloud!", zh: "是云朵 cloud！", icon: "☁️" },
    ],
  },
  {
    id: "elephant",
    promptEn: "Riddle time! It is very big and gray. It has a long nose! What animal is it?",
    promptZh: "猜谜时间：它超级大，有长长的鼻子和大扇子耳朵！它是谁？",
    answer: "elephant",
    answerZh: "大象",
    keywords: ["elephant", "elephants", "大象"],
    chips: [
      { en: "It's an elephant!", zh: "是大象 elephant！", icon: "🐘" },
      { en: "It's a tiger!", zh: "是老虎 tiger！", icon: "🐯" },
    ],
  },
  {
    id: "apple",
    promptEn: "Riddle time! It is round, red, and sweet. Crunch, crunch! What fruit is it?",
    promptZh: "猜谜时间：它圆圆的红红的，咬一口咔嚓脆甜！是什么水果？",
    answer: "apple",
    answerZh: "苹果",
    keywords: ["apple", "apples", "苹果"],
    chips: [
      { en: "It's an apple!", zh: "是苹果 apple！", icon: "🍎" },
      { en: "It's a pear!", zh: "是梨子 pear！", icon: "🍐" },
    ],
  },
  {
    id: "fish",
    promptEn: "Riddle time! It lives in water and can swim fast! What animal is it?",
    promptZh: "猜谜时间：它住在水里，吐着泡泡会游得飞快！它是哪种小动物？",
    answer: "fish",
    answerZh: "小鱼",
    keywords: ["fish", "小鱼", "鱼"],
    chips: [
      { en: "It's a fish!", zh: "是小鱼 fish！", icon: "🐟" },
      { en: "It's a bird!", zh: "是小鸟 bird！", icon: "🐦" },
    ],
  },
  {
    id: "rabbit",
    promptEn: "Riddle time! It is white with two long ears. It can jump! What animal is it?",
    promptZh: "猜谜时间：它白白的，长着两只长耳朵，最会蹦蹦跳！它是谁？",
    answer: "rabbit",
    answerZh: "小兔子",
    keywords: ["rabbit", "rabbits", "兔子"],
    chips: [
      { en: "It's a rabbit!", zh: "是兔子 rabbit！", icon: "🐰" },
      { en: "It's a panda!", zh: "是大熊猫 panda！", icon: "🐼" },
    ],
  },
  {
    id: "rainbow",
    promptEn: "Riddle time! It comes after rain. It has seven colors in the sky! What is it?",
    promptZh: "猜谜时间：下完雨后会出现在天空，有七种魔法颜色！它是什么？",
    answer: "rainbow",
    answerZh: "彩虹",
    keywords: ["rainbow", "彩虹"],
    chips: [
      { en: "It's a rainbow!", zh: "是彩虹 rainbow！", icon: "🌈" },
      { en: "It's a cloud!", zh: "是白云 cloud！", icon: "☁️" },
    ],
  },
  {
    id: "dog",
    promptEn: "Riddle time! It says woof, woof! It can run and loves its friend! What is it?",
    promptZh: "猜谜时间：它会汪汪叫、摇尾巴，跑得很快最喜欢好朋友！它是谁？",
    answer: "dog",
    answerZh: "小狗",
    keywords: ["dog", "dogs", "小狗", "狗"],
    chips: [
      { en: "It's a dog!", zh: "是小狗 dog！", icon: "🐶" },
      { en: "It's a cat!", zh: "是小猫 cat！", icon: "🐱" },
    ],
  },
  {
    id: "bird",
    promptEn: "Riddle time! It is small and can fly high in the blue sky! What is it?",
    promptZh: "猜谜时间：它小小的有翅膀，能在蓝天高高飞翔！是什么动物？",
    answer: "bird",
    answerZh: "小鸟",
    keywords: ["bird", "birds", "小鸟", "鸟"],
    chips: [
      { en: "It's a bird!", zh: "是小鸟 bird！", icon: "🐦" },
      { en: "It's a fish!", zh: "是小鱼 fish！", icon: "🐟" },
    ],
  },
  {
    id: "cake",
    promptEn: "Riddle time! We put candles on it and sing Happy Birthday! What food is it?",
    promptZh: "猜谜时间：过生日时我们会在它上面插蜡烛、唱生日歌！是什么美食？",
    answer: "cake",
    answerZh: "蛋糕",
    keywords: ["cake", "蛋糕"],
    chips: [
      { en: "It's a cake!", zh: "是蛋糕 cake！", icon: "🎂" },
      { en: "It's bread!", zh: "是面包 bread！", icon: "🍞" },
    ],
  },
  {
    id: "panda",
    promptEn: "Riddle time! It is black and white. It loves bamboo! What animal is it?",
    promptZh: "猜谜时间：它是黑白色的，有圆圆黑眼圈，最爱吃竹子！它是谁？",
    answer: "panda",
    answerZh: "大熊猫",
    keywords: ["panda", "pandas", "熊猫"],
    chips: [
      { en: "It's a panda!", zh: "是大熊猫 panda！", icon: "🐼" },
      { en: "It's a bear!", zh: "是小熊 bear！", icon: "🧸" },
    ],
  },
];

interface MiniStoryDef {
  englishReply: string;
  chineseHint: string;
  masteredWords: string[];
  chips: SuggestionChip[];
}

const OFFLINE_STORIES: MiniStoryDef[] = [
  {
    englishReply:
      "One sunny day, Dino meets a cute rabbit. They share a sweet cake and feel so happy!",
    chineseHint:
      "故事第 1 集：晴朗的一天，Dino 遇见了一只可爱的小兔子，它们一起分享甜蛋糕，开心极啦！",
    masteredWords: ["sunny", "rabbit", "cake", "happy"],
    chips: [
      { en: "Let's share!", zh: "我们一起分享！", icon: "🎂" },
      { en: "Tell me more!", zh: "听下一集故事！", icon: "📖" },
    ],
  },
  {
    englishReply:
      "Next, Dino and Rabbit see a blue bird. The bird can fly high over a big rainbow!",
    chineseHint:
      "故事第 2 集：接着，Dino 和小兔子看见一只蓝色小鸟，它飞高高穿过了大彩虹！",
    masteredWords: ["blue", "bird", "fly", "rainbow"],
    chips: [
      { en: "Birds can fly!", zh: "小鸟会飞！", icon: "🐦" },
      { en: "Tell me more!", zh: "继续听故事！", icon: "✨" },
    ],
  },
  {
    englishReply:
      "Then Dino is hungry! He goes to the fruit shop and says: Two red apples, please!",
    chineseHint:
      "故事第 3 集：Dino 肚子饿啦！它跑到水果店礼貌地说：请给我两个红苹果！",
    masteredWords: ["hungry", "two", "red", "apple"],
    chips: [
      { en: "Two red apples, please!", zh: "请给我两个红苹果！", icon: "🍎" },
      { en: "Tell me more!", zh: "继续听故事！", icon: "✨" },
    ],
  },
  {
    englishReply:
      "At the zoo, a black and white panda waves hello! A brown dog runs and jumps with them.",
    chineseHint:
      "故事第 4 集：在动物园里，黑白大熊猫挥手说你好！棕色小狗也跑来一起蹦蹦跳！",
    masteredWords: ["black", "white", "panda", "dog"],
    chips: [
      { en: "Hello, panda!", zh: "你好，大熊猫！", icon: "🐼" },
      { en: "Tell me more!", zh: "继续听故事！", icon: "✨" },
    ],
  },
  {
    englishReply:
      "Oh! It is windy now! Dino opens his toy box and flies a big yellow kite!",
    chineseHint:
      "故事第 5 集：呼呼刮风啦！Dino 打开玩具箱，放起一只大大的黄色风筝！",
    masteredWords: ["windy", "yellow", "kite"],
    chips: [
      { en: "Fly a kite!", zh: "放风筝！", icon: "🪁" },
      { en: "Tell me more!", zh: "听大结局！", icon: "🌟" },
    ],
  },
  {
    englishReply:
      "At home, Dino hugs Mom and Dad. I love my family! What a fun day!",
    chineseHint:
      "故事大结局：回到温暖的家，Dino 抱抱爸爸妈妈说“我爱我家”！真是快乐的一天！",
    masteredWords: ["mom", "dad", "fun"],
    chips: [
      { en: "I love my family!", zh: "我爱我的一家人！", icon: "🏠" },
      { en: "Give me another riddle!", zh: "换个猜谜玩！", icon: "🎲" },
    ],
  },
];

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
  alreadyCompletedGoalIds: string[],
  childNickname?: string
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
      nextSuggestions: personalizeSuggestionChips(reply.nextSuggestions, childNickname),
      masteredWords: matchedWords,
      isSceneComplete: false,
    };
  }

  const nextGoal = remainingGoals[0] ?? unit.roleplay.goals[0];
  const fallbackChips: SuggestionChip[] = personalizeSuggestionChips(
    [
      {
        en: nextGoal.targetExampleEn,
        zh: `试试说：${nextGoal.titleZh}`,
        icon: "💬",
      },
      ...unit.roleplay.openingSuggestions.slice(0, 1),
    ],
    childNickname
  );

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

function riddleSignature(r: RiddleDef): string {
  return r.promptEn.replace(/^Riddle time!\s*/i, "").toLowerCase().slice(0, 28);
}

function findActiveRiddleFromHistory(
  history: Array<{ role: "assistant" | "user"; englishText: string }>
): RiddleDef | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== "assistant") continue;
    const lower = msg.englishText.toLowerCase();
    if (!lower.includes("riddle")) return null;
    const matched = OFFLINE_RIDDLES.find(
      (r) =>
        lower.includes(riddleSignature(r)) ||
        (r.id === "panda" && lower.includes("black and white") && lower.includes("bamboo"))
    );
    return matched ?? null;
  }
  return null;
}

export function runFallbackFreeTalkTurn(
  userText: string,
  history: Array<{ role: "assistant" | "user"; englishText: string }> = []
): TutorResponse {
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

  const wantsNewRiddle =
    containsWholeEnglishWord(norm, "riddle") ||
    raw.includes("再猜") ||
    raw.includes("换一个") ||
    raw.includes("下一个") ||
    raw.includes("猜") ||
    raw.includes("谜");
  const wantsStory =
    containsWholeEnglishWord(norm, "story") ||
    norm.includes("tell me more") ||
    raw.includes("故事");
  const wantsGreeting =
    containsWholeEnglishWord(norm, "hello") ||
    containsWholeEnglishWord(norm, "hi") ||
    /^(?:你好|嗨|哈喽|早上好)[！!。.~ ]*$/u.test(raw);

  // 1.5 Check if child is answering an active riddle from the previous turn
  const activeRiddle = findActiveRiddleFromHistory(history);
  if (activeRiddle && !wantsNewRiddle && !wantsStory && !wantsGreeting) {
    const hitAnswer = activeRiddle.keywords.some(
      (kw) => containsWholeEnglishWord(norm, kw) || raw.includes(kw)
    );
    if (hitAnswer) {
      return {
        englishReply: `Bingo! It is a ${activeRiddle.answer}! You are so smart!`,
        chineseHint: `太厉害啦，一猜就中！答案就是 ${activeRiddle.answer}（${activeRiddle.answerZh}）🎉 要不要再来猜一个？`,
        emotion: "cheering",
        praise: "猜谜小天才！",
        completedGoalIds: [],
        nextSuggestions: [
          { en: "Give me another riddle!", zh: "再猜一个谜语！", icon: "🎲" },
          { en: "Tell me a story!", zh: "听小故事！", icon: "📖" },
        ],
        masteredWords: [activeRiddle.answer],
        isSceneComplete: false,
      };
    }

    // Keep the riddle active on a wrong guess so the child can try again!
    const clueBody = activeRiddle.promptEn.replace(/^Riddle time!\s*/i, "");
    return {
      englishReply: `Nice guess! Try this riddle again: ${clueBody}`,
      chineseHint: `差点猜中啦，不是这个哦！再看一次提示猜猜看：${activeRiddle.promptZh}`,
      emotion: "thinking",
      praise: "勇敢猜猜看很棒！再试一次~",
      completedGoalIds: [],
      nextSuggestions: [
        ...activeRiddle.chips,
        { en: "Give me another riddle!", zh: "换一个谜语！", icon: "🎲" },
      ],
      masteredWords: [],
      isSceneComplete: false,
    };
  }

  // 2. Explicit activity intents (riddle / story / greeting) before general vocab fallback
  if (wantsNewRiddle) {
    const pastRiddles = history.filter(
      (m) => m.role === "assistant" && m.englishText.toLowerCase().includes("riddle time!")
    ).length;
    const riddle = OFFLINE_RIDDLES[pastRiddles % OFFLINE_RIDDLES.length];
    return {
      englishReply: riddle.promptEn,
      chineseHint: riddle.promptZh,
      emotion: "thinking",
      praise: "猜谜语开始咯！",
      completedGoalIds: [],
      nextSuggestions: [
        ...riddle.chips,
        { en: "Give me another riddle!", zh: "换一个谜语！", icon: "🎲" },
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
    const pastStories = history.filter(
      (m) =>
        m.role === "assistant" &&
        OFFLINE_STORIES.some((st) => m.englishText.includes(st.englishReply.slice(0, 24)))
    ).length;
    const story = OFFLINE_STORIES[pastStories % OFFLINE_STORIES.length];
    return {
      englishReply: story.englishReply,
      chineseHint: story.chineseHint,
      emotion: "happy",
      praise: "爱听英文故事磨耳朵太棒了！",
      completedGoalIds: [],
      nextSuggestions: story.chips,
      masteredWords: story.masteredWords,
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
