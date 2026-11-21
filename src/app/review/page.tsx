"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Eye,
  Gift,
  Mic,
  MicOff,
  RotateCcw,
  Sparkles,
  Volume2,
} from "lucide-react";
import { AppShell, type ProfileSummary } from "@/components/AppShell";
import { WordVisual } from "@/components/illustrations/WordVisual";
import { DinoCharacter } from "@/components/illustrations/DinoCharacter";
import { useSpeech } from "@/hooks/useSpeech";
import { scorePronunciation } from "@/lib/speech/pronunciation-scorer";
import { soundEffects } from "@/lib/sound-effects";
import type { EnrichedReviewItem } from "@/types/api";

function deterministicHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export default function DailyReviewPage() {
  const [profile, setProfile] = useState<
    (ProfileSummary & { avatarId?: string; equippedAccessories?: string[] }) | null
  >(null);
  const [items, setItems] = useState<EnrichedReviewItem[]>([]);
  const [isWarmup, setIsWarmup] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [roundNonce, setRoundNonce] = useState(1);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [earnedStars, setEarnedStars] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [submittingPick, setSubmittingPick] = useState(false);
  const [revealBlindText, setRevealBlindText] = useState(false);
  const [fallbackToPick, setFallbackToPick] = useState(false);
  const submittingRef = useRef(false);
  const savedMissKeyRef = useRef<string | null>(null);
  const nextTimerRef = useRef<number | null>(null);
  const lastAutoSpokenKeyRef = useRef<string | null>(null);

  const { speak, isListening, sttError, startListening, stopListening, cancelListening } =
    useSpeech();

  const refreshProfileOnly = useCallback(async () => {
    try {
      const profRes = await fetch("/api/profile");
      if (profRes.ok) {
        const pd = await profRes.json();
        setProfile(pd.profile);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadData = useCallback(async () => {
    savedMissKeyRef.current = null;
    setLoading(true);
    try {
      const [profRes, revRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/review"),
      ]);
      if (profRes.ok) {
        const pd = await profRes.json();
        setProfile(pd.profile);
      }
      if (revRes.ok) {
        const rd = await revRes.json();
        setItems(rd.items ?? []);
        setIsWarmup(Boolean(rd.isWarmup));
        setDueCount(Number(rd.dueCount ?? 0));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    return () => {
      if (nextTimerRef.current !== null) {
        window.clearTimeout(nextTimerRef.current);
      }
    };
  }, [loadData]);

  const currentItem = items[idx];
  const currentItemKey = currentItem?.itemKey ?? null;
  const currentSpokenText = currentItem?.audioText || currentItem?.displayText || "";
  const effectiveMode =
    currentItem?.questionMode === "speak_card" && fallbackToPick
      ? "blind_listen"
      : currentItem?.questionMode ?? "listen_read";

  // Auto-play audio once per question/mode transition (uses stable `speak`, never loops on re-render)
  useEffect(() => {
    if (loading || completed || !currentItemKey || !currentSpokenText) return;
    if (effectiveMode === "speak_card") return;
    const speakKey = `${roundNonce}:${idx}:${currentItemKey}:${effectiveMode}`;
    if (lastAutoSpokenKeyRef.current === speakKey) return;
    lastAutoSpokenKeyRef.current = speakKey;
    void speak(currentSpokenText, { lang: "en" });
  }, [loading, completed, roundNonce, idx, currentItemKey, currentSpokenText, effectiveMode, speak]);

  const options = useMemo(() => {
    if (!currentItem) return [];
    const list = [
      {
        text: currentItem.displayText,
        zh: currentItem.zh,
        visualKey: currentItem.visualKey,
        isTarget: true,
      },
      ...currentItem.distractors.map((d) => ({
        text: d.text,
        zh: d.zh,
        visualKey: d.visualKey,
        isTarget: false,
      })),
    ];
    return list.sort(
      (a, b) =>
        deterministicHash(`${roundNonce}-${currentItem.itemKey}-${a.text}`) -
        deterministicHash(`${roundNonce}-${currentItem.itemKey}-${b.text}`)
    );
  }, [currentItem, roundNonce]);

  const submitReviewOutcome = async (correct: boolean, customSuccessPrefix?: string) => {
    if (!currentItem || submittingRef.current) return;
    if (!correct && (isWarmup || savedMissKeyRef.current === currentItem.itemKey)) return;
    submittingRef.current = true;
    setSubmittingPick(true);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemKey: currentItem.itemKey,
          itemType: currentItem.itemType,
          unitId: currentItem.unitId,
          correct,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        soundEffects.playGentleTryAgain();
        if (correct) {
          setFeedback({
            ok: false,
            msg: "进度保存失败啦，当前题目还在，请再点一次保存哦~",
          });
        }
        return;
      }

      const awarded = typeof data.starsAwarded === "number" ? data.starsAwarded : 0;

      if (correct) {
        soundEffects.playCorrect();
        setRevealBlindText(true);
        void speak(currentItem.audioText || currentItem.displayText, { lang: "en" });
        setDoneCount((c) => c + 1);
        if (awarded > 0) {
          setEarnedStars((s) => s + awarded);
          setDueCount((d) => Math.max(0, d - 1));
        }
        const starText = awarded > 0 ? ` (+${awarded}⭐)` : "（热身巩固成功！）";
        const prefix = customSuccessPrefix || "答对啦！";
        setFeedback({
          ok: true,
          msg: `${prefix}${currentItem.displayText} — ${currentItem.zh}${starText}`,
        });

        nextTimerRef.current = window.setTimeout(() => {
          if (idx + 1 >= items.length) {
            setCompleted(true);
            soundEffects.playCelebrate();
            void refreshProfileOnly();
          } else {
            setIdx((i) => i + 1);
            setFeedback(null);
            setRevealBlindText(false);
            setFallbackToPick(false);
          }
          nextTimerRef.current = null;
          submittingRef.current = false;
          setSubmittingPick(false);
        }, 900);
      } else {
        savedMissKeyRef.current = currentItem.itemKey;
      }
    } catch {
      soundEffects.playGentleTryAgain();
      if (correct) {
        setFeedback({
          ok: false,
          msg: "网络开小差啦，进度还没保存成功，请再试一次哦~",
        });
      }
    } finally {
      if (nextTimerRef.current === null) {
        submittingRef.current = false;
        setSubmittingPick(false);
      }
    }
  };

  const handlePick = async (isTarget: boolean, text: string) => {
    if (!currentItem || feedback?.ok || submittingPick) return;
    if (isTarget) {
      await submitReviewOutcome(true);
    } else {
      soundEffects.playGentleTryAgain();
      setFeedback({ ok: false, msg: `刚才点的是 ${text} 哦，再听一遍声音找找看~` });
      void speak(currentItem.audioText || currentItem.displayText, {
        lang: "en",
        slow: true,
      });
      await submitReviewOutcome(false);
    }
  };

  const handleSpeakAnswer = () => {
    if (!currentItem || feedback?.ok || submittingPick) return;
    if (isListening) {
      stopListening();
      return;
    }
    const targetPhrase = currentItem.audioText || currentItem.displayText;
    soundEffects.playClick();
    startListening(
      targetPhrase,
      (transcript) => {
        const score = scorePronunciation(transcript, targetPhrase);
        if (score.passed) {
          void submitReviewOutcome(true, `听到你说“${transcript}”！`);
        } else {
          soundEffects.playGentleTryAgain();
          setFeedback({
            ok: false,
            msg: `听到你说“${transcript}”，点小喇叭听一遍再大声试一次，或切回选卡片哦~`,
          });
        }
      },
      { lang: "en" }
    );
  };

  return (
    <AppShell profile={profile} dueReviewCount={isWarmup ? 0 : dueCount}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white rounded-3xl border-2 border-amber-200 p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-900 flex items-center justify-center text-2xl border-b-4 border-amber-600">
              <Gift className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900">每日 3 分钟复习宝箱</h1>
              <p className="text-xs sm:text-sm text-slate-500 font-semibold">
                {isWarmup
                  ? "今日暂无到期复习词，Dino 帮你准备了自由热身卡（巩固记忆不扣分）！"
                  : `根据记忆曲线为你抽取了 ${items.length} 个到期知识点，完成可赚复习星！`}
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl p-10 text-center text-slate-500 font-bold">
            正在打开复习宝箱...
          </div>
        ) : completed ? (
          <div className="bg-gradient-to-br from-amber-50 to-emerald-50 rounded-3xl border-4 border-amber-300 p-7 text-center space-y-4">
            <DinoCharacter
              mood="cheering"
              avatarId={profile?.avatarId}
              equippedAccessories={profile?.equippedAccessories ?? []}
              size={140}
            />
            <h2 className="text-2xl font-black text-slate-900">
              🎉 宝箱开启成功！本次共复习 {doneCount} 个知识点
            </h2>
            <p className="text-emerald-700 font-extrabold text-lg">
              {earnedStars > 0
                ? `总共收获 +${earnedStars} 颗闪亮复习星 ⭐`
                : "热身巩固大成功！明天到期再来开启星星宝箱吧 ✨"}
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  lastAutoSpokenKeyRef.current = null;
                  setIdx(0);
                  setRoundNonce((n) => n + 1);
                  setCompleted(false);
                  setFeedback(null);
                  setEarnedStars(0);
                  setDoneCount(0);
                  setRevealBlindText(false);
                  setFallbackToPick(false);
                  loadData();
                }}
                className="min-h-[48px] px-5 rounded-2xl bg-white border-2 border-amber-300 text-amber-800 font-bold flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>再来一组</span>
              </button>
              <Link
                href="/"
                className="min-h-[48px] px-6 rounded-2xl bg-emerald-500 text-white font-black border-b-4 border-emerald-700 flex items-center gap-1.5"
              >
                <span>回冒险地图</span>
              </Link>
            </div>
          </div>
        ) : currentItem ? (
          <div className="bg-white rounded-3xl border-4 border-emerald-200 p-5 sm:p-7 space-y-5 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-extrabold">
                来自：{currentItem.unitTitleZh} · 进度 {idx + 1} / {items.length}
              </span>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-xs font-extrabold">
                  {effectiveMode === "speak_card"
                    ? "🎙️ 高阶开口模式"
                    : effectiveMode === "blind_listen"
                    ? "🎧 进阶盲听模式"
                    : "📖 听音认读模式"}
                </span>
                <span className="text-xs font-bold text-amber-700">
                  熟练度：{"⭐".repeat(Math.max(1, currentItem.masteryLevel))}
                </span>
              </div>
            </div>

            {effectiveMode === "speak_card" ? (
              /* Mastery Lv.4-5: Look at card and speak English */
              <div className="text-center space-y-4 py-2">
                <div className="text-sm font-bold text-slate-500">
                  你已经很熟练啦！看图和中文，用英语大声说出来：
                </div>
                <div className="flex flex-col items-center gap-2">
                  <WordVisual visualKey={currentItem.visualKey} size="lg" />
                  <div className="text-2xl font-black text-slate-900">{currentItem.zh}</div>
                  {revealBlindText && (
                    <div className="text-xl font-black text-emerald-600">
                      {currentItem.displayText}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap justify-center gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={submittingPick}
                    onClick={handleSpeakAnswer}
                    className={`min-h-[56px] px-7 rounded-2xl font-black text-base border-b-4 flex items-center gap-2 transition ${
                      isListening
                        ? "bg-rose-500 text-white border-rose-700 animate-pulse"
                        : "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-700"
                    }`}
                  >
                    {isListening ? (
                      <MicOff className="w-5 h-5" />
                    ) : (
                      <Mic className="w-5 h-5" />
                    )}
                    <span>{isListening ? "点此结束" : "按这里开口说英语"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      speak(currentItem.audioText || currentItem.displayText, {
                        lang: "en",
                        slow: true,
                      })
                    }
                    className="min-h-[52px] px-4 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold border-b-4 border-amber-600 flex items-center gap-1.5"
                  >
                    <Volume2 className="w-4 h-4" />
                    <span>偷听提示</span>
                  </button>
                </div>

                <div className="flex justify-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setRevealBlindText((v) => !v)}
                    className="text-xs font-bold text-slate-500 hover:text-slate-700 underline"
                  >
                    {revealBlindText ? "隐藏英文" : "👀 偷看英文拼写"}
                  </button>
                  <button
                    type="button"
                    disabled={submittingPick}
                    onClick={() => {
                      soundEffects.playClick();
                      cancelListening();
                      setFallbackToPick(true);
                    }}
                    className="text-xs font-bold text-sky-600 hover:text-sky-700 underline"
                  >
                    不方便开麦？切换为选卡片 →
                  </button>
                </div>
              </div>
            ) : (
              /* listen_read (Lv.0-1) & blind_listen (Lv.2-3) */
              <>
                <div className="text-center space-y-3 py-2">
                  <div className="text-sm font-bold text-slate-500">
                    {effectiveMode === "blind_listen"
                      ? "🎧 竖起耳朵听发音，选出对应的小卡片！"
                      : "听一听读音，选出正确的小卡片："}
                  </div>
                  {effectiveMode === "listen_read" || revealBlindText ? (
                    <div className="text-3xl sm:text-4xl font-black text-slate-900">
                      {currentItem.displayText}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRevealBlindText(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>盲听中 · 点此偷看单词</span>
                    </button>
                  )}

                  <div className="flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        speak(currentItem.audioText || currentItem.displayText, {
                          lang: "en",
                        })
                      }
                      className="min-h-[48px] px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold border-b-4 border-emerald-700 flex items-center gap-2"
                    >
                      <Volume2 className="w-5 h-5" />
                      <span>听发音</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        speak(currentItem.audioText || currentItem.displayText, {
                          lang: "en",
                          slow: true,
                        })
                      }
                      className="min-h-[48px] px-4 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold border-b-4 border-amber-600 flex items-center gap-1.5"
                    >
                      <span>🐌 慢速</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {options.map((opt) => (
                    <button
                      key={`${opt.text}-${opt.zh}`}
                      type="button"
                      onClick={() => handlePick(opt.isTarget, opt.text)}
                      className="p-4 rounded-3xl bg-amber-50/50 hover:bg-emerald-50 border-2 border-amber-200 border-b-4 flex flex-col items-center gap-2 transition active:translate-y-0.5"
                    >
                      <WordVisual visualKey={opt.visualKey} size="md" />
                      <span className="font-black text-base text-slate-800">{opt.zh}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {sttError && (
              <div className="rounded-2xl bg-sky-50 border border-sky-200 px-4 py-2 text-xs font-bold text-sky-800">
                {sttError}
              </div>
            )}

            {feedback && (
              <div
                className={`rounded-2xl px-4 py-3 text-sm font-bold flex items-center gap-2 ${
                  feedback.ok
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {feedback.ok ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                ) : (
                  <Sparkles className="w-5 h-5 shrink-0" />
                )}
                <span>{feedback.msg}</span>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
