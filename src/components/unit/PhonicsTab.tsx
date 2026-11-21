"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Mic, MicOff, Sparkles, TrainFront, Volume2 } from "lucide-react";
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

interface PhonicsTabProps {
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

export function PhonicsTab({
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
}: PhonicsTabProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizFeedback, setQuizFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [quizCleared, setQuizCleared] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeBlendIdx, setActiveBlendIdx] = useState<number | null>(null);
  const [spokenResult, setSpokenResult] = useState<{
    heard: string;
    score: PronunciationScoreResult;
  } | null>(null);

  const quizTimerRef = useRef<number | null>(null);
  const blendTimersRef = useRef<number[]>([]);
  const hasInteractedQuizRef = useRef(false);
  const isActiveRef = useRef(isActive);
  const lastSpokenQuizIdxRef = useRef<number | null>(null);

  useEffect(() => {
    isActiveRef.current = isActive;
    if (!isActive) {
      for (const id of blendTimersRef.current) {
        window.clearTimeout(id);
      }
      blendTimersRef.current = [];
      setActiveBlendIdx(null);
    }
  }, [isActive]);

  useEffect(() => {
    return () => {
      if (quizTimerRef.current !== null) {
        window.clearTimeout(quizTimerRef.current);
      }
      for (const id of blendTimersRef.current) {
        window.clearTimeout(id);
      }
    };
  }, []);

  const activeItem = unit.phonics[selectedIdx] ?? unit.phonics[0];

  const quizQuestions = useMemo(() => {
    // Cover up to 4 phonics items cleanly (so U10 6-CVC units test more than 3, and U2-U9 include CVC)
    const maxQuestions = Math.min(4, unit.phonics.length);
    const chosen = unit.phonics.slice(0, maxQuestions);
    return chosen.map((item, idx) => {
      const sample = item.sampleWords[0];
      const targetWord = sample?.word ?? item.letter;
      const others = unit.phonics.filter((p) => p.id !== item.id);
      const options = [
        item,
        ...others.slice(0, Math.min(2, others.length)),
      ].sort(
        (a, b) =>
          ((a.letter.charCodeAt(0) + idx) % 7) - ((b.letter.charCodeAt(0) + idx) % 7)
      );
      return {
        target: item,
        sampleVisualKey: sample?.visualKey ?? "star",
        audioPrompt: targetWord,
        options,
      };
    });
  }, [unit.phonics]);

  const currentQuiz = quizQuestions[quizIdx];

  // Auto-play audio when advancing to the next question ONLY while PhonicsTab is active
  useEffect(() => {
    if (!isActive || !hasInteractedQuizRef.current || !currentQuiz || quizCleared) return;
    if (lastSpokenQuizIdxRef.current === quizIdx) return;
    lastSpokenQuizIdxRef.current = quizIdx;
    void speak(currentQuiz.audioPrompt, { lang: "en", slow: true });
  }, [isActive, quizIdx, currentQuiz, quizCleared, speak]);

  const handleBlendTrain = () => {
    if (!activeItem?.blendParts || activeItem.blendParts.length === 0) return;
    for (const id of blendTimersRef.current) {
      window.clearTimeout(id);
    }
    blendTimersRef.current = [];
    soundEffects.playClick();

    activeItem.blendParts.forEach((_, idx) => {
      const tid = window.setTimeout(() => {
        if (!isActiveRef.current) return;
        setActiveBlendIdx(idx);
        soundEffects.playPop();
      }, idx * 360);
      blendTimersRef.current.push(tid);
    });

    const finalTid = window.setTimeout(() => {
      if (!isActiveRef.current) return;
      setActiveBlendIdx(activeItem.blendParts!.length);
      soundEffects.playCorrect();
      void speak(activeItem.sampleWords[0]?.word ?? activeItem.letter.toLowerCase(), {
        lang: "en",
        slow: true,
      });
    }, activeItem.blendParts.length * 360 + 140);
    blendTimersRef.current.push(finalTid);

    const resetTid = window.setTimeout(() => {
      if (!isActiveRef.current) return;
      setActiveBlendIdx(null);
    }, activeItem.blendParts.length * 360 + 1300);
    blendTimersRef.current.push(resetTid);
  };

  const handlePracticePhonicsSpeak = () => {
    if (!activeItem) return;
    if (isListening) {
      stopListening();
      return;
    }
    const targetWord = activeItem.sampleWords[0]?.word ?? activeItem.letter.toLowerCase();
    const hints = activeItem.sampleWords.map((w) => w.word).join(", ");
    soundEffects.playClick();
    setSpokenResult(null);
    startListening(
      hints,
      (transcript) => {
        const res = scorePronunciation(transcript, targetWord);
        setSpokenResult({ heard: transcript, score: res });
        if (res.passed) soundEffects.playCorrect();
        else soundEffects.playGentleTryAgain();
      },
      { lang: "en" }
    );
  };

  const handleQuizPick = (pickedId: string) => {
    if (!currentQuiz || quizCleared || advancing) return;
    hasInteractedQuizRef.current = true;
    const targetId = currentQuiz.target.id;

    if (pickedId === targetId) {
      soundEffects.playCorrect();
      if (quizIdx + 1 >= quizQuestions.length) {
        setQuizCleared(true);
        setQuizFeedback({
          ok: true,
          msg: "太棒啦！全部拼读小测验答对，耳朵真灵！快点下方领星星吧！",
        });
      } else {
        setAdvancing(true);
        const label = currentQuiz.target.lowercase
          ? `${currentQuiz.target.letter} ${currentQuiz.target.lowercase}`
          : currentQuiz.target.letter;
        setQuizFeedback({
          ok: true,
          msg: `答对啦！就是 ${label} (${currentQuiz.target.soundLabel})！进入下一题~`,
        });
        quizTimerRef.current = window.setTimeout(() => {
          setQuizIdx((i) => i + 1);
          setQuizFeedback(null);
          setAdvancing(false);
          quizTimerRef.current = null;
        }, 700);
      }
    } else {
      soundEffects.playGentleTryAgain();
      setQuizFeedback({
        ok: false,
        msg: "差一点点哦，再听一遍例词开头的声音试试看！",
      });
    }
  };

  const canClaimStars = quizCleared || isDone;

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
      const practicedItems: PracticedItem[] = unit.phonics.map((p) => ({
        itemKey: p.id,
        itemType: "phonics",
        correct: true,
      }));
      await onComplete(practicedItems);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Letter & CVC Selector Pills */}
      <div className="flex flex-wrap items-center gap-2.5">
        {unit.phonics.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              soundEffects.playClick();
              setSelectedIdx(idx);
              setActiveBlendIdx(null);
              setSpokenResult(null);
              void speak(item.sampleWords[0]?.word ?? item.letter, { lang: "en", slow: true });
            }}
            className={`min-h-[52px] px-4 sm:px-5 rounded-2xl font-black text-lg sm:text-xl border-b-4 transition flex items-center gap-1.5 ${
              selectedIdx === idx
                ? "bg-amber-400 text-slate-900 border-amber-600 shadow-sm"
                : item.isCvc
                ? "bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100"
                : "bg-white text-slate-700 border-slate-200 hover:bg-amber-50"
            }`}
          >
            {item.isCvc && <span className="text-sm">🚂</span>}
            <span>{item.lowercase ? `${item.letter} ${item.lowercase}` : item.letter}</span>
          </button>
        ))}
      </div>

      {/* Active Phonics Card */}
      {activeItem && (
        <div className="bg-white rounded-3xl border-4 border-amber-200 shadow-lg p-5 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <button
              type="button"
              onClick={() => {
                soundEffects.playClick();
                void speak(activeItem.sampleWords[0]?.word ?? activeItem.letter, {
                  lang: "en",
                  slow: true,
                });
              }}
              className="w-36 h-36 rounded-3xl bg-gradient-to-br from-amber-300 to-orange-400 text-white border-b-4 border-orange-600 shadow-md flex flex-col items-center justify-center shrink-0 hover:scale-105 transition"
            >
              {activeItem.lowercase ? (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-5xl font-black">{activeItem.letter}</span>
                  <span className="text-4xl font-extrabold text-amber-50">
                    {activeItem.lowercase}
                  </span>
                </div>
              ) : (
                <span className="text-3xl font-black tracking-wide">{activeItem.letter}</span>
              )}
              <span className="text-xs sm:text-sm font-bold bg-black/15 px-2.5 py-0.5 rounded-full mt-1.5">
                {activeItem.soundLabel}
              </span>
            </button>

            <div className="flex-1 space-y-3 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-bold">
                  {activeItem.isCvc ? "🚂 CVC 拼读魔法合体" : "Jolly Phonics 大小写与自然拼读"}
                </span>
                <button
                  type="button"
                  onClick={handlePracticePhonicsSpeak}
                  className={`min-h-[36px] px-3.5 rounded-full text-xs font-extrabold flex items-center gap-1 transition ${
                    isListening
                      ? "bg-rose-500 text-white animate-pulse"
                      : "bg-sky-500 hover:bg-sky-600 text-white"
                  }`}
                >
                  {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  <span>
                    {isListening
                      ? "正在听..."
                      : `跟读「${activeItem.sampleWords[0]?.word ?? activeItem.letter}」`}
                  </span>
                </button>
              </div>
              <p className="text-lg sm:text-xl font-extrabold text-slate-800 leading-relaxed">
                {activeItem.mnemonicZh}
              </p>
              <p className="text-sm text-slate-600 bg-amber-50/70 rounded-2xl px-4 py-2.5 border border-amber-100">
                👄 发音小窍门：{activeItem.mouthTipZh}
              </p>
              {activeItem.confusableTipZh && (
                <p className="text-sm text-indigo-800 bg-indigo-50 rounded-2xl px-4 py-2.5 border border-indigo-200 font-bold">
                  🔎 易混字母分辨：{activeItem.confusableTipZh}
                </p>
              )}
            </div>
          </div>

          {/* Speech Feedback on Phonics Card */}
          {(spokenResult || sttError) && (
            <div className="rounded-2xl p-3.5 bg-sky-50 border-2 border-sky-200 text-sm flex items-center justify-between gap-2">
              {sttError ? (
                <span className="text-sky-800 font-semibold">{sttError}</span>
              ) : spokenResult ? (
                <>
                  <div>
                    <span className="font-bold text-slate-800">
                      听到你说：“{spokenResult.heard}” ·{" "}
                    </span>
                    <span className="text-slate-600">{spokenResult.score.feedbackZh}</span>
                  </div>
                  <span className="text-lg shrink-0">{"⭐".repeat(spokenResult.score.stars)}</span>
                </>
              ) : null}
            </div>
          )}

          {/* Interactive CVC Blending Train */}
          {activeItem.isCvc && activeItem.blendParts && activeItem.blendParts.length > 0 && (
            <div className="rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-black text-orange-900 flex items-center gap-1.5">
                  <TrainFront className="w-4 h-4 text-orange-600" />
                  <span>CVC 拼读小火车（点字母或一键滑读合体！）</span>
                </div>
                <button
                  type="button"
                  onClick={handleBlendTrain}
                  className="min-h-[40px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs border-b-2 border-orange-700 flex items-center gap-1.5"
                >
                  <span>🚂 一键滑读合体</span>
                </button>
              </div>
              <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
                {activeItem.blendParts.map((part, pIdx) => {
                  const lit = activeBlendIdx !== null && activeBlendIdx >= pIdx;
                  return (
                    <div key={`${activeItem.id}-p-${pIdx}`} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          soundEffects.playPop();
                          setActiveBlendIdx(pIdx);
                          void speak(part, { lang: "en", slow: true });
                        }}
                        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border-2 border-b-4 font-black text-2xl sm:text-3xl transition transform ${
                          lit
                            ? "bg-orange-400 text-white border-orange-600 scale-110 shadow-md"
                            : "bg-white text-slate-800 border-orange-200 hover:bg-orange-100"
                        }`}
                      >
                        {part}
                      </button>
                      {pIdx < activeItem.blendParts!.length - 1 && (
                        <span className="text-orange-400 font-black text-xl">+</span>
                      )}
                    </div>
                  );
                })}
                <span className="text-orange-500 font-black text-xl mx-1">→</span>
                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playCorrect();
                    void speak(activeItem.sampleWords[0]?.word ?? activeItem.letter.toLowerCase(), {
                      lang: "en",
                    });
                  }}
                  className={`min-h-[56px] px-5 rounded-2xl border-2 border-b-4 font-black text-2xl transition ${
                    activeBlendIdx !== null && activeBlendIdx >= activeItem.blendParts.length
                      ? "bg-emerald-500 text-white border-emerald-700 scale-105 shadow-md"
                      : "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  }`}
                >
                  {activeItem.sampleWords[0]?.word ?? activeItem.letter.toLowerCase()}
                </button>
              </div>
            </div>
          )}

          {/* 3 Sample Words */}
          <div>
            <div className="text-sm font-extrabold text-slate-700 mb-3">
              点一点，听听拼读例词里的魔法声音：
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {activeItem.sampleWords.map((sw) => (
                <button
                  key={sw.word}
                  type="button"
                  onClick={() => {
                    soundEffects.playClick();
                    void speak(sw.word, { lang: "en", slow: true });
                  }}
                  className="p-4 rounded-2xl bg-slate-50 hover:bg-emerald-50 border-2 border-slate-200 hover:border-emerald-300 transition flex items-center gap-3 text-left min-h-[76px]"
                >
                  <WordVisual visualKey={sw.visualKey} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xl font-black text-slate-900">
                      {(() => {
                        const hl = sw.highlight;
                        const matchIdx = hl
                          ? sw.word.toLowerCase().indexOf(hl.toLowerCase())
                          : -1;
                        if (matchIdx === -1) return sw.word;
                        const before = sw.word.slice(0, matchIdx);
                        const middle = sw.word.slice(matchIdx, matchIdx + hl.length);
                        const after = sw.word.slice(matchIdx + hl.length);
                        return (
                          <>
                            <span>{before}</span>
                            <span className="text-orange-500">{middle}</span>
                            <span>{after}</span>
                          </>
                        );
                      })()}
                    </div>
                    <div className="text-sm font-bold text-slate-600">{sw.zh}</div>
                  </div>
                  <Volume2 className="w-5 h-5 text-emerald-600 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mini Ear-Training Quiz */}
      {currentQuiz && (
        <div className="bg-sky-50 rounded-3xl border-2 border-sky-200 p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-lg text-slate-800">
                🎧 听音找字母朋友（第 {quizIdx + 1} / {quizQuestions.length} 题）
              </h3>
              <p className="text-sm text-slate-600">
                先点蓝色喇叭听单词读音，再选出对应的是哪个字母/拼读组合！
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                hasInteractedQuizRef.current = true;
                soundEffects.playClick();
                void speak(currentQuiz.audioPrompt, { lang: "en", slow: true });
              }}
              className="min-h-[48px] px-5 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-extrabold border-b-4 border-sky-700 flex items-center justify-center gap-2 shrink-0"
            >
              <Volume2 className="w-5 h-5" />
              <span>听声音</span>
            </button>
          </div>

          {/* Disambiguation visual hint (e.g. C /k/ _at vs K /k/ _ite) */}
          {currentQuiz.target.quizHintMask && (
            <div className="flex items-center justify-center gap-3 bg-white/90 rounded-2xl p-3 border border-sky-200">
              <WordVisual visualKey={currentQuiz.sampleVisualKey} size="sm" />
              <div className="text-base font-black text-sky-900">
                提示词形：<span className="text-orange-600">{currentQuiz.target.quizHintMask}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {currentQuiz.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`phonics-option-${opt.id}`}
                disabled={quizCleared || advancing}
                onClick={() => handleQuizPick(opt.id)}
                className="min-h-[76px] rounded-2xl bg-white hover:bg-amber-50 border-2 border-sky-200 border-b-4 font-black text-2xl text-slate-800 transition active:translate-y-0.5"
              >
                <div>{opt.lowercase ? `${opt.letter} ${opt.lowercase}` : opt.letter}</div>
                <div className="text-xs font-bold text-slate-500 mt-0.5">{opt.soundLabel}</div>
              </button>
            ))}
          </div>

          {quizFeedback && (
            <div
              className={`rounded-2xl px-4 py-3 text-sm font-bold ${
                quizFeedback.ok
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {quizFeedback.msg}
            </div>
          )}
        </div>
      )}

      {/* Flexible Gate: Complete Phonics Step */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <button
          type="button"
          disabled={submitting || !canClaimStars}
          onClick={handleFinish}
          data-testid="complete-phonics-btn"
          className={`w-full sm:w-auto min-h-[56px] px-8 rounded-2xl font-black text-lg border-b-4 active:border-b-0 active:translate-y-1 transition flex items-center justify-center gap-2 shadow-md ${
            canClaimStars
              ? "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-700"
              : "bg-slate-200 text-slate-500 border-slate-300 cursor-not-allowed"
          }`}
        >
          {isDone ? <CheckCircle2 className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
          <span>
            {submitting
              ? "正在记录..."
              : isDone
              ? "已学会拼读，去玩趣味小游戏 →"
              : quizCleared
              ? "拼读学会啦！去趣味闯关游戏 (+3⭐)"
              : "完成上方听音小测验即可领 (+3⭐)"}
          </span>
        </button>

        {!canClaimStars && (
          <button
            type="button"
            onClick={() => {
              soundEffects.playClick();
              onSkipToNext();
            }}
            data-testid="skip-phonics-btn"
            className="min-h-[48px] px-5 rounded-2xl bg-white hover:bg-slate-50 text-slate-600 font-bold text-sm border-2 border-slate-200 flex items-center gap-1.5"
          >
            <span>先去玩趣味游戏</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
