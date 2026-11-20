"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Sparkles, Volume2 } from "lucide-react";
import type { UnitDef } from "@/data/curriculum/types";
import { WordVisual } from "@/components/illustrations/WordVisual";
import { soundEffects } from "@/lib/sound-effects";

interface PhonicsTabProps {
  unit: UnitDef;
  isDone: boolean;
  onComplete: () => Promise<void>;
  speak: (text: string, opts?: { lang?: "en" | "zh"; slow?: boolean }) => Promise<void>;
}

export function PhonicsTab({ unit, isDone, onComplete, speak }: PhonicsTabProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizFeedback, setQuizFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [quizCleared, setQuizCleared] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const activeItem = unit.phonics[selectedIdx] ?? unit.phonics[0];

  const quizQuestions = useMemo(() => {
    return unit.phonics.slice(0, 3).map((item, idx) => {
      const targetWord = item.sampleWords[0]?.word ?? item.letter;
      const others = unit.phonics.filter((p) => p.id !== item.id);
      const options = [
        item,
        ...others.slice(0, Math.min(2, others.length)),
      ].sort((a, b) => ((a.letter.charCodeAt(0) + idx) % 5) - ((b.letter.charCodeAt(0) + idx) % 5));
      return {
        target: item,
        audioPrompt: item.isCvc ? targetWord : `${item.sampleWords[0]?.word ?? item.letter}`,
        options,
      };
    });
  }, [unit.phonics]);

  const currentQuiz = quizQuestions[quizIdx];

  const handleQuizPick = (pickedId: string) => {
    if (!currentQuiz) return;
    if (pickedId === currentQuiz.target.id) {
      soundEffects.playCorrect();
      if (quizIdx + 1 >= quizQuestions.length) {
        setQuizCleared(true);
        setQuizFeedback({
          ok: true,
          msg: "太棒啦！全部拼读小测验答对，耳朵真灵！",
        });
      } else {
        setQuizFeedback({
          ok: true,
          msg: `答对啦！就是 ${currentQuiz.target.letter} (${currentQuiz.target.soundLabel})！进入下一题~`,
        });
        setTimeout(() => {
          setQuizIdx((i) => i + 1);
          setQuizFeedback(null);
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

  const handleFinish = async () => {
    if (submitting) return;
    setSubmitting(true);
    soundEffects.playCelebrate();
    try {
      await onComplete();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Letter Selector Pills */}
      <div className="flex flex-wrap items-center gap-2.5">
        {unit.phonics.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              soundEffects.playClick();
              setSelectedIdx(idx);
              speak(item.sampleWords[0]?.word ?? item.letter, { lang: "en", slow: true });
            }}
            className={`min-h-[52px] px-5 rounded-2xl font-black text-xl border-b-4 transition ${
              selectedIdx === idx
                ? "bg-amber-400 text-slate-900 border-amber-600 shadow-sm"
                : "bg-white text-slate-700 border-slate-200 hover:bg-amber-50"
            }`}
          >
            {item.letter}
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
                speak(activeItem.sampleWords[0]?.word ?? activeItem.letter, {
                  lang: "en",
                  slow: true,
                });
              }}
              className="w-32 h-32 rounded-3xl bg-gradient-to-br from-amber-300 to-orange-400 text-white border-b-4 border-orange-600 shadow-md flex flex-col items-center justify-center shrink-0 hover:scale-105 transition"
            >
              <span className={activeItem.isCvc ? "text-3xl font-black" : "text-5xl font-black"}>
                {activeItem.letter}
              </span>
              <span className="text-sm font-bold bg-black/15 px-2.5 py-0.5 rounded-full mt-1">
                {activeItem.soundLabel}
              </span>
            </button>

            <div className="flex-1 space-y-3 text-center sm:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-bold">
                <span>{activeItem.isCvc ? "CVC 拼读魔法合体" : "Jolly Phonics 自然拼读口诀"}</span>
              </div>
              <p className="text-lg sm:text-xl font-extrabold text-slate-800 leading-relaxed">
                {activeItem.mnemonicZh}
              </p>
              <p className="text-sm text-slate-600 bg-amber-50/70 rounded-2xl px-4 py-2.5 border border-amber-100">
                👄 发音小窍门：{activeItem.mouthTipZh}
              </p>
            </div>
          </div>

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
                    speak(sw.word, { lang: "en", slow: true });
                  }}
                  className="p-4 rounded-2xl bg-slate-50 hover:bg-emerald-50 border-2 border-slate-200 hover:border-emerald-300 transition flex items-center gap-3 text-left min-h-[76px]"
                >
                  <WordVisual visualKey={sw.visualKey} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xl font-black text-slate-900">
                      {sw.word.toLowerCase().startsWith(sw.highlight.toLowerCase()) ? (
                        <>
                          <span className="text-orange-500">
                            {sw.word.slice(0, sw.highlight.length)}
                          </span>
                          <span>{sw.word.slice(sw.highlight.length)}</span>
                        </>
                      ) : (
                        sw.word
                      )}
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
                soundEffects.playClick();
                speak(currentQuiz.audioPrompt, { lang: "en", slow: true });
              }}
              className="min-h-[48px] px-5 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-extrabold border-b-4 border-sky-700 flex items-center justify-center gap-2 shrink-0"
            >
              <Volume2 className="w-5 h-5" />
              <span>听声音</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {currentQuiz.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={quizCleared}
                onClick={() => handleQuizPick(opt.id)}
                className="min-h-[72px] rounded-2xl bg-white hover:bg-amber-50 border-2 border-sky-200 border-b-4 font-black text-2xl text-slate-800 transition active:translate-y-0.5"
              >
                <div>{opt.letter}</div>
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

      {/* Complete Phonics Step */}
      <div className="flex justify-center pt-2">
        <button
          type="button"
          disabled={submitting}
          onClick={handleFinish}
          data-testid="complete-phonics-btn"
          className="w-full sm:w-auto min-h-[56px] px-8 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-black text-lg border-b-4 border-emerald-700 active:border-b-0 active:translate-y-1 transition flex items-center justify-center gap-2 shadow-md"
        >
          {isDone ? <CheckCircle2 className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
          <span>
            {submitting
              ? "正在记录..."
              : isDone
              ? "已学会拼读，去玩趣味小游戏 →"
              : "拼读学会啦！去趣味闯关游戏 (+3⭐)"}
          </span>
        </button>
      </div>
    </div>
  );
}
