"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart, Sparkles, Star } from "lucide-react";
import { AppShell, type ProfileSummary } from "@/components/AppShell";
import { DinoCharacter } from "@/components/illustrations/DinoCharacter";
import { PET_ACCESSORIES, PET_SNACKS } from "@/data/curriculum";
import type { EmotionMood } from "@/data/curriculum/types";
import { soundEffects } from "@/lib/sound-effects";
import { useSpeech } from "@/hooks/useSpeech";

interface FullProfile extends ProfileSummary {
  equippedAccessories: string[];
  ownedAccessories: string[];
}

export default function PetHousePage() {
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [dueReviewCount, setDueReviewCount] = useState(0);
  const [mood, setMood] = useState<EmotionMood>("happy");
  const [messageZh, setMessageZh] = useState<string>("点点下面的美食喂喂 Dino，或者用星星换帅气小装扮吧！");
  const [busy, setBusy] = useState(false);

  const speech = useSpeech();

  const loadProfile = useCallback(async () => {
    const res = await fetch("/api/profile");
    if (!res.ok) return;
    const data = await res.json();
    setProfile(data.profile);
    setDueReviewCount(data.dueReviewCount ?? 0);
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleFeed = async (snackId: string, nameEn: string) => {
    if (busy) return;
    setBusy(true);
    soundEffects.playClick();
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "feed", snackId }),
      });
      const data = await res.json();
      if (!res.ok) {
        soundEffects.playGentleTryAgain();
        setMessageZh(data.error || "星星不够啦！");
        return;
      }
      setProfile(data.profile);
      setMood("cheering");
      soundEffects.playCelebrate();
      setMessageZh(data.messageZh || "好香呀！谢谢你喂我吃东西！");
      speech.speak(`Yummy! Thank you for the ${nameEn}!`, { lang: "en" });
      setTimeout(() => setMood("happy"), 2600);
    } finally {
      setBusy(false);
    }
  };

  const handleAccessory = async (accessoryId: string, isOwned: boolean) => {
    if (busy) return;
    setBusy(true);
    soundEffects.playClick();
    try {
      const action = isOwned ? "equip_accessory" : "buy_accessory";
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, accessoryId }),
      });
      const data = await res.json();
      if (!res.ok) {
        soundEffects.playGentleTryAgain();
        setMessageZh(data.error || "星星还不够哦");
        return;
      }
      setProfile(data.profile);
      setMood("excited");
      soundEffects.playStar();
      if (data.messageZh) setMessageZh(data.messageZh);
      setTimeout(() => setMood("happy"), 2000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell profile={profile} dueReviewCount={dueReviewCount}>
      <div className="space-y-6">
        {/* Dino Stage */}
        <section className="rounded-3xl bg-gradient-to-br from-amber-50 via-white to-emerald-50 border-4 border-emerald-200 p-5 sm:p-7 shadow-md">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex flex-col items-center shrink-0">
              <DinoCharacter
                mood={mood}
                equippedAccessories={profile?.equippedAccessories ?? []}
                size={180}
              />
              <button
                type="button"
                onClick={() => {
                  setMood("excited");
                  soundEffects.playStar();
                  speech.speak(`Hi! I am ${profile?.companionName ?? "Dino"}! I love you!`, {
                    lang: "en",
                  });
                  setTimeout(() => setMood("happy"), 1800);
                }}
                className="mt-1 px-4 py-1.5 rounded-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-extrabold transition"
              >
                👆 摸摸 {profile?.companionName ?? "Dino"} 头
              </button>
            </div>

            <div className="flex-1 w-full space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
                    {profile?.companionName ?? "Dino"} 的温馨小屋
                  </h1>
                  <p className="text-sm text-emerald-700 font-bold mt-0.5">
                    成长等级：Lv.{profile?.level ?? 1} · 拥有星星：{profile?.totalStars ?? 0} ⭐
                  </p>
                </div>
              </div>

              {/* Status Bars */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl p-3.5 border-2 border-amber-100">
                  <div className="flex justify-between text-xs font-extrabold text-slate-700 mb-1.5">
                    <span>🍎 饱饱度</span>
                    <span data-testid="pet-hunger">{profile?.petHunger ?? 80} / 100</span>
                  </div>
                  <div className="h-3 rounded-full bg-amber-100 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-300"
                      style={{ width: `${profile?.petHunger ?? 80}%` }}
                    />
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-3.5 border-2 border-rose-100">
                  <div className="flex justify-between text-xs font-extrabold text-slate-700 mb-1.5">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3.5 h-3.5 fill-rose-400 text-rose-500" /> 开心值
                    </span>
                    <span data-testid="pet-mood">{profile?.petMood ?? 90} / 100</span>
                  </div>
                  <div className="h-3 rounded-full bg-rose-100 overflow-hidden">
                    <div
                      className="h-full bg-rose-400 rounded-full transition-all duration-300"
                      style={{ width: `${profile?.petMood ?? 90}%` }}
                    />
                  </div>
                </div>
              </div>

              <div
                data-testid="pet-message"
                className="rounded-2xl bg-emerald-50 border-2 border-emerald-200 px-4 py-3 text-sm font-bold text-emerald-900 flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{messageZh}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Snack Shop */}
        <section className="space-y-3">
          <h2 className="text-xl font-black text-slate-800">🍓 星星美食屋（喂养升级）</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {PET_SNACKS.map((snack) => {
              const affordable = (profile?.totalStars ?? 0) >= snack.costStars;
              return (
                <button
                  key={snack.id}
                  type="button"
                  disabled={busy || !affordable}
                  data-testid={`feed-${snack.id}`}
                  onClick={() => handleFeed(snack.id, snack.nameEn)}
                  className="bg-white rounded-3xl p-4 border-2 border-amber-200 border-b-4 hover:bg-amber-50/70 disabled:opacity-55 text-left transition flex flex-col justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">{snack.emoji}</span>
                    <div>
                      <div className="font-black text-base text-slate-900">{snack.nameZh}</div>
                      <div className="text-xs font-bold text-slate-500">{snack.nameEn}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-xs font-bold text-emerald-700">
                      +{snack.hungerGain}饱 · +{snack.moodGain}开心
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-black">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                      {snack.costStars}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Wardrobe */}
        <section className="space-y-3">
          <h2 className="text-xl font-black text-slate-800">👑 小恐龙魔法衣橱</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {PET_ACCESSORIES.map((acc) => {
              const isOwned = profile?.ownedAccessories?.includes(acc.id) ?? false;
              const isEquipped = profile?.equippedAccessories?.includes(acc.id) ?? false;
              const affordable = (profile?.totalStars ?? 0) >= acc.costStars;

              return (
                <div
                  key={acc.id}
                  className={`rounded-3xl p-4 border-2 flex flex-col justify-between gap-3 ${
                    isEquipped
                      ? "bg-emerald-50 border-emerald-300"
                      : "bg-white border-slate-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-4xl">{acc.emoji}</span>
                    <div>
                      <div className="font-black text-base text-slate-900">{acc.nameZh}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{acc.descZh}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || (!isOwned && !affordable)}
                    onClick={() => handleAccessory(acc.id, isOwned)}
                    className={`min-h-[44px] w-full rounded-2xl font-black text-sm border-b-4 transition ${
                      isEquipped
                        ? "bg-slate-200 text-slate-700 border-slate-300"
                        : isOwned
                        ? "bg-emerald-500 text-white border-emerald-700"
                        : "bg-amber-400 text-slate-900 border-amber-600 disabled:opacity-50"
                    }`}
                  >
                    {isEquipped
                      ? "已佩戴（点此摘下）"
                      : isOwned
                      ? "点击佩戴"
                      : `⭐ ${acc.costStars} 颗星解锁`}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
