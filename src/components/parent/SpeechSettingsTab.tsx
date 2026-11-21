"use client";

import { Mic, Save, Trash2 } from "lucide-react";
import { EN_VOICE_OPTIONS, ZH_VOICE_OPTIONS } from "@/lib/ai/presets";
import {
  MINIMAX_STT_DEFAULT_MODEL,
  MINIMAX_STT_DEFAULT_URL,
  OPENAI_STT_DEFAULT_MODEL,
  STT_ENGINE_META,
} from "@/lib/speech/constants";
import type { SanitizedSettings } from "@/types/api";

interface SpeechSettingsTabProps {
  settings: SanitizedSettings;
  ttsKeyDraft: string;
  sttKeyDraft: string;
  saving: boolean;
  testingTarget: "llm" | "tts" | "stt" | null;
  onChangeSettings: (next: SanitizedSettings) => void;
  onChangeTtsKeyDraft: (val: string) => void;
  onChangeSttKeyDraft: (val: string) => void;
  onSave: () => void;
  onClearTtsKey: () => void;
  onClearSttKey: () => void;
  onPreviewSpeak: () => void;
  onTest: (target: "tts" | "stt") => void;
}

export function SpeechSettingsTab({
  settings,
  ttsKeyDraft,
  sttKeyDraft,
  saving,
  testingTarget,
  onChangeSettings,
  onChangeTtsKeyDraft,
  onChangeSttKeyDraft,
  onSave,
  onClearTtsKey,
  onClearSttKey,
  onPreviewSpeak,
  onTest,
}: SpeechSettingsTabProps) {
  const handleSelectSttEngine = (nextEngine: SanitizedSettings["sttEngine"]) => {
    if (nextEngine === "minimax") {
      const shouldPresetUrl =
        !settings.sttApiBaseUrl.trim() || settings.sttApiBaseUrl.includes("openai.com");
      const shouldPresetModel =
        !settings.sttApiModel.trim() ||
        settings.sttApiModel.trim() === OPENAI_STT_DEFAULT_MODEL;
      onChangeSettings({
        ...settings,
        sttEngine: nextEngine,
        sttApiBaseUrl: shouldPresetUrl ? MINIMAX_STT_DEFAULT_URL : settings.sttApiBaseUrl,
        sttApiModel: shouldPresetModel ? MINIMAX_STT_DEFAULT_MODEL : settings.sttApiModel,
      });
    } else if (nextEngine === "openai") {
      const isMiniMaxUrl = settings.sttApiBaseUrl.includes("minimax");
      const isMiniMaxModel = settings.sttApiModel.trim() === MINIMAX_STT_DEFAULT_MODEL;
      onChangeSettings({
        ...settings,
        sttEngine: nextEngine,
        sttApiBaseUrl: isMiniMaxUrl ? "" : settings.sttApiBaseUrl,
        sttApiModel: isMiniMaxModel ? OPENAI_STT_DEFAULT_MODEL : settings.sttApiModel,
      });
    } else {
      onChangeSettings({
        ...settings,
        sttEngine: nextEngine,
      });
    }
  };

  return (
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
                onChangeSettings({
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
            onChange={(e) =>
              onChangeSettings({ ...settings, ttsVoiceEn: e.target.value })
            }
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
            onChange={(e) =>
              onChangeSettings({ ...settings, ttsVoiceZh: e.target.value })
            }
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
              onChangeSettings({ ...settings, ttsSpeed: Number(e.target.value) })
            }
            className="w-full mt-2 accent-emerald-600"
          />
        </div>
      </div>

      {settings.ttsEngine === "openai" && (
        <div className="space-y-2 p-4 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              value={settings.ttsApiBaseUrl}
              onChange={(e) =>
                onChangeSettings({ ...settings, ttsApiBaseUrl: e.target.value })
              }
              placeholder="TTS Base URL (如 https://api.openai.com/v1)"
              className="h-10 rounded-xl border border-slate-300 px-3 text-sm bg-white"
            />
            <input
              type="password"
              value={ttsKeyDraft}
              onChange={(e) => onChangeTtsKeyDraft(e.target.value)}
              placeholder={
                settings.hasTtsApiKey
                  ? `已保存：${settings.ttsApiKeyMasked}`
                  : "TTS API Key"
              }
              className="h-10 rounded-xl border border-slate-300 px-3 text-sm bg-white"
            />
            <input
              type="text"
              value={settings.ttsApiModel}
              onChange={(e) =>
                onChangeSettings({ ...settings, ttsApiModel: e.target.value })
              }
              placeholder="Model (如 tts-1)"
              className="h-10 rounded-xl border border-slate-300 px-3 text-sm bg-white"
            />
          </div>
          {settings.hasTtsApiKey && (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={onClearTtsKey}
                className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清除已存 TTS 密钥</span>
              </button>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-slate-100 pt-5 space-y-3">
        <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
          <Mic className="w-5 h-5 text-emerald-600" />
          <span>STT 听孩子说话识别方式</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {STT_ENGINE_META.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSelectSttEngine(opt.id)}
              className={`p-3.5 rounded-2xl border-2 text-left transition ${
                settings.sttEngine === opt.id
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="font-black text-sm">{opt.titleZh}</div>
              <div className="text-xs text-slate-500 mt-0.5">{opt.descZh}</div>
            </button>
          ))}
        </div>

        {(settings.sttEngine === "openai" || settings.sttEngine === "minimax") && (
          <div className="space-y-2.5 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="text"
                value={settings.sttApiBaseUrl}
                onChange={(e) =>
                  onChangeSettings({ ...settings, sttApiBaseUrl: e.target.value })
                }
                placeholder={
                  settings.sttEngine === "minimax"
                    ? `接口地址 (默认 ${MINIMAX_STT_DEFAULT_URL})`
                    : "Whisper Base URL (如 https://api.openai.com/v1)"
                }
                className="h-10 rounded-xl border border-slate-300 px-3 text-sm bg-white"
              />
              <input
                type="password"
                value={sttKeyDraft}
                onChange={(e) => onChangeSttKeyDraft(e.target.value)}
                placeholder={
                  settings.hasSttApiKey
                    ? `已保存：${settings.sttApiKeyMasked}`
                    : settings.sttEngine === "minimax"
                    ? "MiniMax API Key"
                    : "STT API Key"
                }
                className="h-10 rounded-xl border border-slate-300 px-3 text-sm bg-white"
              />
              <input
                type="text"
                value={settings.sttApiModel}
                onChange={(e) =>
                  onChangeSettings({ ...settings, sttApiModel: e.target.value })
                }
                placeholder={
                  settings.sttEngine === "minimax"
                    ? `Model (默认 ${MINIMAX_STT_DEFAULT_MODEL})`
                    : "Model (如 whisper-1)"
                }
                className="h-10 rounded-xl border border-slate-300 px-3 text-sm bg-white"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {settings.sttEngine === "minimax" ? (
                <p className="text-xs text-slate-500">
                  前端录音会自动转为 16kHz 单声道 WAV 上传至 MiniMax{" "}
                  <code className="px-1 py-0.5 rounded bg-slate-200/70 text-slate-700">
                    /v1/speech_to_text
                  </code>
                  ，兼容电脑浏览器与 iPad Safari。海外账号可将地址改为{" "}
                  <code className="px-1 py-0.5 rounded bg-slate-200/70 text-slate-700">
                    https://api.minimax.io/v1/speech_to_text
                  </code>
                  。
                </p>
              ) : (
                <span />
              )}
              {settings.hasSttApiKey && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={onClearSttKey}
                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>清除已存 STT 密钥</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="min-h-[46px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-sm flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? "保存中..." : "保存语音配置"}</span>
        </button>
        <button
          type="button"
          onClick={onPreviewSpeak}
          className="min-h-[46px] px-5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-sm"
        >
          🔊 试听童声
        </button>
        <button
          type="button"
          disabled={testingTarget !== null}
          onClick={() => onTest("tts")}
          className="min-h-[46px] px-5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-800 font-bold text-sm"
        >
          {testingTarget === "tts" ? "测试中..." : "测试服务端 TTS"}
        </button>
        <button
          type="button"
          disabled={testingTarget !== null}
          onClick={() => onTest("stt")}
          className="min-h-[46px] px-5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-800 font-bold text-sm"
        >
          {testingTarget === "stt" ? "测试中..." : "测试语音识别 STT"}
        </button>
      </div>
    </div>
  );
}
