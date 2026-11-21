import type { PhonicsItem, VocabCard } from "@/data/curriculum/types";

export interface MatchTile {
  uid: string;
  pairId: string;
  kind: "word" | "visual";
  card: VocabCard;
}

export interface Round1Question {
  target: VocabCard;
  options: VocabCard[];
}

export interface Round3Question {
  target: VocabCard;
  bubbles: VocabCard[];
}

export interface CvcSpellQuestion {
  phonicsId: string;
  word: string;
  zh: string;
  visualKey: string;
  parts: string[];
  choices: Array<{ uid: string; letter: string }>;
}

export interface GeneratorOptions {
  rng?: () => number;
  priorityIds?: string[];
}

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickPrioritizedCards(
  vocab: VocabCard[],
  count: number,
  opts?: GeneratorOptions
): VocabCard[] {
  if (!opts?.rng && (!opts?.priorityIds || opts.priorityIds.length === 0)) {
    return vocab.slice(0, count);
  }
  const rng = opts.rng ?? Math.random;
  const prioritySet = new Set(opts.priorityIds ?? []);
  const prioritized = shuffleWithRng(
    vocab.filter((v) => prioritySet.has(v.id)),
    rng
  );
  const rest = shuffleWithRng(
    vocab.filter((v) => !prioritySet.has(v.id)),
    rng
  );
  return [...prioritized, ...rest].slice(0, count);
}

export function buildRound1Questions(
  vocab: VocabCard[],
  opts?: GeneratorOptions
): Round1Question[] {
  const base = pickPrioritizedCards(vocab, 3, opts);
  const rng = opts?.rng;
  return base.map((target, idx) => {
    const others = vocab.filter((v) => v.id !== target.id);
    const distractors: VocabCard[] = [];
    if (rng) {
      distractors.push(...shuffleWithRng(others, rng).slice(0, Math.min(2, others.length)));
    } else {
      if (others.length > 0) {
        distractors.push(others[idx % others.length]);
      }
      if (others.length > 1) {
        const secondIdx = (idx + 2) % others.length;
        const candidate =
          others[secondIdx].id === distractors[0].id
            ? others[(idx + 1) % others.length]
            : others[secondIdx];
        distractors.push(candidate);
      }
    }
    const rawOptions = [target, ...distractors];
    const options = rng
      ? shuffleWithRng(rawOptions, rng)
      : rawOptions.sort((a, b) => a.word.localeCompare(b.word));
    return { target, options };
  });
}

export function buildRound2Tiles(
  vocab: VocabCard[],
  opts?: GeneratorOptions
): MatchTile[] {
  const cards = pickPrioritizedCards(vocab, 3, opts);
  const list: MatchTile[] = [];
  cards.forEach((c) => {
    list.push({ uid: `${c.id}-w`, pairId: c.id, kind: "word", card: c });
    list.push({ uid: `${c.id}-v`, pairId: c.id, kind: "visual", card: c });
  });
  if (opts?.rng) {
    return shuffleWithRng(list, opts.rng);
  }
  return list.sort(
    (a, b) =>
      a.uid.length * 7 + a.uid.charCodeAt(3) - (b.uid.length * 7 + b.uid.charCodeAt(3))
  );
}

export function buildRound3Questions(
  vocab: VocabCard[],
  opts?: GeneratorOptions
): Round3Question[] {
  const rng = opts?.rng;
  const targets = rng
    ? pickPrioritizedCards(vocab, 3, opts)
    : vocab.slice(-3);

  const basePool = rng ? vocab : vocab.slice(-6);
  return targets.map((target) => {
    const others = basePool.filter((b) => b.id !== target.id);
    const pickedOthers = rng
      ? shuffleWithRng(others, rng).slice(0, Math.min(5, others.length))
      : others.slice(0, Math.min(5, others.length));
    const bubbles = [target, ...pickedOthers];
    return {
      target,
      bubbles: rng
        ? shuffleWithRng(bubbles, rng)
        : bubbles.sort((a, b) => a.word.localeCompare(b.word)),
    };
  });
}

const DISTRACTOR_LETTERS = ["m", "s", "t", "p", "b", "d", "k", "n", "r", "f"];

export function buildCvcSpellQuestions(
  phonics: PhonicsItem[],
  rng: () => number = Math.random
): CvcSpellQuestion[] {
  const cvcItems = phonics.filter(
    (p) => p.isCvc && Array.isArray(p.blendParts) && p.blendParts.length === 3
  );
  if (cvcItems.length === 0) return [];
  const chosen = shuffleWithRng(cvcItems, rng).slice(0, 2);
  return chosen.map((item) => {
    const parts = item.blendParts!.map((l) => l.toLowerCase());
    const sample = item.sampleWords[0];
    const distractor =
      DISTRACTOR_LETTERS.find((l) => !parts.includes(l)) ?? "z";
    const choices = shuffleWithRng(
      [...parts, distractor].map((letter, idx) => ({
        uid: `${item.id}-${idx}-${letter}`,
        letter,
      })),
      rng
    );
    return {
      phonicsId: item.id,
      word: sample?.word ?? item.letter.toLowerCase(),
      zh: sample?.zh ?? item.letter,
      visualKey: sample?.visualKey ?? "star",
      parts,
      choices,
    };
  });
}
