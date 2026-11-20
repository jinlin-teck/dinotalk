import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { getAudioCacheDir } from "@/db";
import { normalizeBaseUrl } from "@/lib/ai/provider";

export interface TtsParams {
  text: string;
  lang: "en" | "zh";
  engine: string; // 'edge' | 'openai' | 'browser'
  voiceEn: string;
  voiceZh: string;
  speed: number;
  apiBaseUrl?: string;
  apiKey?: string;
  apiModel?: string;
}

export type TtsResult =
  | { mode: "audio"; buffer: Buffer; cached: boolean }
  | { mode: "browser"; reason?: string };

function sanitizeSsmlText(text: string): string {
  return text
    .replace(/&/g, "and")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function speedToRatePercent(speed: number): string {
  const clamped = Math.max(0.55, Math.min(1.4, speed || 0.85));
  const pct = Math.round((clamped - 1) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

async function synthesizeEdgeTts(
  text: string,
  voice: string,
  speed: number
): Promise<Buffer> {
  const tts = new MsEdgeTTS({
    connectionTimeoutMs: 5500,
    synthesisTimeoutMs: 7500,
  });

  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(sanitizeSsmlText(text), {
      rate: speedToRatePercent(speed),
    });

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Edge-TTS stream timeout"));
      }, 8000);

      audioStream.on("data", (chunk: Buffer | Uint8Array) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      audioStream.on("end", () => {
        clearTimeout(timer);
        resolve();
      });
      audioStream.on("error", (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const buffer = Buffer.concat(chunks);
    if (buffer.length < 64) {
      throw new Error("Edge-TTS returned empty audio");
    }
    return buffer;
  } finally {
    try {
      tts.close();
    } catch {
      // ignore close errors
    }
  }
}

async function synthesizeOpenAiTts(params: {
  text: string;
  voice: string;
  speed: number;
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<Buffer> {
  const base = normalizeBaseUrl(params.baseUrl);
  if (!base) {
    throw new Error("OpenAI TTS baseUrl 未配置");
  }
  const url = base.endsWith("/audio/speech") ? base : `${base}/audio/speech`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (params.apiKey.trim()) {
      headers.Authorization = `Bearer ${params.apiKey.trim()}`;
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: params.model.trim() || "tts-1",
        input: params.text,
        voice: params.voice || "alloy",
        speed: Math.max(0.5, Math.min(1.5, params.speed || 0.85)),
        response_format: "mp3",
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`OpenAI TTS HTTP ${res.status}`);
    }
    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    if (buf.length < 64) {
      throw new Error("OpenAI TTS empty audio");
    }
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

export async function synthesizeSpeech(params: TtsParams): Promise<TtsResult> {
  const cleanText = params.text.trim().slice(0, 400);
  if (!cleanText) {
    return { mode: "browser", reason: "empty_text" };
  }

  if (params.engine === "browser") {
    return { mode: "browser" };
  }

  const voice =
    params.lang === "zh"
      ? params.voiceZh || "zh-CN-XiaoxiaoNeural"
      : params.voiceEn || "en-US-AnaNeural";
  const speed = Number((params.speed || 0.85).toFixed(2));
  const keyVoice = params.engine === "openai" ? `openai:${params.apiModel || "tts-1"}:${params.lang}` : voice;

  const hash = crypto
    .createHash("sha256")
    .update(`${params.engine}|${keyVoice}|${speed}|${cleanText}`)
    .digest("hex");

  const cachePath = path.join(getAudioCacheDir(), `${hash}.mp3`);
  if (fs.existsSync(cachePath)) {
    try {
      const cached = fs.readFileSync(cachePath);
      if (cached.length > 64) {
        return { mode: "audio", buffer: cached, cached: true };
      }
    } catch {
      // continue to synthesize
    }
  }

  try {
    let buffer: Buffer;
    if (params.engine === "openai") {
      buffer = await synthesizeOpenAiTts({
        text: cleanText,
        voice: params.lang === "zh" ? "nova" : "alloy",
        speed,
        baseUrl: params.apiBaseUrl ?? "",
        apiKey: params.apiKey ?? "",
        model: params.apiModel ?? "tts-1",
      });
    } else {
      buffer = await synthesizeEdgeTts(cleanText, voice, speed);
    }

    try {
      fs.writeFileSync(cachePath, buffer);
    } catch {
      // ignore disk cache write failure
    }
    return { mode: "audio", buffer, cached: false };
  } catch (err) {
    return {
      mode: "browser",
      reason: err instanceof Error ? err.message : "tts_unavailable",
    };
  }
}
