"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Gift, RotateCcw, Sparkles, Volume2 } from "lucide-react";
import { AppShell, type ProfileSummary } from "@/components/AppShell";
import { WordVisual } from "@/components/illustrations/WordVisual";
import { DinoCharacter } from "@/components/illustrations/DinoCharacter";
import { useSpeech } from "@/hooks/useSpeech";
import { soundEffects } from "@/lib/sound-effects";
import type { EnrichedReviewItem } from "@/app/api/review/route";

export default function DailyReviewPage() {
  const [profile, setProfile] = useState<(ProfileSummary & { equippedAccessories?: string[] }) | null>(null);
  const [items, setItems] = useState<EnrichedReviewItem[]>([]);
  const [isWarmup, setIsWarmup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [earnedStars, setEarnedStars] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [completed, setCompleted] = useState(false);

  const speech = useSpeech();

  const loadData = useCallback(async () => {
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
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentItem = items[idx];

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
    return list.sort((a, b) => a.text.localeCompare(b.text));
  }, [currentItem]);

  const handlePick = async (isTarget: boolean, text: string) => {
    if (!currentItem || feedback?.ok) return;

    if (isTarget) {
      soundEffects.playCorrect();
      speech.speak(currentItem.displayText, { lang: "en" });
      setFeedback({ ok: true, msg: `答对啦！${currentItem.displayText} — ${currentItem.zh} (+1⭐)` });
      setDoneCount((c) => c + 1);
      setEarnedStars((s) => s + 1);

      await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemKey: currentItem.itemKey,
          itemType: currentItem.itemType,
          unitId: currentItem.unitId,
          correct: true,
        }),
      }).catch(() => undefined);

      setTimeout(() => {
        if (idx + 1 >= items.length) {
          setCompleted(true);
          soundEffects.playCelebrate();
          loadData();
        } else {
          setIdx((i) => i + 1);
          setFeedback(null);
        }
      }, 800);
    } else {
      soundEffects.playGentleTryAgain();
      setFeedback({ ok: false, msg: `刚才点的是 ${text} 哦，再听一遍声音找找看~` });
      await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemKey: currentItem.itemKey,
          itemType: currentItem.itemType,
          unitId: currentItem.unitId,
          correct: false,
        }),
      }).catch(() => undefined);
    }
  };

  return (
    <AppShell profile={profile} dueReviewCount={isWarmup ? 0 : items.length}>
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
                  ? "今日暂无快遗忘词，Dino 帮你准备了热身复习卡！"
                  : `根据记忆曲线为你抽取了 ${items.length} 个需要巩固的单词/拼读`}
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
              equippedAccessories={profile?.equippedAccessories ?? []}
              size={140}
            />
            <h2 className="text-2xl font-black text-slate-900">
              🎉 宝箱开启成功！本次共复习 {doneCount} 个知识点
            </h2>
            <p className="text-emerald-700 font-extrabold text-lg">
              总共收获 +{earnedStars} 颗闪亮复习星 ⭐
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIdx(0);
                  setCompleted(false);
                  setFeedback(null);
                  setEarnedStars(0);
                  setDoneCount(0);
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
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-extrabold">
                来自：{currentItem.unitTitleZh} · 进度 {idx + 1} / {items.length}
              </span>
              <span className="text-xs font-bold text-amber-700">
                记忆熟练度：{"⭐".repeat(Math.max(1, currentItem.masteryLevel))}
              </span>
            </div>

            <div className="text-center space-y-3 py-2">
              <div className="text-sm font-bold text-slate-500">听一听读音，选出正确的小卡片：</div>
              <div className="text-3xl sm:text-4xl font-black text-slate-900">
                {currentItem.displayText}
              </div>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => speech.speak(currentItem.displayText, { lang: "en" })}
                  className="min-h-[48px] px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold border-b-4 border-emerald-700 flex items-center gap-2"
                >
                  <Volume2 className="w-5 h-5" />
                  <span>听发音</span>
                </button>
                <button
                  type="button"
                  onClick={() => speech.speak(currentItem.displayText, { lang: "en", slow: true })}
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

            {feedback && (
              <div
                className={`rounded-2xl px-4 py-3 text-sm font-bold flex items-center gap-2 ${
                  feedback.ok
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {feedback.ok ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <Sparkles className="w-5 h-5 shrink-0" />}
                <span>{feedback.msg}</span>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
