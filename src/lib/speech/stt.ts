import { normalizeBaseUrl } from "@/lib/ai/provider";
import { fetchProviderEndpoint } from "@/lib/security/provider-fetch";
import {
  MINIMAX_STT_DEFAULT_MODEL,
  MINIMAX_STT_DEFAULT_URL,
} from "./constants";

export { MINIMAX_STT_DEFAULT_MODEL, MINIMAX_STT_DEFAULT_URL };

export class SttProviderError extends Error {}

export interface SttRequestParams {
  audioBlob: Blob;
  filename: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  hints?: string;
  language?: string;
}

export function resolveMiniMaxSttUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) {
    return MINIMAX_STT_DEFAULT_URL;
  }
  if (base.endsWith("/speech_to_text")) {
    return base;
  }
  if (base.endsWith("/v1")) {
    return `${base}/speech_to_text`;
  }
  return `${base}/v1/speech_to_text`;
}

export async function transcribeWithOpenAi(params: SttRequestParams): Promise<string> {
  const base = normalizeBaseUrl(params.baseUrl);
  if (!base) {
    throw new SttProviderError("未配置语音识别 (STT) 服务地址");
  }
  const url = base.endsWith("/audio/transcriptions") ? base : `${base}/audio/transcriptions`;

  const form = new FormData();
  form.append("file", params.audioBlob, params.filename || "speech.wav");
  form.append("model", params.model.trim() || "whisper-1");
  form.append("language", params.language?.trim() || "en");
  if (params.hints?.trim()) {
    form.append("prompt", `Children English words: ${params.hints.trim().slice(0, 220)}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const headers: Record<string, string> = {};
    if (params.apiKey.trim()) {
      headers.Authorization = `Bearer ${params.apiKey.trim()}`;
    }
    const res = await fetchProviderEndpoint(url, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      await res.body?.cancel();
      throw new SttProviderError(`STT 服务返回 HTTP ${res.status}`);
    }

    const data = (await res.json()) as { text?: string };
    return (data.text ?? "").trim();
  } finally {
    clearTimeout(timer);
  }
}

interface MiniMaxSttResponse {
  text?: string;
  base_resp?: { status_code?: number };
  error?: unknown;
}

export async function transcribeWithMiniMax(params: SttRequestParams): Promise<string> {
  const key = params.apiKey.trim();
  if (!key) {
    throw new SttProviderError("未配置 MiniMax API Key");
  }
  const url = resolveMiniMaxSttUrl(params.baseUrl);

  const form = new FormData();
  form.append("file", params.audioBlob, params.filename || "speech.wav");
  form.append("model", params.model.trim() || MINIMAX_STT_DEFAULT_MODEL);
  form.append("response_format", "json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${key}`,
    };
    const lang = params.language?.trim() ?? "en";
    if (lang) {
      headers.language = lang;
    }

    const res = await fetchProviderEndpoint(url, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal,
    });

    const rawText = await res.text().catch(() => "");
    let parsed: MiniMaxSttResponse | null = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText) as MiniMaxSttResponse;
      } catch {
        parsed = null;
      }
    }

    if (!res.ok) throw new SttProviderError(`MiniMax STT 返回 HTTP ${res.status}`);

    if (
      parsed?.base_resp &&
      Number.isSafeInteger(parsed.base_resp.status_code) &&
      parsed.base_resp.status_code !== 0
    ) {
      throw new SttProviderError(`MiniMax STT 错误 (${parsed.base_resp.status_code})`);
    }
    if (!parsed || parsed.error) throw new SttProviderError("MiniMax STT 返回无效结果");

    return (parsed?.text ?? "").trim();
  } finally {
    clearTimeout(timer);
  }
}
