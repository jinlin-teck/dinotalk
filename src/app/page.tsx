"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Award, Compass, Gift, Lock, Play, Sparkles, Star } from "lucide-react";
import { AppShell, type ProfileSummary } from "@/components/AppShell";
import { DinoCharacter } from "@/components/illustrations/DinoCharacter";
import {
  CURRICULUM_LEVELS,
  getUnitRewardAccessory,
  L0_UNITS,
} from "@/data/curriculum";
import { soundEffects } from "@/lib/sound-effects";
import type { TodayLogSummary } from "@/types/api";

interface UnitProgressRow {
  unitId: string;
  storyDone: number;
  phonicsDone: number;
  gameDone: number;
  roleplayDone: number;
  starsEarned: number;
}

interface HomeProfile extends ProfileSummary {
  avatarId?: string;
  dailyGoalMinutes?: number;
  equippedAccessories?: string[];
  ownedAccessories?: string[];
}

export default function AdventureMapPage() {
  const [profile, setProfile] = useState<HomeProfile | null>(null);
  const [todayLog, setTodayLog] = useState<TodayLogSummary | null>(null);
  const [dueReviewCount, setDueReviewCount] = useState(0);
  const [progressList, setProgressList] = useState<UnitProgressRow[]>([]);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setProfile(data.profile);
        setTodayLog(data.todayLog ?? null);
        setDueReviewCount(data.dueReviewCount ?? 0);
        setProgressList(data.unitProgress ?? []);
      })
      .catch(() => undefined);
  }, []);

  const progressMap = new Map(progressList.map((p) => [p.unitId, p]));
  const totalUnitStars = progressList.reduce((sum, p) => sum + (p.starsEarned ?? 0), 0);
  const ownedSet = new Set(profile?.ownedAccessories ?? []);

  // Recommend first unit that doesn't have all 4 stars yet
  const recommendedUnit =
    L0_UNITS.find((u) => (progressMap.get(u.id)?.starsEarned ?? 0) < 4) ?? L0_UNITS[0];

  const dailyGoalMin = profile?.dailyGoalMinutes ?? 15;
  const todayMin = Math.round(((todayLog?.studySeconds ?? 0) / 60) * 10) / 10;
  const dailyPct = Math.min(100, Math.round((todayMin / Math.max(1, dailyGoalMin)) * 100));
  const dailyGoalReached = todayMin >= dailyGoalMin;

  return (
    <AppShell profile={profile} dueReviewCount={dueReviewCount}>
      <div className="space-y-7">
        {/* Hero Welcome Banner */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-500 to-teal-500 text-white p-5 sm:p-7 shadow-lg border-b-4 border-emerald-700">
          <div className="flex flex-col md:flex-row items-center justify-between gap-5">
            <div className="space-y-3 text-center md:text-left max-w-xl w-full">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-extrabold backdrop-blur-xs">
                <Sparkles className="w-3.5 h-3.5" />
                <span>小学二年级 · 零基础英语启蒙冒险岛</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black leading-tight">
                {profile ? `${profile.nickname}，欢迎来到恐龙英语岛！` : "欢迎来到恐龙英语岛！"}
              </h1>
              <p className="text-emerald-50 text-sm sm:text-base font-medium leading-relaxed">
                每天 {dailyGoalMin} 分钟：先点读绘本，再学自然拼读与 CVC 拼读、玩闯关小游戏，最后和{" "}
                {profile?.companionName ?? "Dino"} 演一场情景英文小剧场！
              </p>

              {/* Daily Goal Energy Bar */}
              <div className="rounded-2xl bg-white/15 backdrop-blur-xs p-3 space-y-1.5 text-left">
                <div className="flex items-center justify-between text-xs font-extrabold">
                  <span className="flex items-center gap-1">
                    <Award className="w-4 h-4 text-amber-300" />
                    <span>今日冒险能量</span>
                  </span>
                  <span>
                    {todayMin.toFixed(1)} / {dailyGoalMin} 分钟
                    {dailyGoalReached ? " 🏅 今日达标！" : ""}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-black/20 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      dailyGoalReached ? "bg-amber-300" : "bg-amber-400"
                    }`}
                    style={{ width: `${Math.max(4, dailyPct)}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-1">
                <Link
                  href={`/unit/${recommendedUnit.id}`}
                  onClick={() => soundEffects.playClick()}
                  data-testid="start-recommended-btn"
                  className="min-h-[52px] px-6 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-900 font-black text-base border-b-4 border-amber-600 active:border-b-0 active:translate-y-1 transition inline-flex items-center gap-2 shadow-sm"
                >
                  <Play className="w-5 h-5 fill-slate-900" />
                  <span>继续第 {recommendedUnit.order} 关：{recommendedUnit.titleZh}</span>
                </Link>

                <Link
                  href="/review"
                  onClick={() => soundEffects.playClick()}
                  className="min-h-[52px] px-5 rounded-2xl bg-white/20 hover:bg-white/30 text-white font-extrabold text-sm border-2 border-white/40 inline-flex items-center gap-2 transition"
                >
                  <Gift className="w-4 h-4" />
                  <span>每日复习宝箱 {dueReviewCount > 0 ? `(${dueReviewCount})` : ""}</span>
                </Link>
              </div>
            </div>

            <div className="shrink-0 flex flex-col items-center">
              <DinoCharacter
                mood={dailyGoalReached ? "cheering" : "happy"}
                avatarId={profile?.avatarId}
                equippedAccessories={profile?.equippedAccessories ?? []}
                size={150}
              />
              <span className="mt-1 px-3 py-0.5 rounded-full bg-white/25 text-xs font-extrabold">
                Lv.{profile?.level ?? 1} · 已集 {totalUnitStars} / {L0_UNITS.length * 4} 关卡星
              </span>
            </div>
          </div>
        </section>

        {/* L0 Active Island Trail Map */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 flex items-center gap-2">
                <Compass className="w-6 h-6 text-emerald-500" />
                <span>L0 启蒙岛 · 10 大生活情景关卡</span>
              </h2>
              <p className="text-sm text-slate-500 font-medium">
                覆盖 100+ 高频生活词 + 26 字母大小写与渐进 CVC 拼读，满 4 星解锁专属恐龙装扮！
              </p>
            </div>
          </div>

          <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-4">
            {L0_UNITS.map((unit) => {
              const prog = progressMap.get(unit.id);
              const stars = prog?.starsEarned ?? 0;
              const isRecommended = unit.id === recommendedUnit.id;
              const isAllDone = stars >= 4;
              const rewardAcc = getUnitRewardAccessory(unit.id);
              const rewardUnlocked = rewardAcc ? ownedSet.has(rewardAcc.id) : false;

              return (
                <Link
                  key={unit.id}
                  href={`/unit/${unit.id}`}
                  data-testid={`unit-card-${unit.id}`}
                  onClick={() => soundEffects.playClick()}
                  className={`group relative rounded-3xl bg-white p-5 border-2 border-b-4 transition hover:-translate-y-0.5 flex items-center gap-4 ${
                    isRecommended
                      ? "border-emerald-400 ring-4 ring-emerald-100 shadow-md"
                      : isAllDone
                      ? "border-amber-300 shadow-xs"
                      : "border-slate-200 hover:border-emerald-300 shadow-xs"
                  }`}
                >
                  {/* Island Number & Emoji */}
                  <div
                    className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-3xl flex flex-col items-center justify-center shrink-0 text-white shadow-sm border-b-4 border-black/15 group-hover:scale-105 transition"
                    style={{ backgroundColor: unit.themeColor }}
                  >
                    <span className="text-2xl sm:text-3xl leading-none">{unit.badgeEmoji}</span>
                    <span className="text-[11px] font-black mt-1 bg-black/20 px-2 rounded-full">
                      U{unit.order}
                    </span>
                    {isRecommended && (
                      <span
                        title="Dino 在这一关等你哦"
                        className="absolute -top-2.5 -right-2.5 w-7 h-7 rounded-full bg-amber-400 border-2 border-white shadow-xs flex items-center justify-center text-sm"
                      >
                        🦕
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg sm:text-xl font-black text-slate-900 truncate">
                        {unit.titleZh}
                      </h3>
                      {isRecommended && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black">
                          推荐下一步
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-bold text-slate-500 truncate">
                      {unit.titleEn} · 拼读：{unit.phonicsLabel}
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-1">{unit.subtitleZh}</p>

                    {/* Exclusive Reward Tag */}
                    {rewardAcc && (
                      <div className="pt-0.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            rewardUnlocked
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <span>{rewardAcc.emoji}</span>
                          <span>
                            {rewardUnlocked
                              ? `已解锁：${rewardAcc.nameZh}`
                              : `满4星赠：${rewardAcc.nameZh}`}
                          </span>
                        </span>
                      </div>
                    )}

                    {/* 4-Step Stars */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1">
                        {[0, 1, 2, 3].map((idx) => (
                          <Star
                            key={idx}
                            className={`w-4 h-4 ${
                              idx < stars
                                ? "fill-amber-400 text-amber-500"
                                : "fill-slate-100 text-slate-300"
                            }`}
                          />
                        ))}
                        <span className="text-xs font-bold text-slate-500 ml-1">
                          {stars}/4 环节
                        </span>
                      </div>
                      <span className="text-xs font-black text-emerald-600 group-hover:translate-x-0.5 transition">
                        {stars > 0 ? "继续学 →" : "去探险 →"}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* L1 & L2 Roadmap */}
        <section className="space-y-3 pt-2">
          <h2 className="text-lg font-black text-slate-700">🚀 后续进阶岛屿路线图（循序渐进）</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CURRICULUM_LEVELS.filter((l) => l.status === "upcoming").map((lvl) => (
              <div
                key={lvl.id}
                className="rounded-3xl bg-white/80 border-2 border-dashed border-slate-300 p-5 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-700 text-base">{lvl.nameZh}</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
                    <Lock className="w-3 h-3" /> 即将开启
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-500">{lvl.subtitleZh}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {lvl.previewTopics.map((topic) => (
                    <span
                      key={topic}
                      className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
