export interface PronunciationScoreResult {
  score: number;
  stars: 1 | 2 | 3;
  passed: boolean;
  feedbackZh: string;
}

const HOMOPHONE_EQUIV: Record<string, string> = {
  won: "one",
  to: "two",
  too: "two",
  for: "four",
  fore: "four",
  ate: "eight",
  read: "red",
  son: "sun",
  see: "sea",
  i: "eye",
  ear: "hear",
  high: "hi",
  buy: "bye",
  by: "bye",
  pair: "pear",
  bare: "bear",
  blue: "blew",
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholePhrase(text: string, phrase: string): boolean {
  if (!phrase) return false;
  return new RegExp(`(?:^|\\s)${escapeRegex(phrase)}(?:$|\\s)`).test(text);
}

export function normalizeSpeechText(input: string): string {
  return input
    .toLowerCase()
    .replace(/i'm/g, "i am")
    .replace(/it's/g, "it is")
    .replace(/let's/g, "let us")
    .replace(/['’]s\b/g, " is")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[b.length];
}

function wordMatches(spokenWord: string, targetWord: string): number {
  if (spokenWord === targetWord) return 1;
  if (HOMOPHONE_EQUIV[spokenWord] === targetWord || HOMOPHONE_EQUIV[targetWord] === spokenWord) {
    return 0.92;
  }
  const maxLen = Math.max(spokenWord.length, targetWord.length);
  if (maxLen === 0) return 0;
  const dist = levenshtein(spokenWord, targetWord);
  const sim = 1 - dist / maxLen;
  return sim >= 0.68 ? sim : 0;
}

export function scorePronunciation(
  spokenRaw: string,
  targetRaw: string
): PronunciationScoreResult {
  const spoken = normalizeSpeechText(spokenRaw);
  const target = normalizeSpeechText(targetRaw);

  if (!spoken || !target) {
    return {
      score: 0,
      stars: 1,
      passed: false,
      feedbackZh: "没听清声音呢，靠近麦克风再试一次吧！",
    };
  }

  if (spoken === target || containsWholePhrase(spoken, target)) {
    return {
      score: 100,
      stars: 3,
      passed: true,
      feedbackZh: "太棒啦！发音超级清晰标准，3 颗大星星送给你！",
    };
  }

  const targetWords = target.split(" ").filter(Boolean);
  const spokenWords = spoken.split(" ").filter(Boolean);

  if (targetWords.length === 1) {
    const t = targetWords[0];
    let best = 0;
    for (const s of spokenWords) {
      best = Math.max(best, wordMatches(s, t));
    }
    const maxLen = Math.max(spoken.replace(/\s+/g, "").length, t.length);
    const charSim = 1 - levenshtein(spoken.replace(/\s+/g, ""), t) / Math.max(1, maxLen);
    const score = Math.round(Math.max(best, charSim) * 100);

    if (score >= 78) {
      return {
        score,
        stars: 3,
        passed: true,
        feedbackZh: "哇塞！发音好响亮好标准！",
      };
    }
    if (score >= 52) {
      return {
        score,
        stars: 2,
        passed: true,
        feedbackZh: "真勇敢，已经很像啦！再听一遍跟读会更棒！",
      };
    }
    return {
      score: Math.max(25, score),
      stars: 1,
      passed: false,
      feedbackZh: "勇敢开口就很棒！点一下小喇叭慢慢听，再读一次试试吧~",
    };
  }

  // Multi-word sentence matching
  let totalWeight = 0;
  for (const tw of targetWords) {
    let best = 0;
    for (const sw of spokenWords) {
      best = Math.max(best, wordMatches(sw, tw));
    }
    totalWeight += best;
  }

  const ratio = totalWeight / Math.max(1, targetWords.length);
  const score = Math.round(ratio * 100);

  if (score >= 75) {
    return {
      score,
      stars: 3,
      passed: true,
      feedbackZh: "太厉害啦！整句话都读得又流利又响亮！",
    };
  }
  if (score >= 45) {
    return {
      score,
      stars: 2,
      passed: true,
      feedbackZh: "很棒哦！关键词已经读出来啦，给你 2 颗星加油！",
    };
  }
  return {
    score: Math.max(30, score),
    stars: 1,
    passed: false,
    feedbackZh: "勇敢张嘴就已经迈出第一步啦！可以点小蜗牛慢速再听听看~",
  };
}
