"use client";

import { Save, Trash2 } from "lucide-react";
import { LLM_PRESETS } from "@/lib/ai/presets";
import type { SanitizedSettings } from "@/types/api";

interface LlmSettingsTabProps {
  settings: SanitizedSettings;
  savedLlmBaseUrl: string;
  llmKeyDraft: string;
  saving: boolean;
  testingTarget: "llm" | "tts" | "stt" | null;
  onChangeSettings: (next: SanitizedSettings) => void;
  onChangeLlmKeyDraft: (val: string) => void;
  onApplyPreset: (presetId: string) => void;
  onSave: () => void;
  onClearKey: () => void;
  onTest: () => void;
}

function safeOrigin(raw: string): string {
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return "";
  }
}

export function LlmSettingsTab({
  settings,
  savedLlmBaseUrl,
  llmKeyDraft,
  saving,
  testingTarget,
  onChangeSettings,
  onChangeLlmKeyDraft,
  onApplyPreset,
  onSave,
  onClearKey,
  onTest,
}: LlmSettingsTabProps) {
  const originChangedWithSavedKey =
    settings.hasLlmApiKey &&
    !llmKeyDraft.trim() &&
    safeOrigin(settings.llmBaseUrl) !== safeOrigin(savedLlmBaseUrl);

  return (
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
              onClick={() => onApplyPreset(p.id)}
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
          {settings.llmProvider === "custom"
            ? "（支持家庭局域网或内网 HTTPS OpenAI 兼容中转网关）"
            : ""}
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
            onChange={(e) =>
              onChangeSettings({ ...settings, llmBaseUrl: e.target.value })
            }
            placeholder="例如 https://api.deepseek.com/v1 或内网中转地址"
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
            onChange={(e) =>
              onChangeSettings({ ...settings, llmModel: e.target.value })
            }
            className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <label className="block text-xs font-extrabold text-slate-700">
            API Key（仅保存在服务端本地 SQLite，浏览器仅展示脱敏掩码）
          </label>
          {settings.hasLlmApiKey && (
            <button
              type="button"
              disabled={saving}
              onClick={onClearKey}
              className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清除已存密钥</span>
            </button>
          )}
        </div>
        <input
          type="password"
          value={llmKeyDraft}
          onChange={(e) => onChangeLlmKeyDraft(e.target.value)}
          placeholder={
            settings.hasLlmApiKey
              ? `已保存：${settings.llmApiKeyMasked}（留空则保持不变）`
              : "请输入 API Key（本地 Ollama 可留空）"
          }
          data-testid="llm-key-input"
          className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium"
        />
        {originChangedWithSavedKey && (
          <p className="text-xs font-bold text-amber-700 mt-1.5">
            接口来源已变更。保存前，请输入新接口的 API Key，或点击「清除已存密钥」。
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          disabled={saving}
          data-testid="save-settings-btn"
          onClick={onSave}
          className="min-h-[46px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-sm flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? "保存中..." : "保存模型配置"}</span>
        </button>
        <button
          type="button"
          disabled={testingTarget !== null}
          onClick={onTest}
          className="min-h-[46px] px-5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-800 font-bold text-sm"
        >
          {testingTarget === "llm" ? "测试中..." : "测试连接"}
        </button>
      </div>
    </div>
  );
}
