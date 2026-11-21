export type TtsEngine = "edge" | "openai" | "browser";
export type SttEngine = "browser" | "openai" | "minimax";
export type VoiceProofPurpose = "feed" | "roleplay";

export const MINIMAX_STT_DEFAULT_URL = "https://api.minimax.cn/v1/speech_to_text";
export const MINIMAX_STT_DEFAULT_MODEL = "asr-1.0";
export const OPENAI_STT_DEFAULT_MODEL = "whisper-1";

export function resolveSttBaseUrl(engine: string, baseUrl: string): string {
  return baseUrl.trim() || (engine === "minimax" ? MINIMAX_STT_DEFAULT_URL : "");
}

export function requiresSttApiKey(engine: string, baseUrl: string): boolean {
  if (engine === "minimax") return true;
  if (engine !== "openai") return false;
  try {
    return new URL(baseUrl).hostname.replace(/\.$/, "") === "api.openai.com";
  } catch {
    return false;
  }
}

export interface SttEngineMeta {
  id: SttEngine;
  titleZh: string;
  descZh: string;
  defaultUrl: string;
  defaultModel: string;
}

export const STT_ENGINE_META: SttEngineMeta[] = [
  {
    id: "browser",
    titleZh: "浏览器原生语音识别",
    descZh: "零配置免费用，Chrome / Edge 体验佳",
    defaultUrl: "",
    defaultModel: OPENAI_STT_DEFAULT_MODEL,
  },
  {
    id: "minimax",
    titleZh: "MiniMax 语音识别（国内推荐）",
    descZh: "支持 iPad Safari，国内直连低延迟，默认模型 asr-1.0",
    defaultUrl: MINIMAX_STT_DEFAULT_URL,
    defaultModel: MINIMAX_STT_DEFAULT_MODEL,
  },
  {
    id: "openai",
    titleZh: "云端 Whisper 接口",
    descZh: "兼容 OpenAI /audio/transcriptions，自带单元词库偏置",
    defaultUrl: "",
    defaultModel: OPENAI_STT_DEFAULT_MODEL,
  },
];

export function resolveActiveSttMode(settings: {
  sttEngine: string;
  sttApiBaseUrl: string;
  hasSttApiKey: boolean;
}): SttEngine {
  const { sttEngine, sttApiBaseUrl, hasSttApiKey } = settings;
  if (!hasSttApiKey && requiresSttApiKey(sttEngine, sttApiBaseUrl)) return "browser";
  if (sttEngine === "minimax") {
    return "minimax";
  }
  if (sttEngine === "openai" && sttApiBaseUrl.trim()) {
    return "openai";
  }
  return "browser";
}
