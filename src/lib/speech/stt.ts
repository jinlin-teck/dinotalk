import { normalizeBaseUrl } from "@/lib/ai/provider";

export interface SttRequestParams {
  audioBlob: Blob;
  filename: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  hints?: string;
}

export async function transcribeWithOpenAi(params: SttRequestParams): Promise<string> {
  const base = normalizeBaseUrl(params.baseUrl);
  if (!base) {
    throw new Error("未配置语音识别 (STT) 服务地址");
  }
  const url = base.endsWith("/audio/transcriptions") ? base : `${base}/audio/transcriptions`;

  const form = new FormData();
  form.append("file", params.audioBlob, params.filename || "speech.webm");
  form.append("model", params.model.trim() || "whisper-1");
  form.append("language", "en");
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
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`STT 服务返回 HTTP ${res.status}: ${errText.slice(0, 120)}`);
    }

    const data = (await res.json()) as { text?: string };
    return (data.text ?? "").trim();
  } finally {
    clearTimeout(timer);
  }
}
