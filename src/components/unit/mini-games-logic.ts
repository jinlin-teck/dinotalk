import type { VocabCard } from "@/data/curriculum/types";

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

export function buildRound1Questions(vocab: VocabCard[]): Round1Question[] {
  const base = vocab.slice(0, 3);
  return base.map((target, idx) => {
    const others = vocab.filter((v) => v.id !== target.id);
    const distractors: VocabCard[] = [];
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
    const options = [target, ...distractors].sort((a, b) => a.word.localeCompare(b.word));
    return { target, options };
  });
}

export function buildRound2Tiles(vocab: VocabCard[]): MatchTile[] {
  const cards = vocab.slice(0, 3);
  const list: MatchTile[] = [];
  cards.forEach((c) => {
    list.push({ uid: `${c.id}-w`, pairId: c.id, kind: "word", card: c });
    list.push({ uid: `${c.id}-v`, pairId: c.id, kind: "visual", card: c });
  });
  return list.sort(
    (a, b) =>
      a.uid.length * 7 + a.uid.charCodeAt(3) - (b.uid.length * 7 + b.uid.charCodeAt(3))
  );
}

export function buildRound3Questions(vocab: VocabCard[]): Round3Question[] {
  const targets = vocab.slice(-3);
  // Use the last up to 6 words so all 3 tail targets are guaranteed to be included
  const basePool = vocab.slice(-6);
  return targets.map((target) => {
    const hasTarget = basePool.some((b) => b.id === target.id);
    const bubbles = hasTarget
      ? [...basePool]
      : [target, ...basePool.filter((b) => b.id !== target.id).slice(0, 5)];
    return {
      target,
      bubbles: bubbles.sort((a, b) => a.word.localeCompare(b.word)),
    };
  });
}
