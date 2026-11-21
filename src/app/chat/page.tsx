"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Sparkles, Volume2 } from "lucide-react";
import { AppShell, type ProfileSummary } from "@/components/AppShell";
import { DinoCharacter } from "@/components/illustrations/DinoCharacter";
import { FREETALK_TOPICS } from "@/data/curriculum";
import type { EmotionMood, SuggestionChip } from "@/data/curriculum/types";
import { useSpeech } from "@/hooks/useSpeech";
import { soundEffects } from "@/lib/sound-effects";

interface ChatTurn {
  id: string;
  role: "assistant" | "user";
  englishText: string;
  chineseText?: string;
}

export default function FreeTalkPage() {
  const [profile, setProfile] = useState<(ProfileSummary & { equippedAccessories?: string[] }) | null>(null);
  const [dueReviewCount, setDueReviewCount] = useState(0);
  const [activeTopicId, setActiveTopicId] = useState(FREETALK_TOPICS[0].id);
  const [sessionId, setSessionId] = useState<number | undefined>(undefined);
  const [messages, setMessages] = useState<ChatTurn[]>([
    {
      id: "init-0",
      role: "assistant",
      englishText: FREETALK_TOPICS[0].starterPromptEn,
      chineseText: FREETALK_TOPICS[0].starterZh,
    },
  ]);
  const [suggestions, setSuggestions] = useState<SuggestionChip[]>(
    FREETALK_TOPICS[0].quickChips
  );
  const [mood, setMood] = useState<EmotionMood>("happy");
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const speech = useSpeech();

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setProfile(d.profile);
        setDueReviewCount(d.dueReviewCount ?? 0);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const selectTopic = (topicId: string) => {
    const topic = FREETALK_TOPICS.find((t) => t.id === topicId);
    if (!topic) return;
    soundEffects.playClick();
    setActiveTopicId(topicId);
    setSessionId(undefined);
    setSuggestions(topic.quickChips);
    setMessages([
      {
        id: `topic-${topicId}-${Date.now()}`,
        role: "assistant",
        englishText: topic.starterPromptEn,
        chineseText: topic.starterZh,
      },
    ]);
    speech.speak(topic.starterPromptEn, { lang: "en" });
  };

  const sendMessage = async (text: string) => {
    const clean = text.trim();
    if (!clean || sending) return;
    soundEffects.playClick();
    setSending(true);
    setMood("thinking");
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", englishText: clean }]);

    try {
      const res = await fetch("/api/agent/freetalk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          topicId: activeTopicId,
          userText: clean,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.response) {
        throw new Error(data?.error || "freetalk_failed");
      }
      if (data.sessionId) setSessionId(data.sessionId);
      const resp = data.response;
      setMood(resp.emotion || "happy");
      setSuggestions(resp.nextSuggestions || []);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          englishText: resp.englishReply,
          chineseText: resp.chineseHint,
        },
      ]);
      speech.speak(resp.englishReply, { lang: "en" });
    } catch {
      setMood("happy");
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          englishText: "Oops! Let's try again!",
          chineseText: "刚才信号开小差啦，再发一次或点上面提示气泡试试看~",
        },
      ]);
    } finally {
      setSending(false);
      setDraft("");
    }
  };

  return (
    <AppShell profile={profile} dueReviewCount={dueReviewCount}>
      <div className="space-y-5">
        {/* Header with Dino */}
        <div className="bg-white rounded-3xl border-2 border-emerald-200 p-4 sm:p-5 flex items-center gap-4">
          <DinoCharacter
            mood={mood}
            equippedAccessories={profile?.equippedAccessories ?? []}
            size={92}
            className="shrink-0"
          />
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">
              和 {profile?.companionName ?? "Dino"} 自由聊英语
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-0.5">
              可以用中文问单词怎么说，也可以用英文跟 Dino 玩猜谜和聊天哦！
            </p>
          </div>
        </div>

        {/* Starter Topic Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {FREETALK_TOPICS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTopic(t.id)}
              className={`p-3 rounded-2xl border-2 text-left transition ${
                activeTopicId === t.id
                  ? "bg-emerald-500 text-white border-emerald-700 shadow-xs"
                  : "bg-white text-slate-800 border-slate-200 hover:bg-emerald-50"
              }`}
            >
              <div className="text-xl mb-0.5">{t.emoji}</div>
              <div className="font-black text-sm">{t.titleZh}</div>
            </button>
          ))}
        </div>

        {/* Chat Stream */}
        <div className="bg-white rounded-3xl border-2 border-emerald-100 p-4 sm:p-5 space-y-3 max-h-[340px] overflow-y-auto">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] sm:max-w-[75%] rounded-3xl px-4 py-3 ${
                  m.role === "user"
                    ? "bg-emerald-500 text-white rounded-br-md"
                    : "bg-amber-50 border-2 border-amber-200 text-slate-800 rounded-bl-md"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="font-extrabold text-base sm:text-lg">{m.englishText}</span>
                  {m.role === "assistant" && (
                    <button
                      type="button"
                      onClick={() => speech.speak(m.englishText, { lang: "en" })}
                      className="p-1.5 rounded-full bg-white hover:bg-amber-100 text-amber-700 shrink-0"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {m.chineseText && (
                  <div className="text-xs sm:text-sm text-slate-600 mt-1">{m.chineseText}</div>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Quick Chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold text-amber-800 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" /> 试试这样问：
          </span>
          {suggestions.map((c, idx) => (
            <button
              key={`${c.en}-${idx}`}
              type="button"
              disabled={sending}
              onClick={() => sendMessage(c.en)}
              className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-amber-50 hover:bg-amber-100 border-2 border-amber-200 text-slate-800 text-xs sm:text-sm font-bold transition"
            >
              {c.icon} {c.en} <span className="text-slate-500">({c.zh})</span>
            </button>
          ))}
        </div>

        {/* Mic + Input */}
        <div className="bg-white rounded-3xl border-2 border-slate-200 p-4 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            disabled={sending}
            onClick={() => {
              if (speech.isListening) {
                speech.stopListening();
              } else {
                speech.startListening("hello, apple, panda, blue, happy", (t) => sendMessage(t));
              }
            }}
            className={`w-full sm:w-auto min-h-[56px] px-6 rounded-2xl font-black text-sm border-b-4 transition flex items-center justify-center gap-2 shrink-0 ${
              speech.isListening
                ? "bg-rose-500 text-white border-rose-700 animate-pulse"
                : "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-700"
            }`}
          >
            {speech.isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            <span>{speech.isListening ? "点此结束" : "语音聊天"}</span>
          </button>

          <form
            className="flex-1 w-full flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(draft);
            }}
          >
            <input
              type="text"
              maxLength={300}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="输入中文或英文，例如：西瓜/苹果用英语怎么说？"
              className="flex-1 min-h-[50px] rounded-2xl border-2 border-slate-200 focus:border-emerald-400 outline-none px-4 text-sm font-semibold"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="min-h-[50px] px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-bold flex items-center justify-center"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>

        {speech.sttError && (
          <div className="rounded-2xl bg-sky-50 border border-sky-200 px-4 py-2 text-xs font-bold text-sky-800">
            {speech.sttError}
          </div>
        )}
      </div>
    </AppShell>
  );
}
