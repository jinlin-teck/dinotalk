"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Gamepad2, Gift, MessageSquareHeart, Sparkles, X } from "lucide-react";
import { getUnitById, L0_UNITS } from "@/data/curriculum";
import { AppShell, type ProfileSummary } from "@/components/AppShell";
import { useSpeech } from "@/hooks/useSpeech";
import { StoryCardsTab } from "@/components/unit/StoryCardsTab";
import { PhonicsTab } from "@/components/unit/PhonicsTab";
import { MiniGamesTab } from "@/components/unit/MiniGamesTab";
import { RoleplayStageTab } from "@/components/unit/RoleplayStageTab";
import { soundEffects } from "@/lib/sound-effects";
import { isMasteryItemWeak } from "@/lib/srs";
import type {
  CurriculumItemType,
  UnlockedAccessoryNotice,
} from "@/types/api";

type StepKey = "story" | "phonics" | "game" | "roleplay";

interface UnitProgressRow {
  unitId: string;
  storyDone: number;
  phonicsDone: number;
  gameDone: number;
  roleplayDone: number;
  starsEarned: number;
}

interface WordMasteryRow {
  itemKey: string;
  unitId: string;
  masteryLevel: number;
  wrongCount: number;
  nextReviewAt?: string | null;
}

export interface PracticedItemPayload {
  itemKey: string;
  itemType: CurriculumItemType;
  correct: boolean;
}

export default function UnitLearningPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = use(params);
  const unit = getUnitById(unitId);

  const [activeStep, setActiveStep] = useState<StepKey>("story");
  const activeStepRef = useRef<StepKey>("story");
  const [mountedSteps, setMountedSteps] = useState<Set<StepKey>>(() => new Set(["story"]));
  const [profile, setProfile] = useState<
    (ProfileSummary & { avatarId?: string; equippedAccessories?: string[] }) | null
  >(null);
  const [dueReviewCount, setDueReviewCount] = useState(0);
  const [unitProg, setUnitProg] = useState<UnitProgressRow | null>(null);
  const [weakVocabIds, setWeakVocabIds] = useState<string[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [unlockedBanner, setUnlockedBanner] = useState<UnlockedAccessoryNotice | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const speech = useSpeech();
  const { cancelListening, clearSttError, stopSpeaking } = speech;

  const nextUnit = useMemo(() => {
    if (!unit) return undefined;
    return L0_UNITS.find((u) => u.order === unit.order + 1);
  }, [unit]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg(null);
      toastTimerRef.current = null;
    }, 3600);
  }, []);

  const switchStep = useCallback((step: StepKey) => {
    if (activeStepRef.current === step) return;
    activeStepRef.current = step;
    cancelListening();
    clearSttError();
    stopSpeaking();
    setActiveStep(step);
    setMountedSteps((prev) => {
      if (prev.has(step)) return prev;
      const next = new Set(prev);
      next.add(step);
      return next;
    });
  }, [cancelListening, clearSttError, stopSpeaking]);

  const loadProfileAndProgress = useCallback(async () => {
    try {
      const [profRes, progRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/progress"),
      ]);
      if (profRes.ok) {
        const data = await profRes.json();
        setProfile(data.profile);
        setDueReviewCount(data.dueReviewCount ?? 0);
        const found = (data.unitProgress as UnitProgressRow[] | undefined)?.find(
          (p) => p.unitId === unitId
        );
        if (found) setUnitProg(found);
      }
      if (progRes.ok) {
        const pd = await progRes.json();
        const mastery = (pd.wordMastery as WordMasteryRow[] | undefined) ?? [];
        const weak = mastery
          .filter(
            (m) =>
              m.unitId === unitId &&
              isMasteryItemWeak({
                masteryLevel: m.masteryLevel,
                wrongCount: m.wrongCount,
                nextReviewAt: m.nextReviewAt,
              })
          )
          .map((m) => m.itemKey);
        setWeakVocabIds(weak);
      }
    } catch {
      // ignore
    }
  }, [unitId]);

  useEffect(() => {
    loadProfileAndProgress();
  }, [loadProfileAndProgress]);

  if (!unit) {
    return (
      <AppShell>
        <div className="bg-white rounded-3xl p-8 text-center border-2 border-amber-200">
          <h1 className="text-2xl font-black text-slate-800 mb-3">哎呀，这座小岛还没找到</h1>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-500 text-white font-bold"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>回到冒险地图</span>
          </Link>
        </div>
      </AppShell>
    );
  }

  const completeStep = async (
    step: Exclude<StepKey, "roleplay">,
    options?: { score?: number; practicedItems?: PracticedItemPayload[] }
  ) => {
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: unit.id,
          step,
          score: options?.score,
          practicedItems:
            options?.practicedItems && options.practicedItems.length > 0
              ? options.practicedItems
              : undefined,
        }),
      });
      if (!res.ok) throw new Error("progress_failed");
      const data = await res.json();
      setUnitProg(data.unitProgress);
      if (data.profile) setProfile(data.profile);
      showToast(data.starsAwarded > 0
        ? `太棒啦！完成环节获得 +${data.starsAwarded} 颗星星 ⭐`
        : "这次练习的成绩已记录！");
      if (data.unlockedAccessory) {
        if (activeStepRef.current === step) soundEffects.playUnlock();
        setUnlockedBanner(data.unlockedAccessory);
      }
    } catch {
      showToast("进度还没保存成功，点一下再试试哦~");
      return false;
    }

    if (activeStepRef.current === step) {
      const nextStep = { story: "phonics", phonics: "game", game: "roleplay" } as const;
      switchStep(nextStep[step]);
    }
    return true;
  };

  const tabs: Array<{
    key: StepKey;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    done: boolean;
  }> = [
    { key: "story", label: "1. 绘本点读", icon: BookOpen, done: unitProg?.storyDone === 1 },
    { key: "phonics", label: "2. 自然拼读", icon: Sparkles, done: unitProg?.phonicsDone === 1 },
    { key: "game", label: "3. 趣味游戏", icon: Gamepad2, done: unitProg?.gameDone === 1 },
    {
      key: "roleplay",
      label: "4. AI剧场",
      icon: MessageSquareHeart,
      done: unitProg?.roleplayDone === 1,
    },
  ];

  return (
    <AppShell profile={profile} dueReviewCount={dueReviewCount}>
      <div className="space-y-5">
        {/* Unit Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-3xl p-4 sm:p-5 border-2 border-emerald-100 shadow-xs">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              onClick={() => soundEffects.playClick()}
              aria-label="返回地图"
              className="w-11 h-11 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xl">{unit.badgeEmoji}</span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black">
                  第 {unit.order} 关
                </span>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">{unit.titleZh}</h1>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 font-semibold mt-0.5">
                {unit.titleEn} · {unit.subtitleZh}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-2xl px-3.5 py-2 self-start sm:self-center">
            <span className="text-sm font-extrabold text-amber-800">本关星数：</span>
            <span className="text-base">
              {"⭐".repeat(unitProg?.starsEarned ?? 0)}
              {"☆".repeat(Math.max(0, 4 - (unitProg?.starsEarned ?? 0)))}
            </span>
          </div>
        </div>

        {/* Toast */}
        {toastMsg && (
          <div className="rounded-2xl bg-emerald-500 text-white font-black text-center py-3 px-4 shadow-md">
            {toastMsg}
          </div>
        )}

        {/* Exclusive Accessory Unlock Banner */}
        {unlockedBanner && (
          <div
            data-testid="unlocked-accessory-banner"
            className="rounded-3xl bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-300 border-2 border-amber-500 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md"
          >
            <div className="flex items-center gap-3 text-slate-900">
              <span className="w-12 h-12 rounded-2xl bg-white/80 flex items-center justify-center text-3xl shrink-0">
                {unlockedBanner.emoji}
              </span>
              <div>
                <div className="font-black text-base flex items-center gap-1.5">
                  <Gift className="w-4 h-4" />
                  <span>满 4 星专属装扮解锁：{unlockedBanner.nameZh}！</span>
                </div>
                <div className="text-xs font-bold text-slate-800">{unlockedBanner.descZh}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/pet"
                onClick={() => soundEffects.playClick()}
                className="min-h-[48px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs flex items-center"
              >
                去恐龙小屋试穿 →
              </Link>
              <button
                type="button"
                aria-label="关闭装扮解锁提示"
                onClick={() => setUnlockedBanner(null)}
                className="w-12 h-12 rounded-xl hover:bg-white/70 text-slate-900 grid place-items-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* 4-Step Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeStep === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                data-testid={`tab-${tab.key}`}
                onClick={() => {
                  soundEffects.playClick();
                  switchStep(tab.key);
                }}
                className={`min-h-[54px] px-3 py-2.5 rounded-2xl font-extrabold text-sm border-b-4 transition flex items-center justify-center gap-1.5 ${
                  active
                    ? "bg-emerald-500 text-white border-emerald-700 shadow-sm"
                    : tab.done
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
                {tab.done && <span>✓</span>}
              </button>
            );
          })}
        </div>

        {/* Keep visited tabs mounted to preserve in-progress state */}
        {mountedSteps.has("story") && (
          <div className={activeStep === "story" ? "" : "hidden"}>
            <StoryCardsTab
              key={`story-${unit.id}`}
              unit={unit}
              isDone={unitProg?.storyDone === 1}
              isActive={activeStep === "story"}
              onComplete={(practicedItems) => completeStep("story", { practicedItems })}
              onSkipToNext={() => switchStep("phonics")}
              speak={speech.speak}
              isListening={speech.isListening}
              sttError={speech.sttError}
              startListening={speech.startListening}
              stopListening={speech.stopListening}
            />
          </div>
        )}

        {mountedSteps.has("phonics") && (
          <div className={activeStep === "phonics" ? "" : "hidden"}>
            <PhonicsTab
              key={`phonics-${unit.id}`}
              unit={unit}
              isDone={unitProg?.phonicsDone === 1}
              isActive={activeStep === "phonics"}
              onComplete={(practicedItems) => completeStep("phonics", { practicedItems })}
              onSkipToNext={() => switchStep("game")}
              speak={speech.speak}
              isListening={speech.isListening}
              sttError={speech.sttError}
              startListening={speech.startListening}
              stopListening={speech.stopListening}
            />
          </div>
        )}

        {mountedSteps.has("game") && (
          <div className={activeStep === "game" ? "" : "hidden"}>
            <MiniGamesTab
              key={`game-${unit.id}`}
              unit={unit}
              isDone={unitProg?.gameDone === 1}
              isActive={activeStep === "game"}
              weakVocabIds={weakVocabIds}
              onComplete={(score, practicedItems) =>
                completeStep("game", { score, practicedItems })
              }
              onSkipToNext={() => switchStep("roleplay")}
              speak={speech.speak}
            />
          </div>
        )}

        {mountedSteps.has("roleplay") && (
          <div className={activeStep === "roleplay" ? "" : "hidden"}>
            <RoleplayStageTab
              key={`roleplay-${unit.id}`}
              unit={unit}
              isActive={activeStep === "roleplay"}
              childNickname={profile?.nickname}
              avatarId={profile?.avatarId}
              equippedAccessories={profile?.equippedAccessories ?? []}
              nextUnit={nextUnit}
              ttsAutoPlayZh={speech.ttsAutoPlayZh}
              audioMeterRef={speech.audioMeterRef}
              listenCountdownSec={speech.listenCountdownSec}
              speak={speech.speak}
              speakSequence={speech.speakSequence}
              isListening={speech.isListening}
              sttError={speech.sttError}
              startListening={speech.startListening}
              stopListening={speech.stopListening}
              cancelListening={speech.cancelListening}
              onStarsUpdated={loadProfileAndProgress}
              onUnlockedAccessory={(acc) => {
                if (activeStepRef.current === "roleplay") soundEffects.playUnlock();
                setUnlockedBanner(acc);
              }}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
