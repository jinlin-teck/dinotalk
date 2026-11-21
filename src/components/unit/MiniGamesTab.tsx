"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Eye, Flame, RotateCcw, Sparkles, Volume2 } from "lucide-react";
import type { UnitDef, VocabCard } from "@/data/curriculum/types";
import { WordVisual } from "@/components/illustrations/WordVisual";
import { soundEffects } from "@/lib/sound-effects";
import type { CurriculumItemType } from "@/types/api";
import {
  buildCvcSpellQuestions,
  buildRound1Questions,
  buildRound2Tiles,
  buildRound3Questions,
  type MatchTile,
} from "./mini-games-logic";

interface PracticedItem {
  itemKey: string;
  itemType: CurriculumItemType;
  correct: boolean;
}

interface MiniGamesTabProps {
  unit: UnitDef;
  isDone: boolean;
  isActive: boolean;
  weakVocabIds?: string[];
  onComplete: (score: number, practicedItems?: PracticedItem[]) => Promise<boolean>;
  onSkipToNext: () => void;
  speak: (text: string, opts?: { lang?: "en" | "zh"; slow?: boolean }) => Promise<void>;
}

function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function MiniGamesTab({
  unit,
  isDone,
  isActive,
  weakVocabIds = [],
  onComplete,
  onSkipToNext,
  speak,
}: MiniGamesTabProps) {
  const [playSeed, setPlaySeed] = useState(() => Date.now() % 100000);
  // Snapshot priority weak words at the start of each game so late-arriving progress fetches never replace active questions mid-round
  const [lockedPriorityIds, setLockedPriorityIds] = useState<string[]>(() => weakVocabIds);
  const [round, setRound] = useState<1 | 2 | 3 | 4>(1);
  const [mistakes, setMistakes] = useState(0);
  const [streak, setStreak] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const gameBundle = useMemo(() => {
    const rng = createSeededRng(playSeed);
    const opts = { rng, priorityIds: lockedPriorityIds };
    return {
      round1: buildRound1Questions(unit.vocab, opts),
      round2: buildRound2Tiles(unit.vocab, opts),
      round3: buildRound3Questions(unit.vocab, opts),
      round4: buildCvcSpellQuestions(unit.phonics, rng),
    };
  }, [playSeed, unit.vocab, unit.phonics, lockedPriorityIds]);

  const hasCvcRound = gameBundle.round4.length > 0;

  // Round 1 state (true Listen & Pick — no word leaked!)
  const [r1Idx, setR1Idx] = useState(0);
  const [r1Msg, setR1Msg] = useState<string | null>(null);
  const [r1RevealedId, setR1RevealedId] = useState<string | null>(null);
  const [showZhHint, setShowZhHint] = useState(false);

  // Round 2 state (Memory Match)
  const [flippedUids, setFlippedUids] = useState<string[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<string[]>([]);

  // Round 3 state (Word Bubble Pop)
  const [r3Idx, setR3Idx] = useState(0);
  const [r3Msg, setR3Msg] = useState<string | null>(null);
  const [poppingId, setPoppingId] = useState<string | null>(null);

  // Round 4 state (CVC Letter Builder)
  const [r4Idx, setR4Idx] = useState(0);
  const [r4PickedUids, setR4PickedUids] = useState<string[]>([]);
  const [r4Msg, setR4Msg] = useState<string | null>(null);

  const [gameCompleted, setGameCompleted] = useState(false);
  const [savedGame, setSavedGame] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const timersRef = useRef<number[]>([]);
  const itemResultsRef = useRef<Map<string, PracticedItem>>(new Map());
  const lastSpokenGameKeyRef = useRef<string | null>(null);

  const recordOutcome = useCallback(
    (itemKey: string, itemType: CurriculumItemType, correct: boolean) => {
      const existing = itemResultsRef.current.get(itemKey);
      if (!existing) {
        itemResultsRef.current.set(itemKey, { itemKey, itemType, correct });
      } else if (!correct) {
        // First/any mistake flags the word for gentle SRS reinforcement
        itemResultsRef.current.set(itemKey, { itemKey, itemType, correct: false });
      }
    },
    []
  );

  const clearAllTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  const scheduleTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  }, []);

  useEffect(() => {
    return () => clearAllTimers();
  }, [clearAllTimers]);

  // Auto-play audio in Round 1 when active & moving to a new question
  const currentR1Target = gameBundle.round1[r1Idx]?.target;
  useEffect(() => {
    if (!isActive || round !== 1 || !currentR1Target || gameCompleted) return;
    const key = `${playSeed}:r1:${r1Idx}:${currentR1Target.id}`;
    if (lastSpokenGameKeyRef.current === key) return;
    lastSpokenGameKeyRef.current = key;
    void speak(currentR1Target.word, { lang: "en" });
  }, [isActive, playSeed, round, r1Idx, currentR1Target, gameCompleted, speak]);

  // Auto-play audio in Round 4 CVC builder
  const currentR4 = gameBundle.round4[r4Idx];
  useEffect(() => {
    if (!isActive || round !== 4 || !currentR4 || gameCompleted) return;
    const key = `${playSeed}:r4:${r4Idx}:${currentR4.phonicsId}`;
    if (lastSpokenGameKeyRef.current === key) return;
    lastSpokenGameKeyRef.current = key;
    void speak(currentR4.word, { lang: "en", slow: true });
  }, [isActive, playSeed, round, r4Idx, currentR4, gameCompleted, speak]);

  const totalPairs = Math.max(1, Math.floor(gameBundle.round2.length / 2));

  const playPositiveFeedback = (nextStreak: number) => {
    if (nextStreak >= 2) {
      soundEffects.playCombo(nextStreak);
    } else {
      soundEffects.playCorrect();
    }
  };

  const handleR1Pick = (picked: VocabCard) => {
    const q = gameBundle.round1[r1Idx];
    if (!q || advancing) return;
    if (picked.id === q.target.id) {
      recordOutcome(q.target.id, "word", true);
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      playPositiveFeedback(nextStreak);
      setR1RevealedId(picked.id);
      setAdvancing(true);
      if (r1Idx + 1 >= gameBundle.round1.length) {
        setR1Msg(`太棒啦！就是 ${q.target.word}（${q.target.zh}）！马上进入翻牌配对！`);
        scheduleTimer(() => {
          setRound(2);
          setR1Msg(null);
          setR1RevealedId(null);
          setShowZhHint(false);
          setAdvancing(false);
        }, 800);
      } else {
        setR1Msg(`太棒啦！就是 ${q.target.word}（${q.target.zh}）！`);
        scheduleTimer(() => {
          setR1Idx((i) => i + 1);
          setR1Msg(null);
          setR1RevealedId(null);
          setShowZhHint(false);
          setAdvancing(false);
        }, 800);
      }
    } else {
      recordOutcome(q.target.id, "word", false);
      setMistakes((m) => m + 1);
      setStreak(0);
      soundEffects.playGentleTryAgain();
      void speak(q.target.word, { lang: "en", slow: true });
      setR1Msg("差一点点哦，已为你慢速重播一遍，再听听选选看！");
    }
  };

  const handleTileClick = (tile: MatchTile) => {
    if (advancing) return;
    if (matchedPairs.includes(tile.pairId) || flippedUids.includes(tile.uid)) return;
    if (flippedUids.length >= 2) return;

    soundEffects.playClick();
    if (tile.kind === "word") {
      void speak(tile.card.word, { lang: "en" });
    }

    const nextFlipped = [...flippedUids, tile.uid];
    setFlippedUids(nextFlipped);

    if (nextFlipped.length === 2) {
      const first = gameBundle.round2.find((t) => t.uid === nextFlipped[0]);
      const second = tile;
      if (first && first.pairId === second.pairId) {
        recordOutcome(tile.pairId, "word", true);
        const nextStreak = streak + 1;
        setStreak(nextStreak);
        playPositiveFeedback(nextStreak);
        const nextMatched = [...matchedPairs, tile.pairId];
        setMatchedPairs(nextMatched);
        setFlippedUids([]);
        if (nextMatched.length >= totalPairs) {
          setAdvancing(true);
          scheduleTimer(() => {
            setRound(3);
            setAdvancing(false);
          }, 600);
        }
      } else {
        if (first) recordOutcome(first.pairId, "word", false);
        recordOutcome(second.pairId, "word", false);
        setMistakes((m) => m + 1);
        setStreak(0);
        soundEffects.playGentleTryAgain();
        scheduleTimer(() => setFlippedUids([]), 650);
      }
    }
  };

  const handleR3Pick = async (picked: VocabCard) => {
    const q = gameBundle.round3[r3Idx];
    if (!q || advancing || gameCompleted) return;
    if (picked.id === q.target.id) {
      recordOutcome(q.target.id, "word", true);
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      soundEffects.playPop();
      if (nextStreak >= 2) soundEffects.playCombo(nextStreak);
      setPoppingId(picked.id);
      void speak(picked.word, { lang: "en" });

      if (r3Idx + 1 >= gameBundle.round3.length) {
        if (hasCvcRound) {
          setAdvancing(true);
          setR3Msg("啵！泡泡全戳破啦，进入拼读积木彩蛋关！");
          scheduleTimer(() => {
            setRound(4);
            setR3Msg(null);
            setPoppingId(null);
            setAdvancing(false);
          }, 650);
        } else {
          setGameCompleted(true);
          soundEffects.playCelebrate();
          setR3Msg("太厉害了！三轮闯关全部成功！");
        }
      } else {
        setAdvancing(true);
        setR3Msg("啵！戳对彩色泡泡啦！");
        scheduleTimer(() => {
          setR3Idx((i) => i + 1);
          setR3Msg(null);
          setPoppingId(null);
          setAdvancing(false);
        }, 550);
      }
    } else {
      recordOutcome(q.target.id, "word", false);
      setMistakes((m) => m + 1);
      setStreak(0);
      soundEffects.playGentleTryAgain();
      setR3Msg(`不对哦，再找找「${q.target.zh}」对应的英语泡泡~`);
    }
  };

  const handleR4LetterPick = (choice: { uid: string; letter: string }) => {
    if (!currentR4 || advancing || gameCompleted) return;
    if (r4PickedUids.includes(choice.uid)) return;
    const expectedLetter = currentR4.parts[r4PickedUids.length];
    if (choice.letter === expectedLetter) {
      soundEffects.playPop();
      const nextPicked = [...r4PickedUids, choice.uid];
      setR4PickedUids(nextPicked);
      setR4Msg(null);

      if (nextPicked.length >= currentR4.parts.length) {
        recordOutcome(currentR4.phonicsId, "phonics", true);
        const nextStreak = streak + 1;
        setStreak(nextStreak);
        playPositiveFeedback(nextStreak);
        void speak(currentR4.word, { lang: "en" });
        if (r4Idx + 1 >= gameBundle.round4.length) {
          setAdvancing(true);
          setR4Msg(`拼出 ${currentR4.word}（${currentR4.zh}）啦！全部闯关胜利！`);
          scheduleTimer(() => {
            setGameCompleted(true);
            setAdvancing(false);
            soundEffects.playCelebrate();
          }, 700);
        } else {
          setAdvancing(true);
          setR4Msg(`太厉害了！拼出了 ${currentR4.word}（${currentR4.zh}）！下一题~`);
          scheduleTimer(() => {
            setR4Idx((i) => i + 1);
            setR4PickedUids([]);
            setR4Msg(null);
            setAdvancing(false);
          }, 750);
        }
      }
    } else {
      recordOutcome(currentR4.phonicsId, "phonics", false);
      setMistakes((m) => m + 1);
      setStreak(0);
      soundEffects.playGentleTryAgain();
      setR4Msg(`第 ${r4PickedUids.length + 1} 个字母不是 "${choice.letter}" 哦，再听听声音试试！`);
    }
  };

  const canClaimStars = gameCompleted || isDone;

  const handleFinish = async () => {
    if (submitting || !canClaimStars) return;
    if (!gameCompleted || savedGame) {
      soundEffects.playClick();
      onSkipToNext();
      return;
    }
    setSubmitting(true);
    const score = Math.max(70, 100 - mistakes * 5);
    soundEffects.playCelebrate();
    try {
      const practiced = Array.from(itemResultsRef.current.values());
      setSavedGame(await onComplete(score, practiced.length > 0 ? practiced : undefined));
    } finally {
      setSubmitting(false);
    }
  };

  const resetGames = () => {
    clearAllTimers();
    itemResultsRef.current.clear();
    setLockedPriorityIds(weakVocabIds);
    setPlaySeed((s) => s + 137);
    setAdvancing(false);
    setRound(1);
    setR1Idx(0);
    setR1Msg(null);
    setR1RevealedId(null);
    setShowZhHint(false);
    setFlippedUids([]);
    setMatchedPairs([]);
    setR3Idx(0);
    setR3Msg(null);
    setPoppingId(null);
    setR4Idx(0);
    setR4PickedUids([]);
    setR4Msg(null);
    setGameCompleted(false);
    setSavedGame(false);
    setMistakes(0);
    setStreak(0);
  };

  const steps = hasCvcRound
    ? [
        { num: 1, label: "1. 听音选图" },
        { num: 2, label: "2. 翻牌配对" },
        { num: 3, label: "3. 单词泡泡" },
        { num: 4, label: "4. 字母拼词" },
      ]
    : [
        { num: 1, label: "1. 听音选图" },
        { num: 2, label: "2. 翻牌配对" },
        { num: 3, label: "3. 单词泡泡" },
      ];

  return (
    <div className="space-y-6">
      {/* Progress Stepper + Combo Streak */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <div className={`flex-1 grid gap-2 ${hasCvcRound ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
          {steps.map((item) => (
            <div
              key={item.num}
              className={`rounded-2xl px-3 py-2.5 text-center text-xs sm:text-sm font-extrabold border-2 ${
                round === item.num && !gameCompleted
                  ? "bg-emerald-500 text-white border-emerald-600"
                  : round > item.num || gameCompleted
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : "bg-white text-slate-400 border-slate-200"
              }`}
            >
              {item.label}
            </div>
          ))}
        </div>

        {streak >= 2 && (
          <motion.div
            key={streak}
            initial={{ scale: 0.7 }}
            animate={{ scale: 1 }}
            className="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-orange-400 to-amber-400 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1 shadow-xs shrink-0"
          >
            <Flame className="w-4 h-4 fill-white" />
            <span>连击 x{streak}</span>
          </motion.div>
        )}
      </div>

      {/* Round 1: True Listen & Pick (no word leaked!) */}
      {round === 1 && gameBundle.round1[r1Idx] && (
        <div className="bg-white rounded-3xl border-4 border-sky-200 p-5 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-sky-600">
                听音选图 · 第 {r1Idx + 1} / {gameBundle.round1.length} 题
              </div>
              <h3 className="text-xl font-black text-slate-800 mt-0.5">
                竖起小耳朵听发音，点出对应的图画！
                {showZhHint && (
                  <span className="text-base font-extrabold text-amber-600 ml-2">
                    （提示：{gameBundle.round1[r1Idx].target.zh}）
                  </span>
                )}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => speak(gameBundle.round1[r1Idx].target.word, { lang: "en" })}
                className="min-h-[48px] px-4 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold border-b-4 border-sky-700 flex items-center justify-center gap-1.5"
              >
                <Volume2 className="w-5 h-5" />
                <span>再听一遍</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  speak(gameBundle.round1[r1Idx].target.word, { lang: "en", slow: true })
                }
                className="min-h-[48px] px-3.5 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold border-b-4 border-amber-600 text-sm"
              >
                🐌 慢速
              </button>
              <button
                type="button"
                onClick={() => setShowZhHint((v) => !v)}
                className="min-h-[44px] px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs flex items-center gap-1"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{showZhHint ? "隐藏提示" : "偷看中文"}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {gameBundle.round1[r1Idx].options.map((opt) => {
              const revealed = r1RevealedId === opt.id;
              return (
                <motion.button
                  key={opt.id}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  animate={revealed ? { scale: [1, 1.06, 1] } : undefined}
                  data-testid={`r1-option-${opt.word}`}
                  onClick={() => handleR1Pick(opt)}
                  className={`p-4 rounded-3xl border-2 border-b-4 flex flex-col items-center justify-center gap-2 min-h-[126px] transition ${
                    revealed
                      ? "bg-emerald-100 border-emerald-400"
                      : "bg-amber-50/50 hover:bg-amber-100 border-amber-200"
                  }`}
                >
                  <WordVisual visualKey={opt.visualKey} size="md" />
                  {revealed ? (
                    <div className="text-center">
                      <div className="font-black text-lg text-emerald-900">{opt.word}</div>
                      <div className="text-xs font-bold text-emerald-700">{opt.zh}</div>
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-slate-400">点我选择</span>
                  )}
                </motion.button>
              );
            })}
          </div>

          {r1Msg && (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm font-bold text-emerald-800">
              {r1Msg}
            </div>
          )}
        </div>
      )}

      {/* Round 2: Memory Match with smooth flip feel */}
      {round === 2 && (
        <div className="bg-white rounded-3xl border-4 border-purple-200 p-5 sm:p-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-slate-800">
                🃏 翻牌找朋友（已配对 {matchedPairs.length} / {totalPairs}）
              </h3>
              <p className="text-sm text-slate-600">把英文单词卡片和对应图画连在一起吧！</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {gameBundle.round2.map((tile) => {
              const isMatched = matchedPairs.includes(tile.pairId);
              const isOpen = isMatched || flippedUids.includes(tile.uid);
              return (
                <motion.button
                  key={tile.uid}
                  type="button"
                  data-testid={`match-tile-${tile.uid}`}
                  onClick={() => handleTileClick(tile)}
                  animate={
                    isMatched
                      ? { scale: [1, 1.05, 1] }
                      : isOpen
                      ? { rotateY: 0 }
                      : { rotateY: 0 }
                  }
                  whileTap={{ scale: 0.95 }}
                  className={`min-h-[112px] rounded-2xl border-2 border-b-4 p-3 flex flex-col items-center justify-center transition ${
                    isMatched
                      ? "bg-emerald-100 border-emerald-400 text-emerald-900 shadow-xs"
                      : isOpen
                      ? "bg-white border-purple-400 shadow-sm"
                      : "bg-gradient-to-b from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 border-purple-700 text-white"
                  }`}
                >
                  {isOpen ? (
                    tile.kind === "word" ? (
                      <span className="text-xl font-black">{tile.card.word}</span>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <WordVisual visualKey={tile.card.visualKey} size="sm" />
                        <span className="text-xs font-bold text-slate-600">{tile.card.zh}</span>
                      </div>
                    )
                  ) : (
                    <span className="text-3xl font-black">?</span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* Round 3: Animated Floating Word Bubble Pop */}
      {round === 3 && !gameCompleted && gameBundle.round3[r3Idx] && (
        <div className="bg-white rounded-3xl border-4 border-amber-200 p-5 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-amber-600">
                泡泡大挑战 {r3Idx + 1} / {gameBundle.round3.length}
              </div>
              <h3 className="text-xl font-black text-slate-800">
                戳破这个中文意思的英语泡泡：
                <span className="text-orange-600 ml-1">
                  {gameBundle.round3[r3Idx].target.zh}
                </span>
              </h3>
            </div>
            <button
              type="button"
              onClick={() => speak(gameBundle.round3[r3Idx].target.word, { lang: "en" })}
              className="min-h-[44px] px-4 rounded-2xl bg-amber-400 text-slate-900 font-bold border-b-4 border-amber-600 flex items-center gap-1.5"
            >
              <Volume2 className="w-4 h-4" />
              <span>偷听发音提示</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 py-1">
            {gameBundle.round3[r3Idx].bubbles.map((b, bIdx) => {
              const isPopping = poppingId === b.id;
              return (
                <motion.button
                  key={b.id}
                  type="button"
                  data-testid={`bubble-${b.word}`}
                  onClick={() => handleR3Pick(b)}
                  animate={
                    isPopping
                      ? { scale: [1, 1.25, 0], opacity: [1, 1, 0] }
                      : { y: [0, bIdx % 2 === 0 ? -5 : 5, 0] }
                  }
                  transition={
                    isPopping
                      ? { duration: 0.35 }
                      : { duration: 2.2 + (bIdx % 3) * 0.4, repeat: Infinity, ease: "easeInOut" }
                  }
                  whileTap={{ scale: 0.92 }}
                  className="min-h-[78px] rounded-full bg-gradient-to-b from-sky-100 via-sky-50 to-sky-200 hover:from-emerald-100 hover:to-emerald-200 border-2 border-sky-300 border-b-4 text-slate-900 font-black text-xl shadow-sm"
                >
                  🫧 {b.word}
                </motion.button>
              );
            })}
          </div>

          {r3Msg && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm font-bold text-amber-900">
              {r3Msg}
            </div>
          )}
        </div>
      )}

      {/* Round 4: CVC Letter Block Builder */}
      {round === 4 && !gameCompleted && currentR4 && (
        <div className="bg-white rounded-3xl border-4 border-orange-200 p-5 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-orange-600">
                🚂 拼读积木彩蛋 {r4Idx + 1} / {gameBundle.round4.length}
              </div>
              <h3 className="text-xl font-black text-slate-800">
                按顺序点字母积木，拼出这个词！
              </h3>
            </div>
            <button
              type="button"
              onClick={() => speak(currentR4.word, { lang: "en", slow: true })}
              className="min-h-[44px] px-4 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold border-b-4 border-orange-700 flex items-center gap-1.5"
            >
              <Volume2 className="w-4 h-4" />
              <span>听读音</span>
            </button>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3 bg-orange-50 px-5 py-3 rounded-3xl border-2 border-orange-200">
              <WordVisual visualKey={currentR4.visualKey} size="md" />
              <span className="text-2xl font-black text-slate-800">{currentR4.zh}</span>
            </div>

            {/* 3 Target Slots */}
            <div className="flex items-center gap-3">
              {currentR4.parts.map((_, slotIdx) => {
                const pickedUid = r4PickedUids[slotIdx];
                const pickedObj = currentR4.choices.find((c) => c.uid === pickedUid);
                return (
                  <div
                    key={slotIdx}
                    className={`w-16 h-16 rounded-2xl border-2 border-dashed flex items-center justify-center text-3xl font-black ${
                      pickedObj
                        ? "bg-emerald-100 border-emerald-400 text-emerald-800 border-solid"
                        : "bg-slate-50 border-slate-300 text-slate-300"
                    }`}
                  >
                    {pickedObj ? pickedObj.letter : "_"}
                  </div>
                );
              })}
            </div>

            {/* 4 Clickable Letter Blocks */}
            <div className="flex items-center justify-center gap-3 flex-wrap pt-1">
              {currentR4.choices.map((choice) => {
                const used = r4PickedUids.includes(choice.uid);
                return (
                  <motion.button
                    key={choice.uid}
                    type="button"
                    disabled={used || advancing}
                    whileTap={{ scale: 0.92 }}
                    data-testid={`cvc-block-${choice.letter}`}
                    onClick={() => handleR4LetterPick(choice)}
                    className={`w-16 h-16 rounded-2xl border-2 border-b-4 font-black text-3xl transition ${
                      used
                        ? "bg-slate-100 border-slate-200 text-slate-300"
                        : "bg-amber-300 hover:bg-amber-400 border-amber-500 text-slate-900 shadow-xs"
                    }`}
                  >
                    {choice.letter}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {r4Msg && (
            <div className="rounded-2xl bg-orange-50 border border-orange-200 px-4 py-2.5 text-sm font-bold text-orange-900 text-center">
              {r4Msg}
            </div>
          )}
        </div>
      )}

      {/* Completion Card with confetti sparkle */}
      {gameCompleted && (
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gradient-to-br from-emerald-50 via-amber-50 to-sky-50 rounded-3xl border-4 border-emerald-300 p-6 text-center space-y-4"
        >
          <div className="text-5xl">🎉🏆✨</div>
          <h3 className="text-2xl font-black text-emerald-900">闯关游戏大胜利！</h3>
          <p className="text-emerald-800 font-semibold">
            你把本单元的单词全都牢牢记住啦（得分：{Math.max(70, 100 - mistakes * 5)} 分）！现在小恐龙在剧场等你演故事哦~
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={resetGames}
              className="min-h-[48px] px-5 rounded-2xl bg-white border-2 border-emerald-200 text-emerald-800 font-bold flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>洗牌再玩一次</span>
            </button>
          </div>
        </motion.div>
      )}

      {/* Flexible Gate: Claim Stars vs Browse Next Tab */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
        <button
          type="button"
          disabled={submitting || !canClaimStars}
          onClick={handleFinish}
          data-testid="complete-game-btn"
          className={`w-full sm:w-auto min-h-[56px] px-8 rounded-2xl font-black text-lg border-b-4 active:border-b-0 active:translate-y-1 transition flex items-center justify-center gap-2 shadow-md ${
            canClaimStars
              ? "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-700"
              : "bg-slate-200 text-slate-500 border-slate-300 cursor-not-allowed"
          }`}
        >
          {isDone ? <CheckCircle2 className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
          <span>
            {submitting
              ? "正在记录成绩..."
              : gameCompleted && !isDone
              ? "领奖励！进入 AI 情景剧场 (+3⭐)"
              : gameCompleted && !savedGame
              ? "记录这次成绩，进入 AI 情景剧场 →"
              : isDone
              ? "已完成游戏，进入 AI 情景剧场 →"
              : "通关上方小游戏即可领 (+3⭐)"}
          </span>
        </button>

        {!canClaimStars && (
          <button
            type="button"
            onClick={() => {
              soundEffects.playClick();
              onSkipToNext();
            }}
            data-testid="skip-game-btn"
            className="min-h-[48px] px-5 rounded-2xl bg-white hover:bg-slate-50 text-slate-600 font-bold text-sm border-2 border-slate-200 flex items-center gap-1.5"
          >
            <span>先去 AI 情景剧场逛逛</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
