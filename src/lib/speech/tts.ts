import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { getAudioCacheDir } from "@/db";
import { normalizeBaseUrl } from "@/lib/ai/provider";
import { getUrlOrigin } from "@/lib/security/endpoint-guard";
import { fetchProviderEndpoint } from "@/lib/security/provider-fetch";

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
  skipCache?: boolean;
}

export type TtsResult =
  | { mode: "audio"; buffer: Buffer; cached: boolean }
  | { mode: "browser"; reason?: string };

const MAX_CACHE_FILES = 500;
const MAX_CACHE_BYTES = 50 * 1024 * 1024;
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;
let lastPruneAt = 0;
let writesSincePrune = 0;

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
    const res = await fetchProviderEndpoint(url, {
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

async function pruneAudioCacheIfNeeded(cacheDir: string): Promise<void> {
  writesSincePrune += 1;
  const now = Date.now();
  if (writesSincePrune < 20 && now - lastPruneAt < PRUNE_INTERVAL_MS) {
    return;
  }
  writesSincePrune = 0;
  lastPruneAt = now;

  try {
    const entries = await fs.promises.readdir(cacheDir);
    const mp3Files = entries.filter((name) => name.endsWith(".mp3"));
    if (mp3Files.length <= MAX_CACHE_FILES) {
      const stats = await Promise.all(
        mp3Files.map(async (name) => {
          const full = path.join(cacheDir, name);
          const st = await fs.promises.stat(full).catch(() => null);
          return st ? { full, size: st.size, mtimeMs: st.mtimeMs } : null;
        })
      );
      const valid = stats.filter((s): s is NonNullable<typeof s> => s !== null);
      const totalBytes = valid.reduce((sum, s) => sum + s.size, 0);
      if (totalBytes <= MAX_CACHE_BYTES) return;
      valid.sort((a, b) => a.mtimeMs - b.mtimeMs);
      let remaining = totalBytes;
      for (const item of valid) {
        if (remaining <= MAX_CACHE_BYTES) break;
        await fs.promises.unlink(item.full).catch(() => undefined);
        remaining -= item.size;
      }
      return;
    }

    const stats = await Promise.all(
      mp3Files.map(async (name) => {
        const full = path.join(cacheDir, name);
        const st = await fs.promises.stat(full).catch(() => null);
        return st ? { full, size: st.size, mtimeMs: st.mtimeMs } : null;
      })
    );
    const valid = stats.filter((s): s is NonNullable<typeof s> => s !== null);
    valid.sort((a, b) => a.mtimeMs - b.mtimeMs);
    let totalBytes = valid.reduce((sum, s) => sum + s.size, 0);
    let count = valid.length;
    for (const item of valid) {
      if (count <= MAX_CACHE_FILES && totalBytes <= MAX_CACHE_BYTES) break;
      await fs.promises.unlink(item.full).catch(() => undefined);
      count -= 1;
      totalBytes -= item.size;
    }
  } catch {
    // ignore cleanup failures
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
  const originTag = getUrlOrigin(params.apiBaseUrl ?? "") ?? "";
  const keyVoice =
    params.engine === "openai"
      ? `openai:${originTag}:${params.apiModel || "tts-1"}:${params.lang}`
      : voice;

  const hash = crypto
    .createHash("sha256")
    .update(`${params.engine}|${keyVoice}|${speed}|${cleanText}`)
    .digest("hex");

  const cacheDir = params.skipCache ? null : getAudioCacheDir();
  const cachePath = cacheDir ? path.join(cacheDir, `${hash}.mp3`) : null;

  if (cachePath) {
    try {
      const cached = await fs.promises.readFile(cachePath);
      if (cached.length > 64) {
        return { mode: "audio", buffer: cached, cached: true };
      }
    } catch {
      // cache miss or unreadable; continue to synthesize
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

    if (cacheDir && cachePath) {
      const tmpPath = `${cachePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
      try {
        await fs.promises.writeFile(tmpPath, buffer);
        await fs.promises.rename(tmpPath, cachePath);
        void pruneAudioCacheIfNeeded(cacheDir);
      } catch {
        await fs.promises.unlink(tmpPath).catch(() => undefined);
      }
    }
    return { mode: "audio", buffer, cached: false };
  } catch {
    return { mode: "browser", reason: "tts_unavailable" };
  }
}
