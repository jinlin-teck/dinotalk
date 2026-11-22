"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Bot,
  CheckCircle2,
  LogOut,
  UserCheck,
  Volume2,
  XCircle,
} from "lucide-react";
import { LLM_PRESETS } from "@/lib/ai/presets";
import { useSpeech } from "@/hooks/useSpeech";
import { ParentGate } from "@/components/parent/ParentGate";
import { LlmSettingsTab } from "@/components/parent/LlmSettingsTab";
import { SpeechSettingsTab } from "@/components/parent/SpeechSettingsTab";
import { ProfileSettingsTab } from "@/components/parent/ProfileSettingsTab";
import { LearningReportTab } from "@/components/parent/LearningReportTab";
import type { ParentManagedProfile, ReportData, SanitizedSettings } from "@/types/api";

export default function ParentConsolePage() {
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState<"llm" | "speech" | "profile" | "report">("llm");
  const [settings, setSettings] = useState<SanitizedSettings | null>(null);
  const [savedLlmBaseUrl, setSavedLlmBaseUrl] = useState("");

  const [profiles, setProfiles] = useState<ParentManagedProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);
  const [selectedReportProfileId, setSelectedReportProfileId] = useState<number | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);

  const [llmKeyDraft, setLlmKeyDraft] = useState("");
  const [ttsKeyDraft, setTtsKeyDraft] = useState("");
  const [sttKeyDraft, setSttKeyDraft] = useState("");

  const [saving, setSaving] = useState(false);
  const [testingTarget, setTestingTarget] = useState<"llm" | "tts" | "stt" | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{
    target: string;
    ok: boolean;
    message: string;
    sample?: string;
  } | null>(null);

  const speech = useSpeech();

  const fetchReportForProfile = useCallback(async (profileId: number | null) => {
    const query = profileId !== null ? `?profileId=${profileId}` : "";
    const repRes = await fetch(`/api/report${query}`, { cache: "no-store" });
    if (repRes.status === 401) {
      setUnlocked(false);
      return;
    }
    if (repRes.ok) {
      const rd = (await repRes.json()) as ReportData;
      setReport(rd);
    }
  }, []);

  const loadAll = useCallback(
    async (preferredProfileId?: number | null) => {
      try {
        const [setRes, profRes] = await Promise.all([
          fetch("/api/settings", { cache: "no-store" }),
          fetch("/api/parent/profiles", { cache: "no-store" }),
        ]);
        if (setRes.status === 401 || profRes.status === 401) {
          setUnlocked(false);
          return;
        }
        if (setRes.ok) {
          const sd = await setRes.json();
          setSettings(sd.settings);
          setSavedLlmBaseUrl(sd.settings?.llmBaseUrl ?? "");
        }

        let targetReportId: number | null = null;
        if (profRes.ok) {
          const pd = (await profRes.json()) as {
            profiles?: ParentManagedProfile[];
            activeProfileId?: number | null;
          };
          const list = pd.profiles ?? [];
          const activeId = pd.activeProfileId ?? null;
          setProfiles(list);
          setActiveProfileId(activeId);

          const candidateIds = [
            preferredProfileId,
            selectedReportProfileId,
            activeId,
            list[0]?.id ?? null,
          ];
          targetReportId =
            candidateIds.find(
              (id): id is number =>
                typeof id === "number" && list.some((item) => item.id === id)
            ) ?? null;
          setSelectedReportProfileId(targetReportId);
        }

        await fetchReportForProfile(targetReportId);
      } catch {
        setNotice({ ok: false, text: "加载配置或成长报告失败，请刷新重试" });
      }
    },
    [fetchReportForProfile, selectedReportProfileId]
  );

  useEffect(() => {
    if (unlocked) {
      void loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

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

  const handleSaveSettings = async (extraFlags?: {
    clearLlmApiKey?: boolean;
    clearTtsApiKey?: boolean;
    clearSttApiKey?: boolean;
  }) => {
    if (!settings || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmProvider: settings.llmProvider,
          llmBaseUrl: settings.llmBaseUrl,
          llmApiKey: llmKeyDraft.trim() ? llmKeyDraft.trim() : undefined,
          clearLlmApiKey: extraFlags?.clearLlmApiKey,
          llmModel: settings.llmModel,
          llmTemperature: settings.llmTemperature,
          ttsEngine: settings.ttsEngine,
          ttsVoiceEn: settings.ttsVoiceEn,
          ttsVoiceZh: settings.ttsVoiceZh,
          ttsSpeed: settings.ttsSpeed,
          ttsAutoPlayZh: settings.ttsAutoPlayZh,
          ttsApiBaseUrl: settings.ttsApiBaseUrl,
          ttsApiKey: ttsKeyDraft.trim() ? ttsKeyDraft.trim() : undefined,
          clearTtsApiKey: extraFlags?.clearTtsApiKey,
          ttsApiModel: settings.ttsApiModel,
          sttEngine: settings.sttEngine,
          sttApiBaseUrl: settings.sttApiBaseUrl,
          sttApiKey: sttKeyDraft.trim() ? sttKeyDraft.trim() : undefined,
          clearSttApiKey: extraFlags?.clearSttApiKey,
          sttApiModel: settings.sttApiModel,
        }),
      });
      if (res.status === 401) {
        setUnlocked(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.settings) {
        setSettings(data.settings);
        setSavedLlmBaseUrl(data.settings.llmBaseUrl ?? "");
        setLlmKeyDraft("");
        setTtsKeyDraft("");
        setSttKeyDraft("");
        setNotice({
          ok: true,
          text: extraFlags ? "已清除对应密钥并保存最新配置！" : "设置已安全保存至本地服务端数据库！",
        });
      } else {
        setNotice({ ok: false, text: data.error || "保存失败" });
      }
    } catch {
      setNotice({ ok: false, text: "网络异常，保存配置失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateProfile = async (input: {
    nickname: string;
    companionName: string;
    dailyGoalMinutes: number;
    eyeCareMinutes: number;
  }): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/parent/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.status === 401) {
        setUnlocked(false);
        return false;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.profile) {
        await loadAll(data.profile.id);
        setNotice({ ok: true, text: `已新建「${data.profile.nickname}」的学习档案！` });
        return true;
      }
      setNotice({ ok: false, text: data.error || "新建档案失败" });
      return false;
    } catch {
      setNotice({ ok: false, text: "网络异常，新建档案失败" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProfile = async (
    profileId: number,
    input: {
      nickname: string;
      companionName: string;
      dailyGoalMinutes: number;
      eyeCareMinutes: number;
    }
  ): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/parent/profiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.status === 401) {
        setUnlocked(false);
        return false;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.profile) {
        await loadAll(selectedReportProfileId);
        setNotice({ ok: true, text: `已更新「${data.profile.nickname}」的档案与护眼设置！` });
        return true;
      }
      setNotice({ ok: false, text: data.error || "保存档案失败" });
      return false;
    } catch {
      setNotice({ ok: false, text: "网络异常，档案更新失败" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async (profileId: number): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/parent/profiles/${profileId}`, {
        method: "DELETE",
      });
      if (res.status === 401) {
        setUnlocked(false);
        return false;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await loadAll(selectedReportProfileId === profileId ? null : selectedReportProfileId);
        setNotice({ ok: true, text: "该学习档案及其相关记录已永久删除。" });
        return true;
      }
      setNotice({ ok: false, text: data.error || "删除档案失败" });
      return false;
    } catch {
      setNotice({ ok: false, text: "网络异常，删除档案失败" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSelectReportProfile = async (profileId: number) => {
    setSelectedReportProfileId(profileId);
    await fetchReportForProfile(profileId);
  };

  const handleViewReportFromProfile = (profileId: number) => {
    setNotice(null);
    setTestResult(null);
    setSelectedReportProfileId(profileId);
    void fetchReportForProfile(profileId);
    setTab("report");
  };

  const handleChangePassword = async (
    currentPin: string,
    newPin: string
  ): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/parent/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_pin", currentPin, pin: newPin }),
      });
      if (res.status === 401) {
        setUnlocked(false);
        return false;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (settings) {
          setSettings({ ...settings, hasParentPin: true });
        }
        setNotice({ ok: true, text: "家长密码已加密更新，其他会话已自动失效！" });
        return true;
      }
      setNotice({ ok: false, text: data.error || "修改密码失败" });
      return false;
    } catch {
      setNotice({ ok: false, text: "网络异常，密码修改失败" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (target: "llm" | "tts" | "stt") => {
    if (!settings || testingTarget !== null) return;
    setTestingTarget(target);
    setTestResult(null);
    try {
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
      if (res.status === 401) {
        setUnlocked(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setTestResult({
        target,
        ok: Boolean(data.ok),
        message: data.message || "测试返回格式异常",
        sample: data.sample,
      });
    } catch {
      setTestResult({
        target,
        ok: false,
        message: "测试请求发送失败，请检查网络连接",
      });
    } finally {
      setTestingTarget(null);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/parent/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => undefined);
    setUnlocked(false);
  };

  if (!unlocked) {
    return <ParentGate onUnlocked={() => setUnlocked(true)} />;
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

          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600">
              密钥仅保存在服务端 SQLite
            </div>
            <button
              type="button"
              onClick={handleLogout}
              data-testid="parent-logout-btn"
              className="min-h-[36px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>锁定退出</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { id: "llm", label: "AI 大模型设置", icon: Bot },
            { id: "speech", label: "语音听读配置", icon: Volume2 },
            { id: "profile", label: "用户档案与密码", icon: UserCheck },
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
                  setNotice(null);
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

        {notice && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-bold flex items-center gap-2 ${
              notice.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {notice.ok ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 shrink-0" />
            )}
            <span>{notice.text}</span>
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

        {tab === "llm" && settings && (
          <LlmSettingsTab
            settings={settings}
            savedLlmBaseUrl={savedLlmBaseUrl}
            llmKeyDraft={llmKeyDraft}
            saving={saving}
            testingTarget={testingTarget}
            onChangeSettings={setSettings}
            onChangeLlmKeyDraft={setLlmKeyDraft}
            onApplyPreset={applyPreset}
            onSave={() => handleSaveSettings()}
            onClearKey={() => handleSaveSettings({ clearLlmApiKey: true })}
            onTest={() => handleTest("llm")}
          />
        )}

        {tab === "speech" && settings && (
          <SpeechSettingsTab
            settings={settings}
            ttsKeyDraft={ttsKeyDraft}
            sttKeyDraft={sttKeyDraft}
            saving={saving}
            testingTarget={testingTarget}
            onChangeSettings={setSettings}
            onChangeTtsKeyDraft={setTtsKeyDraft}
            onChangeSttKeyDraft={setSttKeyDraft}
            onSave={() => handleSaveSettings()}
            onClearTtsKey={() => handleSaveSettings({ clearTtsApiKey: true })}
            onClearSttKey={() => handleSaveSettings({ clearSttApiKey: true })}
            onPreviewSpeak={() =>
              speech.speak("Hello! Let's learn English together!", {
                lang: "en",
                slow: false,
              })
            }
            onTest={(target) => handleTest(target)}
          />
        )}

        {tab === "profile" && (
          <ProfileSettingsTab
            profiles={profiles}
            activeProfileId={activeProfileId}
            saving={saving}
            onCreateProfile={handleCreateProfile}
            onUpdateProfile={handleUpdateProfile}
            onDeleteProfile={handleDeleteProfile}
            onViewReport={handleViewReportFromProfile}
            onChangePassword={handleChangePassword}
          />
        )}

        {tab === "report" && (
          <LearningReportTab
            profiles={profiles}
            selectedProfileId={selectedReportProfileId}
            onSelectProfile={handleSelectReportProfile}
            report={report}
          />
        )}
      </div>
    </div>
  );
}
