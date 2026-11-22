"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Lock, Mic, MicOff, Plus, Sparkles, UserPlus, X } from "lucide-react";
import { DinoCharacter } from "@/components/illustrations/DinoCharacter";
import { useSpeech } from "@/hooks/useSpeech";
import { soundEffects } from "@/lib/sound-effects";
import { extractChildNameFromSpeech } from "@/lib/speech/name-extractor";
import type { PublicProfileSummary, SerializedProfile } from "@/types/api";

interface ProfileModalProps {
  open: boolean;
  mode: "onboarding" | "switcher";
  currentProfileId?: number | null;
  profiles: PublicProfileSummary[];
  warnOnSwitch?: boolean;
  onClose?: () => void;
  onProfileActivated: (profile: SerializedProfile, isSwitchFromOther: boolean) => void;
}

export function ProfileModal(props: ProfileModalProps) {
  if (!props.open) return null;
  return <ProfileModalContent {...props} />;
}

function ProfileModalContent({
  mode,
  currentProfileId,
  profiles,
  warnOnSwitch = false,
  onClose,
  onProfileActivated,
}: ProfileModalProps) {
  const [view, setView] = useState<"create" | "list">(() =>
    profiles.length === 0 ? "create" : "list"
  );
  const [nameInput, setNameInput] = useState("");
  const [voiceRecognizedName, setVoiceRecognizedName] = useState<string | null>(null);
  const [duplicateProfile, setDuplicateProfile] = useState<PublicProfileSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const speech = useSpeech();

  const handleSelectProfile = async (profileId: number) => {
    if (submitting) return;
    if (mode === "switcher" && currentProfileId === profileId) {
      soundEffects.playClick();
      onClose?.();
      return;
    }

    speech.cancelListening();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/profiles/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.profile) {
        soundEffects.playGentleTryAgain();
        setError(data?.error || "切换档案失败，请重试");
        return;
      }
      soundEffects.playStar();
      const isSwitch = Boolean(currentProfileId && currentProfileId !== data.profile.id);
      onProfileActivated(data.profile, isSwitch);
    } catch {
      soundEffects.playGentleTryAgain();
      setError("网络开小差啦，请再点一次试试~");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setError("请先输入或说出你的名字哦~");
      return;
    }

    speech.cancelListening();
    setSubmitting(true);
    setError(null);
    setDuplicateProfile(null);

    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: trimmed }),
      });
      const data = await res.json().catch(() => null);

      if (res.status === 409 && data?.existingProfile) {
        soundEffects.playGentleTryAgain();
        setDuplicateProfile(data.existingProfile);
        setError(data.error || `找到「${data.existingProfile.nickname}」的冒险档案啦！`);
        return;
      }

      if (!res.ok || !data?.profile) {
        soundEffects.playGentleTryAgain();
        setError(data?.error || "创建档案失败，请再试一次");
        return;
      }

      soundEffects.playCelebrate();
      const isSwitch = Boolean(currentProfileId && currentProfileId !== data.profile.id);
      onProfileActivated(data.profile, isSwitch);
    } catch {
      soundEffects.playGentleTryAgain();
      setError("网络开小差啦，创建档案失败，请再试一次~");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoiceName = () => {
    if (submitting) return;
    if (speech.isListening) {
      speech.stopListening();
      return;
    }
    soundEffects.playClick();
    setError(null);
    setDuplicateProfile(null);
    setVoiceRecognizedName(null);
    speech.startListening(
      "苗苗, 豆豆, 乐乐, 朵朵, 小明, Tony, Mia",
      (transcript) => {
        const cleaned = extractChildNameFromSpeech(transcript);
        if (!cleaned) {
          soundEffects.playGentleTryAgain();
          setError("没太听清名字，可以再说一次或者直接打字输入哦~");
          return;
        }
        soundEffects.playStar();
        setNameInput(cleaned);
        setVoiceRecognizedName(cleaned);
        setError(null);
      },
      { lang: "zh", maxDurationMs: 6000 }
    );
  };

  const switchToCreateView = () => {
    soundEffects.playClick();
    speech.cancelListening();
    speech.clearSttError();
    setError(null);
    setDuplicateProfile(null);
    setVoiceRecognizedName(null);
    setNameInput("");
    setView("create");
  };

  const switchToListView = () => {
    soundEffects.playClick();
    speech.cancelListening();
    speech.clearSttError();
    setError(null);
    setDuplicateProfile(null);
    setVoiceRecognizedName(null);
    setView("list");
  };

  const handleClose = () => {
    if (mode !== "switcher" || submitting) return;
    speech.cancelListening();
    soundEffects.playClick();
    onClose?.();
  };

  return (
    <div
      data-testid="profile-modal"
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && mode === "switcher") {
          handleClose();
        }
      }}
    >
      <div className="relative bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 border-4 border-emerald-200 shadow-2xl space-y-5 my-auto">
        {mode === "switcher" && (
          <button
            type="button"
            aria-label="关闭切换窗口"
            onClick={handleClose}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {view === "create" ? (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <DinoCharacter mood="excited" size={108} />
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-extrabold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>欢迎来到 DinoTalk 小恐龙冒险岛</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                输入或说出你的名字开始吧！
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                专属的学习星星、恐龙装扮和闯关记录都会分开保存哦~
              </p>
            </div>

            <form onSubmit={handleCreateProfile} className="space-y-3.5">
              <div className="space-y-2">
                <input
                  type="text"
                  maxLength={20}
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    setDuplicateProfile(null);
                    setError(null);
                  }}
                  placeholder="输入你的名字，例如：苗苗"
                  data-testid="profile-name-input"
                  autoFocus
                  className="w-full min-h-[54px] rounded-2xl border-2 border-emerald-300 focus:border-emerald-500 outline-none px-4 text-center text-lg font-black text-slate-900 bg-emerald-50/30"
                />

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleVoiceName}
                  data-testid="profile-voice-btn"
                  className={`relative w-full min-h-[50px] rounded-2xl font-extrabold text-sm border-b-4 flex items-center justify-center gap-2 transition ${
                    speech.isListening
                      ? "bg-rose-500 text-white border-rose-700"
                      : "bg-sky-500 hover:bg-sky-600 text-white border-sky-700"
                  }`}
                >
                  <span
                    ref={speech.audioMeterRef}
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-0 rounded-[inherit] ring-4 ring-rose-400/40 ${
                      speech.isListening ? "" : "opacity-0"
                    }`}
                  />
                  {speech.isListening ? (
                    <MicOff className="w-5 h-5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                  <span>
                    {speech.isListening ? "正在听你说名字... 点此结束" : "🎙️ 说出我的名字"}
                  </span>
                  {speech.isListening && speech.listenCountdownSec !== null && (
                    <span className="text-xs opacity-90">({speech.listenCountdownSec}s)</span>
                  )}
                </button>
              </div>

              {voiceRecognizedName && !duplicateProfile && (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-800 text-center">
                  🎙️ 听到你叫「{voiceRecognizedName}」！点下面绿色按钮就开始冒险，也可以直接修改文字~
                </div>
              )}

              {speech.sttError && (
                <div className="rounded-2xl bg-sky-50 border border-sky-200 px-4 py-2 text-xs font-bold text-sky-800 text-center">
                  {speech.sttError}
                </div>
              )}

              {duplicateProfile ? (
                <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-4 space-y-3 text-center">
                  <div className="text-sm font-black text-amber-900">
                    找到「{duplicateProfile.nickname}」的冒险档案啦！
                  </div>
                  <div className="text-xs font-semibold text-amber-800">
                    Lv.{duplicateProfile.level} · 拥有 {duplicateProfile.totalStars} 颗星星 ⭐
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      disabled={submitting}
                      data-testid="profile-duplicate-enter-btn"
                      onClick={() => handleSelectProfile(duplicateProfile.id)}
                      className="flex-1 min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm border-b-4 border-emerald-700"
                    >
                      直接以「{duplicateProfile.nickname}」进入
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        setDuplicateProfile(null);
                        setError(null);
                        setNameInput("");
                      }}
                      className="min-h-[48px] px-4 rounded-xl bg-white border border-amber-300 text-amber-900 font-bold text-sm"
                    >
                      换个新名字
                    </button>
                  </div>
                </div>
              ) : (
                error && (
                  <p className="text-xs font-bold text-rose-600 text-center">{error}</p>
                )
              )}

              <button
                type="submit"
                disabled={submitting || !nameInput.trim()}
                data-testid="profile-create-submit"
                className="w-full min-h-[54px] rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-black text-base border-b-4 border-emerald-700 active:border-b-0 active:translate-y-1 transition flex items-center justify-center gap-2"
              >
                <UserPlus className="w-5 h-5" />
                <span>
                  {submitting
                    ? "正在准备恐龙岛..."
                    : nameInput.trim()
                    ? `以「${nameInput.trim()}」开始冒险 🚀`
                    : "输入名字后开始冒险 🚀"}
                </span>
              </button>
            </form>

            {profiles.length > 0 && (
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={switchToListView}
                  className="text-xs font-bold text-emerald-700 hover:underline"
                >
                  ← 返回选择已有档案（{profiles.length}个）
                </button>
                {mode === "switcher" && (
                  <button
                    type="button"
                    onClick={handleClose}
                    className="text-xs font-bold text-slate-500 hover:text-slate-700"
                  >
                    取消
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center space-y-1 pr-6">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                {mode === "onboarding" ? "欢迎回来！选一个名字开始吧" : "切换学习档案"}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                每位小朋友的星星、恐龙伙伴和闯关进度都独立保存哦~
              </p>
            </div>

            {warnOnSwitch && mode === "switcher" && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 px-3.5 py-2 text-xs font-bold text-amber-800 text-center">
                切换用户后会回到冒险岛首页，当前已保存的进度不会丢失哦~
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
              {profiles.map((p) => {
                const isCurrent = p.id === currentProfileId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={submitting}
                    data-testid={`profile-option-${p.id}`}
                    onClick={() => handleSelectProfile(p.id)}
                    className={`rounded-2xl p-3.5 border-2 text-left flex items-center gap-3 transition ${
                      isCurrent
                        ? "bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200"
                        : "bg-white border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40"
                    }`}
                  >
                    <DinoCharacter
                      size={52}
                      mood="happy"
                      avatarId={p.avatarId}
                      equippedAccessories={p.equippedAccessories}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-base text-slate-900 truncate">
                          {p.nickname}
                        </span>
                        {isCurrent && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black shrink-0">
                            <Check className="w-2.5 h-2.5" /> 当前
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-slate-500 mt-0.5">
                        Lv.{p.level} · {p.totalStars} ⭐ · {p.streakDays}天
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {error && <p className="text-xs font-bold text-rose-600 text-center">{error}</p>}

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                disabled={submitting}
                data-testid="profile-new-btn"
                onClick={switchToCreateView}
                className="flex-1 min-h-[50px] rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-900 font-black text-sm border-b-4 border-amber-600 flex items-center justify-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>新建资料</span>
              </button>
              {mode === "switcher" && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="min-h-[50px] px-5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm"
                >
                  继续学习
                </button>
              )}
            </div>
          </div>
        )}

        {mode === "onboarding" && (
          <div className="pt-2 border-t border-slate-100 flex justify-center">
            <Link
              href="/parent"
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-600 transition"
            >
              <Lock className="w-3 h-3" />
              <span>家长控制台（模型配置与档案管理）→</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
