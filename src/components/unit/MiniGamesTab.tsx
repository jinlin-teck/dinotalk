"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, RotateCcw, Sparkles, Volume2 } from "lucide-react";
import type { UnitDef, VocabCard } from "@/data/curriculum/types";
import { WordVisual } from "@/components/illustrations/WordVisual";
import { soundEffects } from "@/lib/sound-effects";
import {
  buildRound1Questions,
  buildRound2Tiles,
  buildRound3Questions,
  type MatchTile,
} from "./mini-games-logic";

interface MiniGamesTabProps {
  unit: UnitDef;
  isDone: boolean;
  onComplete: (score: number) => Promise<void>;
  speak: (text: string, opts?: { lang?: "en" | "zh"; slow?: boolean }) => Promise<void>;
}

export function MiniGamesTab({ unit, isDone, onComplete, speak }: MiniGamesTabProps) {
  const [round, setRound] = useState<1 | 2 | 3>(1);
  const [mistakes, setMistakes] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Round 1: Listen & Pick (3 questions)
  const round1Questions = useMemo(() => buildRound1Questions(unit.vocab), [unit.vocab]);

  const [r1Idx, setR1Idx] = useState(0);
  const [r1Msg, setR1Msg] = useState<string | null>(null);

  // Round 2: Memory Match (3 pairs = 6 tiles)
  const initialTiles = useMemo<MatchTile[]>(() => buildRound2Tiles(unit.vocab), [unit.vocab]);

  const [flippedUids, setFlippedUids] = useState<string[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<string[]>([]);

  // Round 3: Word Bubble Pop (3 targets from latter words, always included in bubbles)
  const round3Questions = useMemo(() => buildRound3Questions(unit.vocab), [unit.vocab]);

  const [r3Idx, setR3Idx] = useState(0);
  const [r3Msg, setR3Msg] = useState<string | null>(null);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const timersRef = useRef<number[]>([]);

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

  const totalPairs = Math.max(1, Math.floor(initialTiles.length / 2));

  const handleR1Pick = (picked: VocabCard) => {
    const q = round1Questions[r1Idx];
    if (!q || advancing) return;
    if (picked.id === q.target.id) {
      soundEffects.playCorrect();
      setAdvancing(true);
      if (r1Idx + 1 >= round1Questions.length) {
        setR1Msg("第一关通关！进入翻牌配对游戏！");
        scheduleTimer(() => {
          setRound(2);
          setR1Msg(null);
          setAdvancing(false);
        }, 550);
      } else {
        setR1Msg(`太棒啦！就是 ${q.target.word}（${q.target.zh}）！`);
        scheduleTimer(() => {
          setR1Idx((i) => i + 1);
          setR1Msg(null);
          setAdvancing(false);
        }, 550);
      }
    } else {
      setMistakes((m) => m + 1);
      soundEffects.playGentleTryAgain();
      setR1Msg("再仔细看一眼哦，你可以的！");
    }
  };

  const handleTileClick = (tile: MatchTile) => {
    if (advancing) return;
    if (matchedPairs.includes(tile.pairId) || flippedUids.includes(tile.uid)) return;
    if (flippedUids.length >= 2) return;

    soundEffects.playClick();
    if (tile.kind === "word") {
      speak(tile.card.word, { lang: "en" });
    }

    const nextFlipped = [...flippedUids, tile.uid];
    setFlippedUids(nextFlipped);

    if (nextFlipped.length === 2) {
      const first = initialTiles.find((t) => t.uid === nextFlipped[0]);
      const second = tile;
      if (first && first.pairId === second.pairId) {
        soundEffects.playCorrect();
        const nextMatched = [...matchedPairs, tile.pairId];
        setMatchedPairs(nextMatched);
        setFlippedUids([]);
        if (nextMatched.length >= totalPairs) {
          setAdvancing(true);
          scheduleTimer(() => {
            setRound(3);
            setAdvancing(false);
          }, 550);
        }
      } else {
        setMistakes((m) => m + 1);
        soundEffects.playGentleTryAgain();
        scheduleTimer(() => setFlippedUids([]), 650);
      }
    }
  };

  const handleR3Pick = async (picked: VocabCard) => {
    const q = round3Questions[r3Idx];
    if (!q || advancing || gameCompleted) return;
    if (picked.id === q.target.id) {
      soundEffects.playCorrect();
      speak(picked.word, { lang: "en" });
      if (r3Idx + 1 >= round3Questions.length) {
        setGameCompleted(true);
        setR3Msg("太厉害了！三轮闯关全部成功！");
      } else {
        setAdvancing(true);
        setR3Msg("啵！戳对彩色泡泡啦！");
        scheduleTimer(() => {
          setR3Idx((i) => i + 1);
          setR3Msg(null);
          setAdvancing(false);
        }, 500);
      }
    } else {
      setMistakes((m) => m + 1);
      soundEffects.playGentleTryAgain();
      setR3Msg(`不对哦，再找找「${q.target.zh}」对应的英语泡泡~`);
    }
  };

  const handleFinish = async () => {
    if (submitting) return;
    setSubmitting(true);
    const score = Math.max(70, 100 - mistakes * 5);
    soundEffects.playCelebrate();
    try {
      await onComplete(score);
    } finally {
      setSubmitting(false);
    }
  };

  const resetGames = () => {
    clearAllTimers();
    setAdvancing(false);
    setRound(1);
    setR1Idx(0);
    setR1Msg(null);
    setFlippedUids([]);
    setMatchedPairs([]);
    setR3Idx(0);
    setR3Msg(null);
    setGameCompleted(false);
    setMistakes(0);
  };

  return (
    <div className="space-y-6">
      {/* 3-Round Progress Stepper */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { num: 1, label: "1. 听音选图" },
          { num: 2, label: "2. 翻牌配对" },
          { num: 3, label: "3. 单词泡泡" },
        ].map((item) => (
          <div
            key={item.num}
            className={`rounded-2xl px-3 py-2.5 text-center text-xs sm:text-sm font-extrabold border-2 ${
              round === item.num
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

      {/* Round 1 */}
      {round === 1 && round1Questions[r1Idx] && (
        <div className="bg-white rounded-3xl border-4 border-sky-200 p-5 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-sky-600">
                第 {r1Idx + 1} / {round1Questions.length} 题
              </div>
              <h3 className="text-xl font-black text-slate-800 mt-0.5">
                找出单词：
                <span className="text-sky-600 ml-1">{round1Questions[r1Idx].target.word}</span>
                <span className="text-sm font-bold text-slate-500 ml-2">
                  （{round1Questions[r1Idx].target.zh}）
                </span>
              </h3>
            </div>
            <button
              type="button"
              onClick={() => speak(round1Questions[r1Idx].target.word, { lang: "en" })}
              className="min-h-[48px] px-4 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold border-b-4 border-sky-700 flex items-center justify-center gap-2"
            >
              <Volume2 className="w-5 h-5" />
              <span>播报单词</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {round1Questions[r1Idx].options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`r1-option-${opt.word}`}
                onClick={() => handleR1Pick(opt)}
                className="p-4 rounded-3xl bg-amber-50/50 hover:bg-amber-100 border-2 border-amber-200 border-b-4 flex flex-col items-center gap-2 transition active:translate-y-0.5"
              >
                <WordVisual visualKey={opt.visualKey} size="md" />
                <span className="font-black text-lg text-slate-800">{opt.word}</span>
              </button>
            ))}
          </div>

          {r1Msg && (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm font-bold text-emerald-800">
              {r1Msg}
            </div>
          )}
        </div>
      )}

      {/* Round 2: Memory Match */}
      {round === 2 && (
        <div className="bg-white rounded-3xl border-4 border-purple-200 p-5 sm:p-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-slate-800">🃏 翻牌找朋友（已配对 {matchedPairs.length} / {totalPairs}）</h3>
              <p className="text-sm text-slate-600">把英文单词卡片和对应图画连在一起吧！</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {initialTiles.map((tile) => {
              const isMatched = matchedPairs.includes(tile.pairId);
              const isOpen = isMatched || flippedUids.includes(tile.uid);
              return (
                <button
                  key={tile.uid}
                  type="button"
                  data-testid={`match-tile-${tile.uid}`}
                  onClick={() => handleTileClick(tile)}
                  className={`min-h-[112px] rounded-2xl border-2 border-b-4 p-3 flex flex-col items-center justify-center transition ${
                    isMatched
                      ? "bg-emerald-100 border-emerald-300 text-emerald-900"
                      : isOpen
                      ? "bg-white border-purple-400 shadow-sm"
                      : "bg-purple-500 hover:bg-purple-600 border-purple-700 text-white"
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
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Round 3: Word Bubble Pop */}
      {round === 3 && !gameCompleted && round3Questions[r3Idx] && (
        <div className="bg-white rounded-3xl border-4 border-amber-200 p-5 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-amber-600">
                终极泡泡挑战 {r3Idx + 1} / {round3Questions.length}
              </div>
              <h3 className="text-xl font-black text-slate-800">
                请点破这个中文意思的英语泡泡：
                <span className="text-orange-600 ml-1">
                  {round3Questions[r3Idx].target.zh}
                </span>
              </h3>
            </div>
            <button
              type="button"
              onClick={() => speak(round3Questions[r3Idx].target.word, { lang: "en" })}
              className="min-h-[44px] px-4 rounded-2xl bg-amber-400 text-slate-900 font-bold border-b-4 border-amber-600 flex items-center gap-1.5"
            >
              <Volume2 className="w-4 h-4" />
              <span>偷听发音提示</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {round3Questions[r3Idx].bubbles.map((b) => (
              <button
                key={b.id}
                type="button"
                data-testid={`bubble-${b.word}`}
                onClick={() => handleR3Pick(b)}
                className="min-h-[76px] rounded-full bg-gradient-to-b from-sky-100 to-sky-200 hover:from-emerald-100 hover:to-emerald-200 border-2 border-sky-300 border-b-4 text-slate-900 font-black text-xl shadow-sm transition active:scale-95"
              >
                {b.word}
              </button>
            ))}
          </div>

          {r3Msg && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm font-bold text-amber-900">
              {r3Msg}
            </div>
          )}
        </div>
      )}

      {/* Completion Card */}
      {gameCompleted && (
        <div className="bg-emerald-50 rounded-3xl border-4 border-emerald-300 p-6 text-center space-y-4">
          <div className="text-5xl">🎉🏆</div>
          <h3 className="text-2xl font-black text-emerald-900">
            闯关游戏大胜利！
          </h3>
          <p className="text-emerald-800 font-semibold">
            你把本单元的单词全都牢牢记住啦！现在小恐龙在剧场等你一起演故事哦~
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={resetGames}
              className="min-h-[48px] px-5 rounded-2xl bg-white border-2 border-emerald-200 text-emerald-800 font-bold flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>再玩一次</span>
            </button>
          </div>
        </div>
      )}

      {/* Step Completion / Direct Advance */}
      <div className="flex justify-center pt-1">
        <button
          type="button"
          disabled={submitting}
          onClick={handleFinish}
          data-testid="complete-game-btn"
          className={`w-full sm:w-auto min-h-[56px] px-8 rounded-2xl font-black text-lg border-b-4 active:border-b-0 active:translate-y-1 transition flex items-center justify-center gap-2 shadow-md ${
            gameCompleted || isDone
              ? "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-700"
              : "bg-slate-800 hover:bg-slate-700 text-white border-slate-950"
          }`}
        >
          {isDone ? <CheckCircle2 className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
          <span>
            {submitting
              ? "正在记录星星..."
              : gameCompleted
              ? "领奖励！进入 AI 情景剧场 (+3⭐)"
              : isDone
              ? "已完成游戏，进入 AI 情景剧场 →"
              : "跳过/完成游戏，直接进 AI 情景剧场"}
          </span>
        </button>
      </div>
    </div>
  );
}
