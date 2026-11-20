"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Gamepad2, MessageSquareHeart, Sparkles } from "lucide-react";
import { getUnitById } from "@/data/curriculum";
import { AppShell, type ProfileSummary } from "@/components/AppShell";
import { useSpeech } from "@/hooks/useSpeech";
import { StoryCardsTab } from "@/components/unit/StoryCardsTab";
import { PhonicsTab } from "@/components/unit/PhonicsTab";
import { MiniGamesTab } from "@/components/unit/MiniGamesTab";
import { RoleplayStageTab } from "@/components/unit/RoleplayStageTab";
import { soundEffects } from "@/lib/sound-effects";

type StepKey = "story" | "phonics" | "game" | "roleplay";

interface UnitProgressRow {
  unitId: string;
  storyDone: number;
  phonicsDone: number;
  gameDone: number;
  roleplayDone: number;
  starsEarned: number;
}

export default function UnitLearningPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = use(params);
  const unit = getUnitById(unitId);

  const [activeStep, setActiveStep] = useState<StepKey>("story");
  const [profile, setProfile] = useState<(ProfileSummary & { equippedAccessories?: string[] }) | null>(null);
  const [dueReviewCount, setDueReviewCount] = useState(0);
  const [unitProg, setUnitProg] = useState<UnitProgressRow | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const speech = useSpeech();

  const loadProfileAndProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) return;
      const data = await res.json();
      setProfile(data.profile);
      setDueReviewCount(data.dueReviewCount ?? 0);
      const found = (data.unitProgress as UnitProgressRow[] | undefined)?.find(
        (p) => p.unitId === unitId
      );
      if (found) setUnitProg(found);
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

  const completeStep = async (step: StepKey, score?: number) => {
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: unit.id, step, score }),
      });
      if (res.ok) {
        const data = await res.json();
        setUnitProg(data.unitProgress);
        if (data.profile) setProfile(data.profile);
        setToastMsg(`太棒啦！完成环节获得 +${data.starsAwarded} 颗星星 ⭐`);
        setTimeout(() => setToastMsg(null), 3200);
      }
    } catch {
      // ignore
    }

    if (step === "story") setActiveStep("phonics");
    else if (step === "phonics") setActiveStep("game");
    else if (step === "game") setActiveStep("roleplay");
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
              <div className="flex items-center gap-2">
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
                  setActiveStep(tab.key);
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

        {/* Active Step Content */}
        {activeStep === "story" && (
          <StoryCardsTab
            unit={unit}
            isDone={unitProg?.storyDone === 1}
            onComplete={() => completeStep("story")}
            speak={speech.speak}
            isListening={speech.isListening}
            sttError={speech.sttError}
            startListening={speech.startListening}
            stopListening={speech.stopListening}
          />
        )}

        {activeStep === "phonics" && (
          <PhonicsTab
            unit={unit}
            isDone={unitProg?.phonicsDone === 1}
            onComplete={() => completeStep("phonics")}
            speak={speech.speak}
          />
        )}

        {activeStep === "game" && (
          <MiniGamesTab
            unit={unit}
            isDone={unitProg?.gameDone === 1}
            onComplete={(score) => completeStep("game", score)}
            speak={speech.speak}
          />
        )}

        {activeStep === "roleplay" && (
          <RoleplayStageTab
            unit={unit}
            equippedAccessories={profile?.equippedAccessories ?? []}
            speak={speech.speak}
            isListening={speech.isListening}
            sttError={speech.sttError}
            startListening={speech.startListening}
            stopListening={speech.stopListening}
            onStarsUpdated={loadProfileAndProgress}
          />
        )}
      </div>
    </AppShell>
  );
}
