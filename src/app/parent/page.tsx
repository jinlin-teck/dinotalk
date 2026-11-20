"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Bot,
  CheckCircle2,
  Lock,
  Mic,
  Save,
  ShieldCheck,
  UserCheck,
  Volume2,
  XCircle,
} from "lucide-react";
import { EN_VOICE_OPTIONS, LLM_PRESETS, ZH_VOICE_OPTIONS } from "@/lib/ai/presets";
import { useSpeech } from "@/hooks/useSpeech";

interface SanitizedSettings {
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKeyMasked: string;
  hasLlmApiKey: boolean;
  isLlmReady: boolean;
  llmModel: string;
  llmTemperature: number;
  ttsEngine: "edge" | "openai" | "browser";
  ttsVoiceEn: string;
  ttsVoiceZh: string;
  ttsSpeed: number;
  ttsAutoPlayZh: boolean;
  ttsApiBaseUrl: string;
  ttsApiKeyMasked: string;
  hasTtsApiKey: boolean;
  ttsApiModel: string;
  sttEngine: "browser" | "openai";
  sttApiBaseUrl: string;
  sttApiKeyMasked: string;
  hasSttApiKey: boolean;
  sttApiModel: string;
}

interface ReportData {
  profile: {
    nickname: string;
    companionName: string;
    totalStars: number;
    level: number;
    streakDays: number;
    dailyGoalMinutes: number;
    eyeCareMinutes: number;
  };
  last7Days: Array<{
    dateKey: string;
    label: string;
    studyMinutes: number;
    activitiesCompleted: number;
    wordsPracticed: number;
  }>;
  unitSummary: Array<{
    unitId: string;
    order: number;
    titleZh: string;
    badgeEmoji: string;
    storyDone: boolean;
    phonicsDone: boolean;
    gameDone: boolean;
    roleplayDone: boolean;
    starsEarned: number;
  }>;
  wordStats: Array<{
    itemKey: string;
    itemType: string;
    label: string;
    zh: string;
    masteryLevel: number;
    correctCount: number;
  }>;
  recentSessions: Array<{
    id: number;
    unitId: string;
    mode: string;
    summaryZh: string;
    createdAt: string;
    messages: Array<{
      id: number;
      role: string;
      englishText: string;
      chineseText: string;
    }>;
  }>;
}

export default function ParentConsolePage() {
  const [unlocked, setUnlocked] = useState(false);
  const [mathNums] = useState(() => ({ a: 17, b: 8 }));
  const [gateInput, setGateInput] = useState("");
  const [gateError, setGateError] = useState("");

  const [tab, setTab] = useState<"llm" | "speech" | "profile" | "report">("llm");
  const [settings, setSettings] = useState<SanitizedSettings | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);

  // Form states (keys remain blank unless parent enters a new key)
  const [llmKeyDraft, setLlmKeyDraft] = useState("");
  const [ttsKeyDraft, setTtsKeyDraft] = useState("");
  const [sttKeyDraft, setSttKeyDraft] = useState("");
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [companionDraft, setCompanionDraft] = useState("");
  const [eyeCareDraft, setEyeCareDraft] = useState(15);
  const [dailyGoalDraft, setDailyGoalDraft] = useState(15);

  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    target: string;
    ok: boolean;
    message: string;
    sample?: string;
  } | null>(null);

  const speech = useSpeech();

  const loadAll = useCallback(async () => {
    const [setRes, repRes] = await Promise.all([
      fetch("/api/settings"),
      fetch("/api/report"),
    ]);
    if (setRes.ok) {
      const sd = await setRes.json();
      setSettings(sd.settings);
    }
    if (repRes.ok) {
      const rd = (await repRes.json()) as ReportData;
      setReport(rd);
      if (rd.profile) {
        setNicknameDraft(rd.profile.nickname);
        setCompanionDraft(rd.profile.companionName);
        setEyeCareDraft(rd.profile.eyeCareMinutes);
        setDailyGoalDraft(rd.profile.dailyGoalMinutes);
      }
    }
  }, []);

  useEffect(() => {
    if (unlocked) {
      loadAll();
    }
  }, [unlocked, loadAll]);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(gateInput.trim()) === mathNums.a + mathNums.b) {
      setUnlocked(true);
      setGateError("");
    } else {
      setGateError("算错啦，请再算一遍进入家长模式哦~");
    }
  };

  const applyPreset = (presetId: string) => {
    const preset = LLM_PRESETS.find((p) => p.id === presetId);
    if (!preset || !settings) return;
    setSettings({
      ...settings,
      llmProvider: preset.id,
      llmBaseUrl: preset.baseUrl || settings.llmBaseUrl,
      llmModel: preset.defaultModel || settings.llmModel,
    });
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setSaveNotice(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmProvider: settings.llmProvider,
          llmBaseUrl: settings.llmBaseUrl,
          llmApiKey: llmKeyDraft.trim() ? llmKeyDraft.trim() : undefined,
          llmModel: settings.llmModel,
          llmTemperature: settings.llmTemperature,
          ttsEngine: settings.ttsEngine,
          ttsVoiceEn: settings.ttsVoiceEn,
          ttsVoiceZh: settings.ttsVoiceZh,
          ttsSpeed: settings.ttsSpeed,
          ttsAutoPlayZh: settings.ttsAutoPlayZh,
          ttsApiBaseUrl: settings.ttsApiBaseUrl,
          ttsApiKey: ttsKeyDraft.trim() ? ttsKeyDraft.trim() : undefined,
          ttsApiModel: settings.ttsApiModel,
          sttEngine: settings.sttEngine,
          sttApiBaseUrl: settings.sttApiBaseUrl,
          sttApiKey: sttKeyDraft.trim() ? sttKeyDraft.trim() : undefined,
          sttApiModel: settings.sttApiModel,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        setLlmKeyDraft("");
        setTtsKeyDraft("");
        setSttKeyDraft("");
        setSaveNotice("设置已安全保存至本地服务端数据库！");
      } else {
        setSaveNotice(data.error || "保存失败");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveNotice(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_profile",
          nickname: nicknameDraft,
          companionName: companionDraft,
          dailyGoalMinutes: dailyGoalDraft,
          eyeCareMinutes: eyeCareDraft,
        }),
      });
      if (res.ok) {
        await loadAll();
        setSaveNotice("孩子档案与护眼设置已更新！");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (target: "llm" | "tts" | "stt") => {
    if (!settings) return;
    setTestResult(null);
    const override =
      target === "llm"
        ? {
            provider: settings.llmProvider,
            baseUrl: settings.llmBaseUrl,
            apiKey: llmKeyDraft.trim() || undefined,
            model: settings.llmModel,
          }
        : target === "tts"
        ? {
            engine: settings.ttsEngine,
            voiceEn: settings.ttsVoiceEn,
            speed: settings.ttsSpeed,
            baseUrl: settings.ttsApiBaseUrl,
            apiKey: ttsKeyDraft.trim() || undefined,
            model: settings.ttsApiModel,
          }
        : {
            engine: settings.sttEngine,
            baseUrl: settings.sttApiBaseUrl,
            apiKey: sttKeyDraft.trim() || undefined,
            model: settings.sttApiModel,
          };

    const res = await fetch("/api/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, override }),
    });
    const data = await res.json();
    setTestResult({
      target,
      ok: Boolean(data.ok),
      message: data.message,
      sample: data.sample,
    });
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-xl border-2 border-slate-200 space-y-5">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" /> 返回孩子端
            </Link>
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> 家长锁
            </span>
          </div>

          <div className="text-center space-y-2 pt-2">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800 text-white flex items-center justify-center">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black text-slate-900">进入家长控制台</h1>
            <p className="text-sm text-slate-500">
              为防止小朋友误修改 AI 模型与语音设置，请先完成算术验证：
            </p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="text-center text-3xl font-black text-emerald-700 bg-emerald-50 rounded-2xl py-4 border border-emerald-200">
              {mathNums.a} + {mathNums.b} = ?
            </div>
            <input
              type="number"
              inputMode="numeric"
              value={gateInput}
              onChange={(e) => setGateInput(e.target.value)}
              placeholder="请输入计算结果"
              data-testid="parent-gate-input"
              className="w-full min-h-[50px] rounded-2xl border-2 border-slate-300 focus:border-emerald-500 outline-none px-4 text-center text-xl font-bold"
              autoFocus
            />
            {gateError && (
              <p className="text-xs font-bold text-rose-600 text-center">{gateError}</p>
            )}
            <button
              type="submit"
              data-testid="parent-gate-submit"
              className="w-full min-h-[50px] rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-base transition"
            >
              解锁进入
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="min-h-[40px] px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-sm flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>回到冒险岛</span>
            </Link>
            <h1 className="font-black text-lg sm:text-xl text-slate-900">
              DinoTalk 家长控制台
            </h1>
          </div>

          <div className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600">
            密钥仅保存在服务端 SQLite
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { id: "llm", label: "AI 大模型设置", icon: Bot },
            { id: "speech", label: "语音听读配置", icon: Volume2 },
            { id: "profile", label: "档案与护眼", icon: UserCheck },
            { id: "report", label: "学习成长报告", icon: BarChart3 },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                data-testid={`parent-tab-${t.id}`}
                onClick={() => {
                  setTab(t.id as typeof tab);
                  setSaveNotice(null);
                  setTestResult(null);
                }}
                className={`min-h-[48px] px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition ${
                  active
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {saveNotice && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-bold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{saveNotice}</span>
          </div>
        )}

        {testResult && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-bold flex items-start gap-2 ${
              testResult.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-amber-50 border-amber-200 text-amber-900"
            }`}
          >
            {testResult.ok ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
            ) : (
              <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
            )}
            <div>
              <div>{testResult.message}</div>
              {testResult.sample && (
                <div className="text-xs font-normal mt-1 text-slate-700">
                  模型回复示例：{testResult.sample}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 1: LLM */}
        {tab === "llm" && settings && (
          <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 space-y-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-black text-slate-900">接入 OpenAI 兼容大模型</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  未填写时自动运行「本地智能剧本模式」；填入 Key 后即可解锁 AI 小恐龙自由互动对话。
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-black self-start ${
                  settings.isLlmReady
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {settings.isLlmReady ? "已接入外部 LLM" : "本地试玩剧本模式"}
              </span>
            </div>

            {/* Presets */}
            <div>
              <label className="block text-xs font-extrabold text-slate-600 mb-2">
                快速选择厂商预设：
              </label>
              <div className="flex flex-wrap gap-2">
                {LLM_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                      settings.llmProvider === p.id
                        ? "bg-emerald-500 text-white border-emerald-600"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {p.labelZh}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {LLM_PRESETS.find((p) => p.id === settings.llmProvider)?.hintZh}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                  Base URL（接口地址）
                </label>
                <input
                  type="text"
                  value={settings.llmBaseUrl}
                  onChange={(e) => setSettings({ ...settings, llmBaseUrl: e.target.value })}
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                  Model（模型名称）
                </label>
                <input
                  type="text"
                  value={settings.llmModel}
                  onChange={(e) => setSettings({ ...settings, llmModel: e.target.value })}
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                API Key（密钥加密保存在服务端，页面仅展示脱敏状态）
              </label>
              <input
                type="password"
                value={llmKeyDraft}
                onChange={(e) => setLlmKeyDraft(e.target.value)}
                placeholder={
                  settings.hasLlmApiKey
                    ? `已保存：${settings.llmApiKeyMasked}（留空则保持不变）`
                    : "请输入 API Key（本地 Ollama 可留空）"
                }
                data-testid="llm-key-input"
                className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium"
              />
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                disabled={saving}
                data-testid="save-settings-btn"
                onClick={handleSaveSettings}
                className="min-h-[46px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "保存中..." : "保存模型配置"}</span>
              </button>
              <button
                type="button"
                onClick={() => handleTest("llm")}
                className="min-h-[46px] px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm"
              >
                测试连接
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Speech */}
        {tab === "speech" && settings && (
          <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 space-y-6 shadow-xs">
            <div>
              <h2 className="text-lg font-black text-slate-900">TTS 播音设置</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Edge-TTS 默认提供自然童声并自动缓存音频；网络受限时会自动降级到浏览器内置语音，孩子端零报错。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3">
                {[
                  { id: "edge", title: "Edge-TTS（推荐）", desc: "免费神经童声 + 本地缓存" },
                  { id: "openai", title: "OpenAI 兼容语音", desc: "自定义 /v1/audio/speech" },
                  { id: "browser", title: "浏览器原生语音", desc: "纯离线免请求，随处可用" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setSettings({
                        ...settings,
                        ttsEngine: opt.id as SanitizedSettings["ttsEngine"],
                      })
                    }
                    className={`p-3.5 rounded-2xl border-2 text-left transition ${
                      settings.ttsEngine === opt.id
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="font-black text-sm text-slate-900">{opt.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                  英文发音人（Edge）
                </label>
                <select
                  value={settings.ttsVoiceEn}
                  onChange={(e) => setSettings({ ...settings, ttsVoiceEn: e.target.value })}
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm bg-white"
                >
                  {EN_VOICE_OPTIONS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.labelZh}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                  中文引导音色（Edge）
                </label>
                <select
                  value={settings.ttsVoiceZh}
                  onChange={(e) => setSettings({ ...settings, ttsVoiceZh: e.target.value })}
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm bg-white"
                >
                  {ZH_VOICE_OPTIONS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.labelZh}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                  默认语速：{settings.ttsSpeed.toFixed(2)}x（零基础推荐 0.85x）
                </label>
                <input
                  type="range"
                  min={0.65}
                  max={1.1}
                  step={0.05}
                  value={settings.ttsSpeed}
                  onChange={(e) =>
                    setSettings({ ...settings, ttsSpeed: Number(e.target.value) })
                  }
                  className="w-full mt-2 accent-emerald-600"
                />
              </div>
            </div>

            {settings.ttsEngine === "openai" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <input
                  type="text"
                  value={settings.ttsApiBaseUrl}
                  onChange={(e) => setSettings({ ...settings, ttsApiBaseUrl: e.target.value })}
                  placeholder="TTS Base URL (如 https://api.openai.com/v1)"
                  className="h-10 rounded-xl border border-slate-300 px-3 text-sm bg-white"
                />
                <input
                  type="password"
                  value={ttsKeyDraft}
                  onChange={(e) => setTtsKeyDraft(e.target.value)}
                  placeholder={settings.hasTtsApiKey ? `已保存：${settings.ttsApiKeyMasked}` : "TTS API Key"}
                  className="h-10 rounded-xl border border-slate-300 px-3 text-sm bg-white"
                />
                <input
                  type="text"
                  value={settings.ttsApiModel}
                  onChange={(e) => setSettings({ ...settings, ttsApiModel: e.target.value })}
                  placeholder="Model (如 tts-1)"
                  className="h-10 rounded-xl border border-slate-300 px-3 text-sm bg-white"
                />
              </div>
            )}

            <div className="border-t border-slate-100 pt-5 space-y-3">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Mic className="w-5 h-5 text-emerald-600" />
                <span>STT 听孩子说话识别方式</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    id: "browser",
                    title: "浏览器原生语音识别",
                    desc: "零配置免费用，Chrome / Edge 体验佳",
                  },
                  {
                    id: "openai",
                    title: "云端 Whisper 接口（推荐 iPad）",
                    desc: "支持 iPad Safari PWA，自带当前单元词库识别偏置",
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setSettings({
                        ...settings,
                        sttEngine: opt.id as SanitizedSettings["sttEngine"],
                      })
                    }
                    className={`p-3.5 rounded-2xl border-2 text-left transition ${
                      settings.sttEngine === opt.id
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="font-black text-sm">{opt.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>

              {settings.sttEngine === "openai" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <input
                    type="text"
                    value={settings.sttApiBaseUrl}
                    onChange={(e) => setSettings({ ...settings, sttApiBaseUrl: e.target.value })}
                    placeholder="Whisper Base URL"
                    className="h-10 rounded-xl border border-slate-300 px-3 text-sm bg-white"
                  />
                  <input
                    type="password"
                    value={sttKeyDraft}
                    onChange={(e) => setSttKeyDraft(e.target.value)}
                    placeholder={settings.hasSttApiKey ? `已保存：${settings.sttApiKeyMasked}` : "STT API Key"}
                    className="h-10 rounded-xl border border-slate-300 px-3 text-sm bg-white"
                  />
                  <input
                    type="text"
                    value={settings.sttApiModel}
                    onChange={(e) => setSettings({ ...settings, sttApiModel: e.target.value })}
                    placeholder="Model (如 whisper-1)"
                    className="h-10 rounded-xl border border-slate-300 px-3 text-sm bg-white"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveSettings}
                className="min-h-[46px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>保存语音配置</span>
              </button>
              <button
                type="button"
                onClick={() => speech.speak("Hello! Let's learn English together!", { lang: "en", slow: false })}
                className="min-h-[46px] px-5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-sm"
              >
                🔊 试听童声
              </button>
              <button
                type="button"
                onClick={() => handleTest("tts")}
                className="min-h-[46px] px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm"
              >
                测试服务端 TTS
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: Profile & Eye Care */}
        {tab === "profile" && (
          <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 space-y-5 shadow-xs">
            <h2 className="text-lg font-black text-slate-900">宝贝学习档案与护眼设置</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                  孩子昵称（AI 伙伴会这样称呼宝贝）
                </label>
                <input
                  type="text"
                  value={nicknameDraft}
                  onChange={(e) => setNicknameDraft(e.target.value)}
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                  恐龙伙伴名字
                </label>
                <input
                  type="text"
                  value={companionDraft}
                  onChange={(e) => setCompanionDraft(e.target.value)}
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                  每日目标学习时长（分钟）
                </label>
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={dailyGoalDraft}
                  onChange={(e) => setDailyGoalDraft(Number(e.target.value))}
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                  护眼休息提醒间隔（分钟）
                </label>
                <select
                  value={eyeCareDraft}
                  onChange={(e) => setEyeCareDraft(Number(e.target.value))}
                  className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm bg-white"
                >
                  <option value={10}>每 10 分钟提醒一次</option>
                  <option value={15}>每 15 分钟提醒一次（推荐）</option>
                  <option value={20}>每 20 分钟提醒一次</option>
                  <option value={30}>每 30 分钟提醒一次</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={handleSaveProfile}
              className="min-h-[46px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>保存档案设置</span>
            </button>
          </div>
        )}

        {/* TAB 4: Learning Report */}
        {tab === "report" && report && (
          <div className="space-y-6">
            {/* 7-day bar chart */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-4">
              <h2 className="text-lg font-black text-slate-900">近 7 天学习活跃趋势</h2>
              <div className="grid grid-cols-7 gap-2 items-end h-40 pt-4">
                {report.last7Days.map((d) => {
                  const maxVal = Math.max(
                    5,
                    ...report.last7Days.map((x) => x.studyMinutes + x.activitiesCompleted * 2)
                  );
                  const score = d.studyMinutes + d.activitiesCompleted * 2;
                  const pct = Math.max(8, Math.round((score / maxVal) * 100));
                  return (
                    <div key={d.dateKey} className="flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className="text-[11px] font-bold text-slate-500">
                        {d.activitiesCompleted}项
                      </span>
                      <div
                        className="w-full max-w-[38px] rounded-t-xl bg-emerald-500 transition-all"
                        style={{ height: `${pct}%` }}
                        title={`${d.dateKey}: ${d.studyMinutes}分钟, ${d.activitiesCompleted}项活动`}
                      />
                      <span className="text-xs font-bold text-slate-600">{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Unit Progress Matrix */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-4">
              <h2 className="text-lg font-black text-slate-900">L0 启蒙岛 10 单元学习进度</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {report.unitSummary.map((u) => (
                  <div
                    key={u.unitId}
                    data-testid={`report-unit-${u.unitId}`}
                    className="rounded-2xl border border-slate-200 p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{u.badgeEmoji}</span>
                      <div>
                        <div className="font-bold text-sm text-slate-900">
                          U{u.order}. {u.titleZh}
                        </div>
                        <div className="text-xs text-slate-500">
                          {[
                            u.storyDone ? "绘本✓" : "绘本○",
                            u.phonicsDone ? "拼读✓" : "拼读○",
                            u.gameDone ? "游戏✓" : "游戏○",
                            u.roleplayDone ? "剧场✓" : "剧场○",
                          ].join(" · ")}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-black text-amber-600 shrink-0">
                      {u.starsEarned}/4⭐
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Word Mastery Wall */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-3">
              <h2 className="text-lg font-black text-slate-900">
                已接触词汇与拼读掌握墙（共 {report.wordStats.length} 项）
              </h2>
              {report.wordStats.length === 0 ? (
                <p className="text-sm text-slate-500">孩子还没有开始学习记录，先去体验第一关吧~</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {report.wordStats.map((w) => (
                    <div
                      key={w.itemKey}
                      className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900"
                    >
                      {w.label} <span className="text-slate-500">({w.zh})</span> · Lv.{w.masteryLevel}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent AI Dialogues */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-4">
              <h2 className="text-lg font-black text-slate-900">最近 AI 情景对话回顾</h2>
              {report.recentSessions.length === 0 ? (
                <p className="text-sm text-slate-500">暂无 AI 情景对话记录。</p>
              ) : (
                <div className="space-y-4">
                  {report.recentSessions.map((sess) => (
                    <div
                      key={sess.id}
                      data-testid={`report-session-${sess.id}`}
                      className="rounded-2xl border border-slate-200 p-4 space-y-2 bg-slate-50/70"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                        <span>{sess.summaryZh}</span>
                        <span>{sess.mode === "roleplay" ? "情景剧场" : "自由聊天"}</span>
                      </div>
                      <div className="space-y-1.5">
                        {sess.messages.map((m) => (
                          <div key={m.id} className="text-xs">
                            <span className="font-black text-slate-800">
                              {m.role === "user" ? "宝贝：" : "Dino："}
                            </span>
                            <span className="text-slate-700">{m.englishText}</span>
                            {m.chineseText && (
                              <span className="text-slate-500 ml-1.5">({m.chineseText})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
