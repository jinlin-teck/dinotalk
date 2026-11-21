"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Mic,
  MicOff,
  Sparkles,
  Volume2,
} from "lucide-react";
import type { UnitDef } from "@/data/curriculum/types";
import { WordVisual } from "@/components/illustrations/WordVisual";
import {
  scorePronunciation,
  type PronunciationScoreResult,
} from "@/lib/speech/pronunciation-scorer";
import { soundEffects } from "@/lib/sound-effects";
import type { CurriculumItemType } from "@/types/api";

interface PracticedItem {
  itemKey: string;
  itemType: CurriculumItemType;
  correct: boolean;
}

interface StoryCardsTabProps {
  unit: UnitDef;
  isDone: boolean;
  isActive: boolean;
  onComplete: (practicedItems?: PracticedItem[]) => Promise<boolean>;
  onSkipToNext: () => void;
  speak: (text: string, opts?: { lang?: "en" | "zh"; slow?: boolean }) => Promise<void>;
  isListening: boolean;
  sttError: string | null;
  startListening: (
    hints: string,
    onTranscript: (t: string) => void,
    opts?: { lang?: "en" | "zh" }
  ) => Promise<void>;
  stopListening: () => void;
}

export function StoryCardsTab({
  unit,
  isDone,
  isActive,
  onComplete,
  onSkipToNext,
  speak,
  isListening,
  sttError,
  startListening,
  stopListening,
}: StoryCardsTabProps) {
  const [index, setIndex] = useState(0);
  const [viewedIds, setViewedIds] = useState<Set<string>>(
    () => new Set([unit.vocab[0]?.id ?? ""])
  );
  const [reachedEndNotice, setReachedEndNotice] = useState(false);
  const [activeListenTarget, setActiveListenTarget] = useState<string | null>(null);
  const [spokenResult, setSpokenResult] = useState<{
    heard: string;
    score: PronunciationScoreResult;
  } | null>(null);
  const [sentenceScores, setSentenceScores] = useState<
    Record<string, { heard: string; score: PronunciationScoreResult }>
  >({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isActive) setActiveListenTarget(null);
  }, [isActive]);

  const card = unit.vocab[index];
  const vocabHints = unit.vocab.map((v) => v.word).join(", ");
  const remainingCards = Math.max(0, unit.vocab.length - viewedIds.size);
  const allViewed = remainingCards === 0;
  const canClaimStars = allViewed || isDone;

  const goCard = (nextIdx: number) => {
    soundEffects.playClick();
    if (nextIdx >= unit.vocab.length) {
      setReachedEndNotice(true);
      soundEffects.playStar();
      return;
    }
    const bounded = Math.max(0, Math.min(unit.vocab.length - 1, nextIdx));
    setIndex(bounded);
    setReachedEndNotice(false);
    setSpokenResult(null);
    const nextCard = unit.vocab[bounded];
    if (nextCard) {
      setViewedIds((prev) => {
        const next = new Set(prev);
        next.add(nextCard.id);
        return next;
      });
      void speak(nextCard.word, { lang: "en" });
    }
  };

  const handlePracticeSpeak = () => {
    if (!card) return;
    if (isListening) {
      stopListening();
      setActiveListenTarget(null);
      return;
    }
    soundEffects.playClick();
    setSpokenResult(null);
    setActiveListenTarget(`word:${card.id}`);
    startListening(
      vocabHints,
      (transcript) => {
        setActiveListenTarget(null);
        const res = scorePronunciation(transcript, card.word);
        setSpokenResult({ heard: transcript, score: res });
        if (res.passed) {
          soundEffects.playCorrect();
        } else {
          soundEffects.playGentleTryAgain();
        }
      },
      { lang: "en" }
    );
  };

  const handlePracticeSentence = (sentenceId: string, sentenceEn: string) => {
    if (isListening) {
      stopListening();
      setActiveListenTarget(null);
      return;
    }
    soundEffects.playClick();
    setActiveListenTarget(`sentence:${sentenceId}`);
    startListening(
      `${sentenceEn}, ${vocabHints}`,
      (transcript) => {
        setActiveListenTarget(null);
        const res = scorePronunciation(transcript, sentenceEn);
        setSentenceScores((prev) => ({ ...prev, [sentenceId]: { heard: transcript, score: res } }));
        if (res.passed) {
          soundEffects.playCorrect();
        } else {
          soundEffects.playGentleTryAgain();
        }
      },
      { lang: "en" }
    );
  };

  const handleFinish = async () => {
    if (submitting || !canClaimStars) return;
    if (isDone) {
      soundEffects.playClick();
      onSkipToNext();
      return;
    }
    setSubmitting(true);
    soundEffects.playCelebrate();
    try {
      const practicedItems: PracticedItem[] = [
        ...unit.vocab.map((v) => ({
          itemKey: v.id,
          itemType: "word" as const,
          correct: true,
        })),
        ...unit.sentences
          .filter((s) => sentenceScores[s.id])
          .map((s) => ({
            itemKey: s.id,
            itemType: "sentence" as const,
            correct: sentenceScores[s.id].score.passed,
          })),
      ];
      await onComplete(practicedItems);
    } finally {
      setSubmitting(false);
    }
  };

  if (!card) return null;

  return (
    <div className="space-y-6">
      {/* Progress dots */}
      <div className="flex items-center justify-between gap-2 bg-white rounded-2xl p-3 border-2 border-emerald-100">
        <div className="text-sm font-bold text-slate-700">
          卡片 {index + 1} / {unit.vocab.length}
          <span className="ml-2 text-xs text-emerald-700">
            （已浏览 {viewedIds.size}/{unit.vocab.length}）
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {unit.vocab.map((v, idx) => (
            <button
              key={v.id}
              type="button"
              onClick={() => goCard(idx)}
              aria-label={`查看单词 ${v.word}`}
              className={`h-3 rounded-full transition-all ${
                idx === index
                  ? "w-7 bg-emerald-500"
                  : viewedIds.has(v.id)
                  ? "w-3 bg-emerald-300"
                  : "w-3 bg-slate-200"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Main Big Vocab Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={card.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-3xl border-4 border-emerald-200 shadow-lg p-5 sm:p-8"
        >
          <div className="flex flex-col md:flex-row items-center gap-6">
            <button
              type="button"
              onClick={() => {
                soundEffects.playClick();
                speak(card.word, { lang: "en" });
              }}
              className="group relative flex flex-col items-center justify-center p-4 rounded-3xl bg-amber-50/60 hover:bg-amber-100/70 border-2 border-amber-200 transition cursor-pointer shrink-0"
              title="点击听发音"
            >
              <WordVisual visualKey={card.visualKey} size="lg" />
              <span className="mt-2 text-xs font-bold text-amber-700 flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5" /> 点图发音
              </span>
            </button>

            <div className="flex-1 text-center md:text-left space-y-2 min-w-0">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
                <span>拼读拆解：{card.phonicsSplit}</span>
                <span>·</span>
                <span>{card.phonetic}</span>
              </div>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900">
                {card.word}
              </h2>
              <p className="text-2xl font-extrabold text-emerald-600">{card.zh}</p>
              <p className="text-sm sm:text-base text-slate-600 bg-slate-50 rounded-2xl px-4 py-2.5 border border-slate-100">
                💡 {card.memoryTipZh}
              </p>
            </div>
          </div>

          {/* Audio + Follow-along controls */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => {
                soundEffects.playClick();
                speak(card.word, { lang: "en", slow: false });
              }}
              className="min-h-[52px] rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-base border-b-4 border-emerald-700 active:border-b-0 active:translate-y-1 transition flex items-center justify-center gap-2"
            >
              <Volume2 className="w-5 h-5" />
              <span>听一听</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundEffects.playClick();
                speak(card.word, { lang: "en", slow: true });
              }}
              className="min-h-[52px] rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-900 font-extrabold text-base border-b-4 border-amber-600 active:border-b-0 active:translate-y-1 transition flex items-center justify-center gap-2"
            >
              <span>🐌</span>
              <span>慢速蜗牛读</span>
            </button>

            <button
              type="button"
              onClick={handlePracticeSpeak}
              className={`min-h-[52px] rounded-2xl font-extrabold text-base border-b-4 active:border-b-0 active:translate-y-1 transition flex items-center justify-center gap-2 ${
                isListening && activeListenTarget === `word:${card.id}`
                  ? "bg-rose-500 text-white border-rose-700 animate-pulse"
                  : "bg-sky-500 hover:bg-sky-600 text-white border-sky-700"
              }`}
            >
              {isListening && activeListenTarget === `word:${card.id}` ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
              <span>
                {isListening && activeListenTarget === `word:${card.id}`
                  ? "正在听你说..."
                  : "我也来读一读"}
              </span>
            </button>
          </div>

          {/* Speech Feedback */}
          {(spokenResult || sttError) && (
            <div className="mt-4 rounded-2xl p-4 bg-sky-50 border-2 border-sky-200 text-sm">
              {sttError ? (
                <p className="text-sky-800 font-semibold">{sttError}</p>
              ) : spokenResult ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-800">
                      听到你说：<span className="text-sky-700">“{spokenResult.heard}”</span>
                    </div>
                    <div className="text-slate-600 mt-0.5">{spokenResult.score.feedbackZh}</div>
                  </div>
                  <div className="text-xl shrink-0">
                    {"⭐".repeat(spokenResult.score.stars)}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Example Sentence Strip */}
          <div className="mt-5 p-4 rounded-2xl bg-emerald-50/70 border-2 border-emerald-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-emerald-700 mb-0.5">情景小例句</div>
              <div className="text-lg font-extrabold text-slate-800">{card.exampleEn}</div>
              <div className="text-sm text-slate-600">{card.exampleZh}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                soundEffects.playClick();
                speak(card.exampleEn, { lang: "en" });
              }}
              className="min-h-[44px] px-4 rounded-xl bg-white hover:bg-emerald-100 text-emerald-700 font-bold text-sm border-2 border-emerald-200 flex items-center gap-1.5 shrink-0"
            >
              <Volume2 className="w-4 h-4" />
              <span>听例句</span>
            </button>
          </div>

          {/* Prev / Next Navigation */}
          <div className="mt-6 flex items-center justify-between gap-4">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => goCard(index - 1)}
              className="min-h-[48px] px-5 rounded-2xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold flex items-center gap-1.5"
            >
              <ChevronLeft className="w-5 h-5" />
              <span>上一个</span>
            </button>
            <button
              type="button"
              data-testid="next-card-btn"
              onClick={() => goCard(index + 1)}
              className="min-h-[48px] px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center gap-1.5"
            >
              <span>{index === unit.vocab.length - 1 ? "全部看完啦" : "下一个"}</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {reachedEndNotice && (
            <div className="mt-4 rounded-2xl bg-emerald-50 border-2 border-emerald-200 px-4 py-3 text-sm font-extrabold text-emerald-800 text-center">
              {allViewed
                ? `🎉 太棒啦！本关全部 ${unit.vocab.length} 张绘本卡片都看完啦，点击最下方按钮领取星星吧！`
                : `还有 ${remainingCards} 张卡片没翻到哦，点上方进度圆点去看看它们吧~`}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Core Sentences Preview + Follow-Along Practice */}
      <div className="bg-white rounded-3xl border-2 border-amber-200 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-black text-lg text-slate-800 flex items-center gap-2">
            <span>💬</span>
            <span>本单元核心魔力句型（可点读，也能开口跟读加入复习库！）</span>
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {unit.sentences.map((s) => {
            const sRes = sentenceScores[s.id];
            const isRecordingThis = isListening && activeListenTarget === `sentence:${s.id}`;
            return (
              <div
                key={s.id}
                className="text-left p-4 rounded-2xl bg-amber-50/70 border-2 border-amber-200/80 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="font-black text-base text-slate-900">{s.en}</div>
                  <div className="text-sm font-bold text-amber-800 mt-1">{s.zh}</div>
                  <div className="text-xs text-slate-600 mt-1">{s.tipZh}</div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      soundEffects.playClick();
                      speak(s.en, { lang: "en" });
                    }}
                    className="flex-1 min-h-[40px] px-3 rounded-xl bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-xs flex items-center justify-center gap-1"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>听句子</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePracticeSentence(s.id, s.en)}
                    className={`flex-1 min-h-[40px] px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition ${
                      isRecordingThis
                        ? "bg-rose-500 text-white animate-pulse"
                        : "bg-sky-500 hover:bg-sky-600 text-white"
                    }`}
                  >
                    {isRecordingThis ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    <span>{isRecordingThis ? "听你说..." : "跟读"}</span>
                  </button>
                </div>
                {sRes && (
                  <div className="text-xs font-bold text-emerald-700 bg-emerald-50 rounded-xl px-2.5 py-1.5 flex items-center justify-between">
                    <span className="truncate">“{sRes.heard}”</span>
                    <span className="shrink-0 ml-1">{"⭐".repeat(sRes.score.stars)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Flexible Gate: Complete Step Button + Free Preview Button */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <button
          type="button"
          disabled={submitting || !canClaimStars}
          onClick={handleFinish}
          data-testid="complete-story-btn"
          className={`w-full sm:w-auto min-h-[56px] px-8 rounded-2xl font-black text-lg border-b-4 active:border-b-0 active:translate-y-1 transition flex items-center justify-center gap-2 shadow-md ${
            canClaimStars
              ? "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-700"
              : "bg-slate-200 text-slate-500 border-slate-300 cursor-not-allowed"
          }`}
        >
          {isDone ? <CheckCircle2 className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
          <span>
            {submitting
              ? "正在记录星星..."
              : isDone
              ? "已学完绘本，去自然拼读小站 →"
              : allViewed
              ? "学完绘本卡片！去自然拼读小站 (+3⭐)"
              : `再翻看 ${remainingCards} 张卡片即可领 (+3⭐)`}
          </span>
        </button>

        {!canClaimStars && (
          <button
            type="button"
            onClick={() => {
              soundEffects.playClick();
              onSkipToNext();
            }}
            data-testid="skip-story-btn"
            className="min-h-[48px] px-5 rounded-2xl bg-white hover:bg-slate-50 text-slate-600 font-bold text-sm border-2 border-slate-200 flex items-center gap-1.5"
          >
            <span>先逛自然拼读</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
