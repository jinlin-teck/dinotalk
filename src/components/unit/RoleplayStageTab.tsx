"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Volume2,
} from "lucide-react";
import type { EmotionMood, SuggestionChip, UnitDef } from "@/data/curriculum/types";
import { personalizeSuggestionChips } from "@/lib/ai/fallback-agent";
import { DinoCharacter } from "@/components/illustrations/DinoCharacter";
import { SceneArtwork } from "@/components/illustrations/SceneArtwork";
import { soundEffects } from "@/lib/sound-effects";
import type { ListenOptions, ListenTranscriptMeta, SpeakSequenceItem } from "@/hooks/useSpeech";
import type { UnlockedAccessoryNotice } from "@/types/api";

interface ChatTurn {
  id: string;
  role: "assistant" | "user";
  englishText: string;
  chineseText?: string;
  praise?: string;
}

interface RoleplayStageTabProps {
  unit: UnitDef;
  isActive: boolean;
  childNickname?: string;
  avatarId?: string;
  equippedAccessories: string[];
  nextUnit?: UnitDef;
  ttsAutoPlayZh: boolean;
  audioMeterRef: RefObject<HTMLSpanElement | null>;
  listenCountdownSec: number | null;
  speak: (text: string, opts?: { lang?: "en" | "zh"; slow?: boolean }) => Promise<void>;
  speakSequence: (items: SpeakSequenceItem[]) => Promise<void>;
  isListening: boolean;
  sttError: string | null;
  startListening: (
    hints: string,
    onTranscript: (t: string, meta?: ListenTranscriptMeta) => void,
    opts?: ListenOptions
  ) => Promise<void>;
  stopListening: () => void;
  cancelListening: () => void;
  onStarsUpdated: () => Promise<void>;
  onUnlockedAccessory?: (acc: UnlockedAccessoryNotice) => void;
}

export function RoleplayStageTab({
  unit,
  isActive,
  childNickname,
  avatarId,
  equippedAccessories,
  nextUnit,
  ttsAutoPlayZh,
  audioMeterRef,
  listenCountdownSec,
  speak,
  speakSequence,
  isListening,
  sttError,
  startListening,
  stopListening,
  cancelListening,
  onStarsUpdated,
  onUnlockedAccessory,
}: RoleplayStageTabProps) {
  const personalizedOpening = useMemo(
    () => personalizeSuggestionChips(unit.roleplay.openingSuggestions, childNickname),
    [unit.roleplay.openingSuggestions, childNickname]
  );

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
  const [suggestions, setSuggestions] = useState<SuggestionChip[]>(personalizedOpening);
  const [mood, setMood] = useState<EmotionMood>("happy");
  const [sending, setSending] = useState(false);
  const [usedFallback, setUsedFallback] = useState<boolean | null>(null);
  const [sceneComplete, setSceneComplete] = useState(false);
  const [starsEarned, setStarsEarned] = useState(0);
  const [voiceBonusStars, setVoiceBonusStars] = useState(0);
  const [textDraft, setTextDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const hasAutoSpokenOpeningRef = useRef(false);
  const sessionSeqRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);
  const isActiveRef = useRef(isActive);

  useLayoutEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    return () => {
      requestAbortRef.current?.abort();
    };
  }, []);

  const vocabHints = unit.vocab.map((v) => v.word).join(", ");

  // Update opening suggestions once profile nickname loads (only before first user turn)
  useEffect(() => {
    if (messages.length === 1 && !sessionId) {
      setSuggestions(personalizedOpening);
    }
  }, [personalizedOpening, messages.length, sessionId]);

  const speakAssistantTurn = useCallback(
    (englishText: string, chineseText?: string) => {
      if (ttsAutoPlayZh && chineseText?.trim()) {
        void speakSequence([
          { text: englishText, lang: "en" },
          { text: chineseText, lang: "zh" },
        ]);
      } else {
        void speak(englishText, { lang: "en" });
      }
    },
    [speak, speakSequence, ttsAutoPlayZh]
  );

  // Auto-speak opening line when user enters the Roleplay stage
  useEffect(() => {
    if (!isActive || hasAutoSpokenOpeningRef.current) return;
    hasAutoSpokenOpeningRef.current = true;
    speakAssistantTurn(unit.roleplay.openingEn, unit.roleplay.openingZh);
  }, [isActive, speakAssistantTurn, unit.roleplay.openingEn, unit.roleplay.openingZh]);

  useEffect(() => {
    if (isActive) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isActive, messages.length]);

  const sendUserTurn = async (text: string, fromVoice = false, voiceProof?: string) => {
    const clean = text.trim();
    if (!isActiveRef.current || !clean || requestAbortRef.current) return;

    const reqSeq = sessionSeqRef.current;
    cancelListening();
    const controller = new AbortController();
    requestAbortRef.current = controller;

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
          usedVoice: fromVoice,
          voiceProof,
        }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (reqSeq !== sessionSeqRef.current) return;
      if (!res.ok || !data?.response) {
        throw new Error(data?.error || "roleplay_failed");
      }
      if (data.sessionId) setSessionId(data.sessionId);

      const resp = data.response;
      setMood(resp.emotion || "happy");
      setCompletedGoalIds(resp.completedGoalIds || []);
      setSuggestions(personalizeSuggestionChips(resp.nextSuggestions || [], childNickname));
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

      if (isActiveRef.current) speakAssistantTurn(resp.englishReply, resp.chineseHint);

      if (resp.isSceneComplete) {
        setSceneComplete(true);
        if (typeof data.starsAwarded === "number" && data.starsAwarded > 0) {
          setStarsEarned(data.starsAwarded);
        }
        if (typeof data.voiceBonusStars === "number" && data.voiceBonusStars > 0) {
          setVoiceBonusStars(data.voiceBonusStars);
        }
        if (data.unlockedAccessory && onUnlockedAccessory) {
          onUnlockedAccessory(data.unlockedAccessory);
        }
        if (isActiveRef.current) soundEffects.playCelebrate();
        await onStarsUpdated();
      } else if (isActiveRef.current && (resp.completedGoalIds?.length ?? 0) > completedGoalIds.length) {
        soundEffects.playStar();
      }
    } catch {
      if (reqSeq !== sessionSeqRef.current) return;
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
      if (requestAbortRef.current === controller) {
        requestAbortRef.current = null;
      }
      if (reqSeq === sessionSeqRef.current) {
        setSending(false);
        setTextDraft("");
      }
    }
  };

  const handleMicToggle = () => {
    if (isListening) {
      stopListening();
      return;
    }
    soundEffects.playClick();
    const recordingSession = sessionSeqRef.current;
    startListening(
      vocabHints,
      (transcript, meta) => {
        if (recordingSession === sessionSeqRef.current) {
          void sendUserTurn(transcript, true, meta?.voiceProof);
        }
      },
      { lang: "en", voiceProofPurpose: "roleplay" }
    );
  };

  const handleReplayScene = () => {
    soundEffects.playClick();
    sessionSeqRef.current += 1;
    cancelListening();
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    setSending(false);
    setTextDraft("");
    setSessionId(undefined);
    setCompletedGoalIds([]);
    setSceneComplete(false);
    setStarsEarned(0);
    setVoiceBonusStars(0);
    setMood("happy");
    setSuggestions(personalizedOpening);
    setMessages([
      {
        id: `opening-${Date.now()}`,
        role: "assistant",
        englishText: unit.roleplay.openingEn,
        chineseText: unit.roleplay.openingZh,
      },
    ]);
    speakAssistantTurn(unit.roleplay.openingEn, unit.roleplay.openingZh);
  };

  return (
    <div className="space-y-4">
      {/* Immersive Scene Banner + Progress-Linked SVG + Animated Dino */}
      <div className="relative rounded-3xl overflow-hidden border-4 border-emerald-200 bg-white shadow-md">
        <div className="h-36 sm:h-44 w-full relative">
          <SceneArtwork
            sceneKey={unit.roleplay.sceneKey}
            completedCount={completedGoalIds.length}
          />
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
              avatarId={avatarId}
              equippedAccessories={equippedAccessories}
              size={112}
            />
          </div>
        </div>

        {/* 3 Scene Goals Tracker */}
        <div className="p-4 pt-5 bg-white space-y-2.5">
          {unit.roleplay.introZh && (
            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
              {unit.roleplay.introZh}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
            <span>
              本剧场 3 个小任务（完成 {completedGoalIds.length} / {unit.roleplay.goals.length}）：
            </span>
            <span className="text-emerald-700">
              🎙️ 首次通关前用麦克风开口，额外赢 1 颗勇敢星！
            </span>
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
              className={`max-w-[90%] sm:max-w-[78%] rounded-3xl px-4 py-3 ${
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
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => speak(m.englishText, { lang: "en" })}
                      aria-label="再听一遍"
                      className="p-1.5 rounded-full bg-white hover:bg-amber-100 text-amber-700"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => speak(m.englishText, { lang: "en", slow: true })}
                      aria-label="慢速再听一遍"
                      className="px-1.5 py-0.5 rounded-full bg-white hover:bg-amber-100 text-xs font-bold text-amber-700"
                    >
                      🐌
                    </button>
                  </div>
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
              <div className="text-xl font-black">
                情景剧场大通关！获得 +{starsEarned} 颗星星！
                {voiceBonusStars > 0 && (
                  <span className="ml-1.5 text-sm bg-amber-400 text-slate-900 px-2 py-0.5 rounded-full">
                    含 +{voiceBonusStars} 勇敢开口星
                  </span>
                )}
              </div>
              <div className="text-sm text-emerald-50">
                {childNickname ? `${childNickname}，` : ""}你真是个勇敢开口说英语的小冠军！可以再演一遍、去恐龙小屋喂零食，或直接去下一关~
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleReplayScene}
              className="min-h-[44px] px-3.5 rounded-2xl bg-white/20 hover:bg-white/30 text-white font-bold text-sm flex items-center gap-1"
            >
              <RotateCcw className="w-4 h-4" />
              <span>再演一遍</span>
            </button>
            <Link
              href="/pet"
              className="min-h-[44px] px-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-900 font-black text-sm flex items-center gap-1"
            >
              <span>🍎 喂恐龙</span>
            </Link>
            {nextUnit ? (
              <Link
                href={`/unit/${nextUnit.id}`}
                onClick={() => soundEffects.playClick()}
                className="min-h-[44px] px-4 rounded-2xl bg-white text-emerald-700 font-black text-sm flex items-center gap-1"
              >
                <span>下一关：U{nextUnit.order}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <Link
                href="/"
                className="min-h-[44px] px-4 rounded-2xl bg-white text-emerald-700 font-black text-sm flex items-center gap-1"
              >
                <span>🗺️ 回地图</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Zero-Foundation Scaffold Suggestion Chips */}
      <div className="bg-amber-50/70 rounded-3xl border-2 border-amber-200 p-4 space-y-2.5">
        <div className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-600" />
          <span>不知道怎么说？先点小喇叭慢速试听，再大声开口说出来（或直接点击卡片回答）：</span>
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
                onClick={() => sendUserTurn(chip.en, false)}
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

      {/* Big Kid-Friendly Voice Mic with volume meter & countdown + Optional Typing */}
      <div className="bg-white rounded-3xl border-2 border-slate-200 p-4 flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          disabled={sending}
          onClick={handleMicToggle}
          className={`relative w-full sm:w-auto min-h-[64px] px-7 rounded-2xl font-black text-base border-b-4 active:border-b-0 active:translate-y-1 transition flex items-center justify-center gap-2 shrink-0 ${
            isListening
              ? "bg-rose-500 text-white border-rose-700"
              : "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-700"
          }`}
        >
          <span
            ref={isActive ? audioMeterRef : undefined}
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 rounded-[inherit] ring-4 ring-rose-500/25 ${isListening ? "" : "opacity-0"}`}
          />
          {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          <span>
            {isListening
              ? listenCountdownSec !== null
                ? `点此结束 (${listenCountdownSec}s)`
                : "点一下结束说话"
              : "按这里开口说英语"}
          </span>
        </button>

        <form
          className="flex-1 w-full flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendUserTurn(textDraft, false);
          }}
        >
          <input
            type="text"
            maxLength={300}
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
