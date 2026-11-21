"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Flame,
  Gift,
  Heart,
  Lock,
  Map,
  MessageCircle,
  Star,
  Volume2,
  VolumeX,
  Clock,
} from "lucide-react";
import { soundEffects } from "@/lib/sound-effects";

export interface ProfileSummary {
  nickname: string;
  companionName: string;
  totalStars: number;
  level: number;
  petHunger: number;
  petMood: number;
  eyeCareMinutes: number;
  streakDays: number;
}

interface AppShellProps {
  children: React.ReactNode;
  dueReviewCount?: number;
  profile?: ProfileSummary | null;
}

export function AppShell({ children, dueReviewCount = 0, profile }: AppShellProps) {
  const pathname = usePathname();
  const [muted, setMuted] = useState(false);
  const [sessionMinutes, setSessionMinutes] = useState(0);
  const [showEyeCare, setShowEyeCare] = useState(false);

  const eyeLimit = profile?.eyeCareMinutes ?? 15;

  useEffect(() => {
    setMuted(soundEffects.isMuted());
  }, []);

  useEffect(() => {
    const SECS_KEY = "dinotalk_visible_study_secs";
    const ALERT_KEY = "dinotalk_eye_care_last_min";

    const readNum = (key: string) => {
      try {
        const val = Number(sessionStorage.getItem(key) || "0");
        return Number.isFinite(val) && val > 0 ? val : 0;
      } catch {
        return 0;
      }
    };

    setSessionMinutes(Math.floor(readNum(SECS_KEY) / 60));

    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const nextSecs = readNum(SECS_KEY) + 30;
      try {
        sessionStorage.setItem(SECS_KEY, String(nextSecs));
      } catch {
        // ignore storage quota errors
      }
      const mins = Math.floor(nextSecs / 60);
      setSessionMinutes(mins);

      const lastAlertedMin = readNum(ALERT_KEY);
      if (mins > 0 && mins >= eyeLimit && mins % eyeLimit === 0 && mins > lastAlertedMin) {
        try {
          sessionStorage.setItem(ALERT_KEY, String(mins));
        } catch {
          // ignore
        }
        setShowEyeCare(true);
      }

      fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat_study", seconds: 30 }),
      }).catch(() => undefined);
    }, 30000);

    return () => clearInterval(timer);
  }, [eyeLimit]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEffects.setMuted(next);
    if (!next) soundEffects.playClick();
  };

  const navItems = [
    { href: "/", label: "冒险地图", icon: Map },
    { href: "/pet", label: "恐龙小屋", icon: Heart },
    { href: "/chat", label: "自由聊天", icon: MessageCircle },
    { href: "/review", label: "复习宝箱", icon: Gift, badge: dueReviewCount },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFDF5] pb-24 md:pb-8">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b-2 border-emerald-100">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
          <Link
            href="/"
            onClick={() => soundEffects.playClick()}
            className="flex items-center gap-2.5 min-w-0"
          >
            <span className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-xl shadow-sm border-b-4 border-emerald-700 shrink-0">
              🦕
            </span>
            <div className="min-w-0">
              <div className="font-extrabold text-base sm:text-lg text-slate-800 truncate leading-tight">
                DinoTalk 冒险岛
              </div>
              <div className="text-xs text-emerald-700 font-medium truncate">
                {profile ? `Hi, ${profile.nickname}!` : "7岁英语启蒙乐园"}
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Stars */}
            <div
              className="flex items-center gap-1 bg-amber-50 border-2 border-amber-200 rounded-full px-2.5 py-1 text-amber-700 font-extrabold text-sm"
              title="我的学习星星"
            >
              <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
              <span data-testid="total-stars">{profile?.totalStars ?? 10}</span>
            </div>

            {/* Streak */}
            <div
              className="hidden sm:flex items-center gap-1 bg-orange-50 border-2 border-orange-200 rounded-full px-2.5 py-1 text-orange-600 font-bold text-sm"
              title="连续打卡天数"
            >
              <Flame className="w-4 h-4 fill-orange-400 text-orange-500" />
              <span>{profile?.streakDays ?? 1}天</span>
            </div>

            {/* Eye care indicator */}
            <button
              type="button"
              onClick={() => setShowEyeCare(true)}
              className="hidden md:flex items-center gap-1 bg-sky-50 border-2 border-sky-200 rounded-full px-2.5 py-1 text-sky-700 font-semibold text-xs hover:bg-sky-100"
              title="护眼小提醒"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{sessionMinutes}m / {eyeLimit}m</span>
            </button>

            {/* Mute toggle */}
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "开启音效" : "静音音效"}
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition"
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            {/* Parent Console */}
            <Link
              href="/parent"
              onClick={() => soundEffects.playClick()}
              className="flex items-center gap-1 px-3 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs sm:text-sm font-bold shadow-sm transition"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>家长</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Desktop sub-nav bar */}
      <div className="hidden md:block bg-emerald-50/70 border-b border-emerald-100">
        <div className="max-w-5xl mx-auto px-6 py-2 flex items-center gap-3">
          {navItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => soundEffects.playClick()}
                className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold transition ${
                  active
                    ? "bg-emerald-500 text-white shadow-sm border-b-4 border-emerald-700"
                    : "bg-white text-slate-700 hover:bg-emerald-100/70 border border-emerald-100"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
                {item.badge && item.badge > 0 ? (
                  <span className="ml-0.5 px-1.5 py-0.5 text-xs rounded-full bg-amber-400 text-slate-900 font-black">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {children}
      </main>

      {/* Mobile / iPad Bottom Navigation */}
      <nav
        aria-label="主导航"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t-2 border-emerald-100 px-2 py-1.5"
      >
        <div className="max-w-lg mx-auto grid grid-cols-4 gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => soundEffects.playClick()}
                className={`relative flex flex-col items-center justify-center py-1.5 rounded-2xl text-xs font-bold min-h-[52px] transition ${
                  active
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "text-slate-600 hover:bg-emerald-50"
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span>{item.label}</span>
                {item.badge && item.badge > 0 ? (
                  <span className="absolute top-1 right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-slate-900 text-[11px] font-black flex items-center justify-center">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Eye-care break modal */}
      {showEyeCare && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center border-4 border-sky-200 shadow-2xl">
            <div className="text-5xl mb-3">👀🌿</div>
            <h2 className="text-xl font-black text-slate-800 mb-2">护眼休息小贴士</h2>
            <p className="text-slate-600 text-sm leading-relaxed mb-5">
              小探险家已经学习一会儿啦！站起来喝口水、看看窗外绿树 20 秒，让小眼睛休息一下再继续吧~
            </p>
            <button
              type="button"
              onClick={() => setShowEyeCare(false)}
              className="w-full min-h-[48px] rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-extrabold text-base border-b-4 border-sky-700 active:border-b-0 active:translate-y-1 transition"
            >
              我休息好啦！继续冒险
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
