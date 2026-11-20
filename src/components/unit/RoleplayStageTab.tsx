"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Mic,
  MicOff,
  Send,
  Settings,
  Sparkles,
  Volume2,
} from "lucide-react";
import type { EmotionMood, SuggestionChip, UnitDef } from "@/data/curriculum/types";
import { DinoCharacter } from "@/components/illustrations/DinoCharacter";
import { SceneArtwork } from "@/components/illustrations/SceneArtwork";
import { soundEffects } from "@/lib/sound-effects";

interface ChatTurn {
  id: string;
  role: "assistant" | "user";
  englishText: string;
  chineseText?: string;
  praise?: string;
}

interface RoleplayStageTabProps {
  unit: UnitDef;
  equippedAccessories: string[];
  speak: (text: string, opts?: { lang?: "en" | "zh"; slow?: boolean }) => Promise<void>;
  isListening: boolean;
  sttError: string | null;
  startListening: (hints: string, onTranscript: (t: string) => void) => Promise<void>;
  stopListening: () => void;
  onStarsUpdated: () => Promise<void>;
}

export function RoleplayStageTab({
  unit,
  equippedAccessories,
  speak,
  isListening,
  sttError,
  startListening,
  stopListening,
  onStarsUpdated,
}: RoleplayStageTabProps) {
  const [sessionId, setSessionId] = useState<number | undefined>(undefined);
  const [messages, setMessages] = useState<ChatTurn[]>(() => [
    {
      id: "opening",
      role: "assistant",
      englishText: unit.roleplay.openingEn,
      chineseText: unit.roleplay.openingZh,
    },
  ]);
  const [completedGoalIds, setCompletedGoalIds] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionChip[]>(
    unit.roleplay.openingSuggestions
  );
  const [mood, setMood] = useState<EmotionMood>("happy");
  const [sending, setSending] = useState(false);
  const [usedFallback, setUsedFallback] = useState<boolean | null>(null);
  const [sceneComplete, setSceneComplete] = useState(false);
  const [starsEarned, setStarsEarned] = useState(0);
  const [textDraft, setTextDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const vocabHints = unit.vocab.map((v) => v.word).join(", ");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendUserTurn = async (text: string) => {
    const clean = text.trim();
    if (!clean || sending) return;

    soundEffects.playClick();
    setSending(true);
    setMood("thinking");

    const userMsgId = `u-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", englishText: clean },
    ]);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: unit.id,
          sessionId,
          userText: clean,
          completedGoalIds,
        }),
      });
      const data = await res.json();
      if (data?.sessionId) setSessionId(data.sessionId);

      const resp = data?.response;
      if (resp) {
        setMood(resp.emotion || "happy");
        setCompletedGoalIds(resp.completedGoalIds || []);
        setSuggestions(resp.nextSuggestions || []);
        setUsedFallback(Boolean(data.usedFallback));

        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            englishText: resp.englishReply,
            chineseText: resp.chineseHint,
            praise: resp.praise,
          },
        ]);

        speak(resp.englishReply, { lang: "en" });

        if (resp.isSceneComplete) {
          setSceneComplete(true);
          setStarsEarned(data.starsAwarded || 4);
          soundEffects.playCelebrate();
          await onStarsUpdated();
        } else if ((resp.completedGoalIds?.length ?? 0) > completedGoalIds.length) {
          soundEffects.playStar();
        }
      }
    } catch {
      setMood("happy");
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          englishText: "Good try! Let's try one more time!",
          chineseText: "刚才网络眨了个眼，再点击下方提示气泡试一次吧~",
        },
      ]);
    } finally {
      setSending(false);
      setTextDraft("");
    }
  };

  const handleMicToggle = () => {
    if (isListening) {
      stopListening();
      return;
    }
    soundEffects.playClick();
    startListening(vocabHints, (transcript) => {
      sendUserTurn(transcript);
    });
  };

  return (
    <div className="space-y-4">
      {/* Immersive Scene Banner + Animated Dino */}
      <div className="relative rounded-3xl overflow-hidden border-4 border-emerald-200 bg-white shadow-md">
        <div className="h-32 sm:h-40 w-full relative">
          <SceneArtwork sceneKey={unit.roleplay.sceneKey} />
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/35 to-transparent" />
          <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-white/90 text-slate-800 text-xs font-extrabold shadow-xs">
              🎭 {unit.roleplay.sceneNameZh}
            </span>
            {usedFallback && (
              <Link
                href="/parent"
                className="px-2.5 py-1 rounded-full bg-amber-100/95 text-amber-800 text-xs font-bold flex items-center gap-1 hover:bg-amber-200"
              >
                <Settings className="w-3 h-3" />
                <span>本地试玩剧本 · 家长可配大模型</span>
              </Link>
            )}
          </div>
          <div className="absolute right-2 sm:right-6 -bottom-4">
            <DinoCharacter
              mood={mood}
              equippedAccessories={equippedAccessories}
              size={112}
            />
          </div>
        </div>

        {/* 3 Scene Goals Tracker */}
        <div className="p-4 pt-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-2">
            本剧场 3 个小任务（完成 {completedGoalIds.length} / {unit.roleplay.goals.length}）：
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {unit.roleplay.goals.map((g, idx) => {
              const done = completedGoalIds.includes(g.id);
              return (
                <div
                  key={g.id}
                  data-testid={`goal-${g.id}`}
                  className={`rounded-2xl px-3 py-2 border-2 text-xs font-bold flex items-center gap-2 transition ${
                    done
                      ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                      : "bg-slate-50 border-slate-200 text-slate-600"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center text-[10px] font-black shrink-0">
                      {idx + 1}
                    </span>
                  )}
                  <span className="truncate">{g.titleZh}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chat Conversation Stream */}
      <div className="bg-white rounded-3xl border-2 border-emerald-100 p-4 sm:p-5 space-y-3 max-h-[340px] overflow-y-auto">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] sm:max-w-[78%] rounded-3xl px-4 py-3 ${
                m.role === "user"
                  ? "bg-emerald-500 text-white rounded-br-md"
                  : "bg-amber-50/90 border-2 border-amber-200 text-slate-800 rounded-bl-md"
              }`}
            >
              {m.praise && (
                <div className="inline-block mb-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold">
                  ✨ {m.praise}
                </div>
              )}
              <div className="flex items-start gap-2">
                <span className="text-base sm:text-lg font-extrabold leading-snug">
                  {m.englishText}
                </span>
                {m.role === "assistant" && (
                  <button
                    type="button"
                    onClick={() => speak(m.englishText, { lang: "en" })}
                    aria-label="再听一遍"
                    className="p-1.5 rounded-full bg-white hover:bg-amber-100 text-amber-700 shrink-0"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {m.chineseText && (
                <div className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
                  {m.chineseText}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Scene Complete Celebration Banner */}
      {sceneComplete && (
        <div
          data-testid="roleplay-complete-banner"
          className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-3xl p-5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <span className="text-4xl">🏆</span>
            <div>
              <div className="text-xl font-black">情景剧场大通关！获得 +{starsEarned} 颗星星！</div>
              <div className="text-sm text-emerald-50">
                你真是个勇敢开口说英语的小探险家！可以去恐龙小屋喂零食或挑战下一岛啦~
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/pet"
              className="min-h-[46px] px-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-900 font-black flex items-center gap-1.5"
            >
              <span>🍎 喂恐龙</span>
            </Link>
            <Link
              href="/"
              className="min-h-[46px] px-4 rounded-2xl bg-white text-emerald-700 font-black flex items-center gap-1.5"
            >
              <span>🗺️ 回地图</span>
            </Link>
          </div>
        </div>
      )}

      {/* Zero-Foundation Scaffold Suggestion Chips */}
      <div className="bg-amber-50/70 rounded-3xl border-2 border-amber-200 p-4 space-y-2.5">
        <div className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-600" />
          <span>不知道怎么说？先点小喇叭试听，再大声说出来或直接点击卡片回答：</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((chip, i) => (
            <div
              key={`${chip.en}-${i}`}
              className="inline-flex items-stretch rounded-2xl bg-white border-2 border-amber-300 shadow-xs overflow-hidden"
            >
              <button
                type="button"
                onClick={() => {
                  soundEffects.playClick();
                  speak(chip.en, { lang: "en", slow: true });
                }}
                aria-label={`慢速试听 ${chip.en}`}
                className="px-3 bg-amber-100 hover:bg-amber-200 text-amber-800 flex items-center justify-center border-r border-amber-200"
              >
                <Volume2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={sending}
                data-testid={`suggestion-chip-${i}`}
                onClick={() => sendUserTurn(chip.en)}
                className="px-3.5 py-2.5 text-left hover:bg-emerald-50 transition min-h-[48px]"
              >
                <div className="font-black text-sm text-slate-800">
                  {chip.icon} {chip.en}
                </div>
                <div className="text-xs text-slate-500 font-medium">{chip.zh}</div>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Big Kid-Friendly Voice Mic + Optional Typing */}
      <div className="bg-white rounded-3xl border-2 border-slate-200 p-4 flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          disabled={sending}
          onClick={handleMicToggle}
          className={`w-full sm:w-auto min-h-[64px] px-7 rounded-2xl font-black text-base border-b-4 active:border-b-0 active:translate-y-1 transition flex items-center justify-center gap-2 shrink-0 ${
            isListening
              ? "bg-rose-500 text-white border-rose-700 animate-pulse"
              : "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-700"
          }`}
        >
          {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          <span>{isListening ? "点一下结束说话" : "按这里开口说英语"}</span>
        </button>

        <form
          className="flex-1 w-full flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendUserTurn(textDraft);
          }}
        >
          <input
            type="text"
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            placeholder="也可以输入英文或中文问 Dino..."
            className="flex-1 min-h-[52px] rounded-2xl border-2 border-slate-200 focus:border-emerald-400 outline-none px-4 text-sm font-semibold"
          />
          <button
            type="submit"
            disabled={sending || !textDraft.trim()}
            aria-label="发送"
            className="min-h-[52px] px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-bold flex items-center justify-center"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>

      {sttError && (
        <div className="rounded-2xl bg-sky-50 border border-sky-200 px-4 py-2.5 text-xs font-bold text-sky-800">
          {sttError}
        </div>
      )}
    </div>
  );
}
