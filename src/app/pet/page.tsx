"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Heart, Lock, Mic, MicOff, Palette, Sparkles, Star, Trophy } from "lucide-react";
import { AppShell, type ProfileSummary } from "@/components/AppShell";
import { DinoCharacter } from "@/components/illustrations/DinoCharacter";
import { DINO_SKINS, L0_UNITS, PET_ACCESSORIES, PET_SNACKS } from "@/data/curriculum";
import type { EmotionMood } from "@/data/curriculum/types";
import { scorePronunciation } from "@/lib/speech/pronunciation-scorer";
import { soundEffects } from "@/lib/sound-effects";
import { useSpeech } from "@/hooks/useSpeech";
import type { PublicProfileSummary } from "@/types/api";

interface FullProfile extends ProfileSummary {
  avatarId: string;
  equippedAccessories: string[];
  ownedAccessories: string[];
  ownedSkinIds: string[];
}

const DINO_CHATTER: Array<{ en: string; zh: string; mood: EmotionMood }> = [
  { en: "Hello, my best friend! I am so happy!", zh: "你好呀好朋友！摸摸头好开心！", mood: "excited" },
  { en: "You are a super English explorer!", zh: "你是超厉害的英语小探险家！", mood: "cheering" },
  { en: "Let's play and learn together!", zh: "我们一起边玩边学英语吧！", mood: "happy" },
  { en: "Thank you for taking care of me!", zh: "谢谢你每天照顾我呀！", mood: "excited" },
  { en: "High five! English is fun!", zh: "击个掌！学英语真好玩！", mood: "cheering" },
];

export default function PetHousePage() {
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [profiles, setProfiles] = useState<PublicProfileSummary[]>([]);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [dueReviewCount, setDueReviewCount] = useState(0);
  const [mood, setMood] = useState<EmotionMood>("happy");
  const [messageZh, setMessageZh] = useState<string>(
    "点点 Dino 互动，或者开口读出美食英文半价投喂，换上炫酷肤色和关卡专属装扮吧！"
  );
  const [busy, setBusy] = useState(false);
  const [chatterIdx, setChatterIdx] = useState(0);
  const [voiceSnackId, setVoiceSnackId] = useState<string | null>(null);

  const speech = useSpeech();

  const loadProfile = useCallback(async () => {
    const res = await fetch("/api/profile", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setProfiles(data.profiles ?? []);
    setNeedsProfile(Boolean(data.needsProfile));
    setProfile(data.profile ?? null);
    setDueReviewCount(data.dueReviewCount ?? 0);
    if (data.profile && (data.profile.petHunger ?? 80) < 60) {
      setMood("idle");
      setMessageZh("咕噜噜~ Dino 有点饿啦！I'm hungry! An apple, please!");
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handlePetTap = () => {
    const line = DINO_CHATTER[chatterIdx % DINO_CHATTER.length];
    setChatterIdx((i) => i + 1);
    setMood(line.mood);
    soundEffects.playStar();
    const zhLine =
      line.mood === "cheering" && profile?.nickname && line.zh.includes("小探险家")
        ? `${profile.nickname}，你是超厉害的英语小冠军！`
        : line.zh;
    setMessageZh(`${line.en}（${zhLine}）`);
    void speech.speak(line.en, { lang: "en" });
    window.setTimeout(() => setMood("happy"), 2200);
  };

  const handleFeed = async (
    snackId: string,
    nameEn: string,
    spokenDiscount = false,
    voiceProof?: string
  ) => {
    if (busy) return;
    setBusy(true);
    soundEffects.playClick();
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "feed", snackId, spokenDiscount, voiceProof }),
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
      void speech.speak(`Yummy! Thank you for the ${nameEn}!`, { lang: "en" });
      window.setTimeout(() => setMood("happy"), 2600);
    } finally {
      setBusy(false);
    }
  };

  const handleVoiceFeed = (snackId: string, nameEn: string) => {
    if (busy) return;
    if (speech.isListening) {
      speech.stopListening();
      setVoiceSnackId(null);
      return;
    }
    soundEffects.playClick();
    setVoiceSnackId(snackId);
    setMessageZh(`🎙️ 请大声读出「${nameEn}」，读对就能半价喂给 Dino 哦！`);
    speech.startListening(
      `${nameEn}, apple, strawberry, berry, milk, cake`,
      (transcript, meta) => {
        setVoiceSnackId(null);
        const res = scorePronunciation(transcript, nameEn);
        if (res.passed) {
          void handleFeed(snackId, nameEn, true, meta?.voiceProof);
        } else {
          soundEffects.playGentleTryAgain();
          setMessageZh(`听到你说“${transcript}”，再听一遍「${nameEn}」试试，或者直接星星投喂！`);
          void speech.speak(nameEn, { lang: "en", slow: true });
        }
      },
      { lang: "en", voiceProofPurpose: "feed" }
    );
  };

  const handleSelectSkin = async (skinId: string) => {
    if (busy) return;
    setBusy(true);
    soundEffects.playClick();
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select_avatar", skinId }),
      });
      const data = await res.json();
      if (!res.ok) {
        soundEffects.playGentleTryAgain();
        setMessageZh(data.error || "还不能切换这件肤色哦");
        return;
      }
      setProfile(data.profile);
      setMood("excited");
      soundEffects.playUnlock();
      if (data.messageZh) setMessageZh(data.messageZh);
      window.setTimeout(() => setMood("happy"), 2000);
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
      window.setTimeout(() => setMood("happy"), 2000);
    } finally {
      setBusy(false);
    }
  };

  const shopAccessories = PET_ACCESSORIES.filter((a) => !a.unlockUnitId);
  const unitRewardAccessories = PET_ACCESSORIES.filter((a) => Boolean(a.unlockUnitId));
  const isHungry = (profile?.petHunger ?? 80) < 60;

  return (
    <AppShell
      profile={profile}
      profiles={profiles}
      needsProfile={needsProfile}
      onProfileChanged={() => {
        void loadProfile();
      }}
      dueReviewCount={dueReviewCount}
    >
      <div className="space-y-7">
        {/* Dino Stage */}
        <section className="rounded-3xl bg-gradient-to-br from-amber-50 via-white to-emerald-50 border-4 border-emerald-200 p-5 sm:p-7 shadow-md">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex flex-col items-center shrink-0">
              {isHungry && (
                <div className="mb-1 px-3 py-1 rounded-2xl bg-amber-100 border border-amber-300 text-amber-900 text-xs font-extrabold animate-bounce">
                  🍎 I&apos;m hungry! 喂我吃点东西吧~
                </div>
              )}
              <DinoCharacter
                mood={mood}
                avatarId={profile?.avatarId}
                equippedAccessories={profile?.equippedAccessories ?? []}
                size={185}
                onClick={handlePetTap}
              />
              <button
                type="button"
                onClick={handlePetTap}
                className="mt-1 px-4 py-1.5 rounded-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-extrabold transition"
              >
                👆 摸摸 {profile?.companionName ?? "Dino"} 聊聊英语
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

              {speech.sttError && (
                <div className="rounded-2xl bg-sky-50 border border-sky-200 px-4 py-2 text-xs font-bold text-sky-800">
                  {speech.sttError}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Snack Shop with Voice Discount Feeding */}
        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-black text-slate-800">🍓 星星美食屋（开口说英文半价喂！）</h2>
            <p className="text-xs text-slate-500 font-semibold">
              直接用星星投喂，或点蓝色麦克风大声读出美食英文名，立享半价星币优惠 + 额外开心值！
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {PET_SNACKS.map((snack) => {
              const affordable = (profile?.totalStars ?? 0) >= snack.costStars;
              const halfCost = Math.max(1, Math.floor(snack.costStars / 2));
              const affordableHalf = (profile?.totalStars ?? 0) >= halfCost;
              const isRecordingThis = speech.isListening && voiceSnackId === snack.id;

              return (
                <div
                  key={snack.id}
                  className="bg-white rounded-3xl p-4 border-2 border-amber-200 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">{snack.emoji}</span>
                    <div>
                      <div className="font-black text-base text-slate-900">{snack.nameZh}</div>
                      <div className="text-xs font-bold text-slate-500">{snack.nameEn}</div>
                      <div className="text-[11px] font-bold text-emerald-700 mt-0.5">
                        +{snack.hungerGain}饱 · +{snack.moodGain}开心
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={busy || !affordable}
                      data-testid={`feed-${snack.id}`}
                      onClick={() => handleFeed(snack.id, snack.nameEn, false)}
                      className="min-h-[42px] w-full rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-900 font-black text-xs border-b-2 border-amber-600 flex items-center justify-center gap-1"
                    >
                      <Star className="w-3.5 h-3.5 fill-slate-900" />
                      <span>直接投喂 ({snack.costStars}⭐)</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || !affordableHalf}
                      onClick={() => handleVoiceFeed(snack.id, snack.nameEn)}
                      className={`min-h-[40px] w-full rounded-xl font-extrabold text-xs flex items-center justify-center gap-1 transition disabled:opacity-50 ${
                        isRecordingThis
                          ? "bg-rose-500 text-white animate-pulse"
                          : "bg-sky-100 hover:bg-sky-200 text-sky-900"
                      }`}
                    >
                      {isRecordingThis ? (
                        <MicOff className="w-3.5 h-3.5" />
                      ) : (
                        <Mic className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isRecordingThis
                          ? "点此结束"
                          : `说 ${snack.nameEn} 半价 (${halfCost}⭐)`}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Dino Skins (uses child_profiles.avatar_id) */}
        <section className="space-y-3">
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Palette className="w-5 h-5 text-emerald-600" />
            <span>恐龙变身肤色</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {DINO_SKINS.map((skin) => {
              const isCurrent = (profile?.avatarId || "dino-green") === skin.id;
              const isUnlocked =
                skin.costStars === 0 ||
                (profile?.ownedSkinIds?.includes(skin.id) ?? false);
              const levelOk = (profile?.level ?? 1) >= skin.minLevel;
              const affordable = (profile?.totalStars ?? 0) >= skin.costStars;

              return (
                <div
                  key={skin.id}
                  className={`rounded-3xl p-4 border-2 flex flex-col justify-between gap-3 ${
                    isCurrent
                      ? "bg-emerald-50 border-emerald-400"
                      : "bg-white border-slate-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="w-12 h-12 rounded-2xl border-2 shrink-0 flex items-center justify-center shadow-xs"
                      style={{
                        backgroundColor: skin.bodyColor,
                        borderColor: skin.strokeColor,
                      }}
                    >
                      <span
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: skin.spikeColor }}
                      />
                    </span>
                    <div>
                      <div className="font-black text-base text-slate-900">{skin.nameZh}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{skin.descZh}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || isCurrent || (!isUnlocked && (!levelOk || !affordable))}
                    data-testid={`skin-${skin.id}`}
                    onClick={() => handleSelectSkin(skin.id)}
                    className={`min-h-[42px] w-full rounded-2xl font-black text-xs border-b-4 transition ${
                      isCurrent
                        ? "bg-emerald-600 text-white border-emerald-800"
                        : isUnlocked
                        ? "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-700"
                        : "bg-amber-400 text-slate-900 border-amber-600 disabled:opacity-50"
                    }`}
                  >
                    {isCurrent
                      ? "✓ 当前肤色"
                      : isUnlocked
                      ? "切换肤色"
                      : !levelOk
                      ? `需 Lv.${skin.minLevel} 解锁`
                      : `⭐ ${skin.costStars} 颗星解锁`}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Star Shop Wardrobe */}
        <section className="space-y-3">
          <h2 className="text-xl font-black text-slate-800">👑 小恐龙魔法衣橱（星星兑换）</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {shopAccessories.map((acc) => {
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

        {/* 10-Unit Exclusive Rewards Showcase */}
        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              <span>10 关满 4 星专属荣誉装扮</span>
            </h2>
            <p className="text-xs text-slate-500 font-semibold">
              每满 4 星通关一个冒险单元，免费解锁并珍藏 1 件专属纪念装扮！
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {unitRewardAccessories.map((acc) => {
              const isOwned = profile?.ownedAccessories?.includes(acc.id) ?? false;
              const isEquipped = profile?.equippedAccessories?.includes(acc.id) ?? false;
              const unit = L0_UNITS.find((u) => u.id === acc.unlockUnitId);

              return (
                <div
                  key={acc.id}
                  className={`rounded-3xl p-4 border-2 flex flex-col justify-between gap-2.5 ${
                    isEquipped
                      ? "bg-emerald-50 border-emerald-400"
                      : isOwned
                      ? "bg-amber-50/50 border-amber-200"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className="text-center space-y-1">
                    <div className={`text-4xl ${isOwned ? "" : "grayscale opacity-60"}`}>
                      {acc.emoji}
                    </div>
                    <div className="font-black text-sm text-slate-900">{acc.nameZh}</div>
                    <div className="text-[11px] font-bold text-slate-500">
                      {unit ? `第 ${unit.order} 关 · ${unit.titleZh}` : ""}
                    </div>
                  </div>

                  {isOwned ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleAccessory(acc.id, true)}
                      className={`min-h-[38px] w-full rounded-xl font-black text-xs border-b-2 transition ${
                        isEquipped
                          ? "bg-slate-200 text-slate-700 border-slate-300"
                          : "bg-emerald-500 text-white border-emerald-700"
                      }`}
                    >
                      {isEquipped ? "已佩戴（摘下）" : "点击佩戴"}
                    </button>
                  ) : (
                    <Link
                      href={unit ? `/unit/${unit.id}` : "/"}
                      className="min-h-[38px] w-full rounded-xl bg-white hover:bg-amber-50 border border-slate-300 text-slate-600 font-bold text-xs flex items-center justify-center gap-1"
                    >
                      <Lock className="w-3 h-3" />
                      <span>去冲满 4 星</span>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
