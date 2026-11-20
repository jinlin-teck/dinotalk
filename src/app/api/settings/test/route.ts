import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { callChatCompletion, normalizeBaseUrl } from "@/lib/ai/provider";
import { MINIMAX_STT_DEFAULT_MODEL, transcribeWithMiniMax } from "@/lib/speech/stt";
import { synthesizeSpeech } from "@/lib/speech/tts";
import { createSilentWavBuffer } from "@/lib/speech/wav-encoder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TestSchema = z.object({
  target: z.enum(["llm", "tts", "stt"]),
  override: z
    .object({
      provider: z.string().optional(),
      baseUrl: z.string().optional(),
      apiKey: z.string().optional(),
      model: z.string().optional(),
      engine: z.string().optional(),
      voiceEn: z.string().optional(),
      speed: z.number().optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = TestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "测试请求参数无效" }, { status: 400 });
  }

  const db = getDb();
  const settings = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
  if (!settings) {
    return NextResponse.json({ ok: false, message: "配置尚未初始化" }, { status: 404 });
  }

  const { target, override } = parsed.data;
  const started = Date.now();

  if (target === "llm") {
    const cfg = {
      provider: override?.provider || settings.llmProvider,
      baseUrl: override?.baseUrl ?? settings.llmBaseUrl,
      apiKey: override?.apiKey?.trim() ? override.apiKey.trim() : settings.llmApiKey,
      model: override?.model ?? settings.llmModel,
      temperature: settings.llmTemperature,
    };

    try {
      const sample = await callChatCompletion(
        cfg,
        [
          { role: "system", content: "Reply with a short friendly English greeting under 8 words." },
          { role: "user", content: "Say hello to a 7-year-old student!" },
        ],
        { timeoutMs: 15000, maxTokens: 40, jsonMode: false }
      );
      return NextResponse.json({
        ok: true,
        latencyMs: Date.now() - started,
        message: "大模型连接成功！",
        sample: sample.trim(),
      });
    } catch (err) {
      return NextResponse.json({
        ok: false,
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : "连接大模型失败",
      });
    }
  }

  if (target === "tts") {
    const engine = override?.engine || settings.ttsEngine;
    if (engine === "browser") {
      return NextResponse.json({
        ok: true,
        latencyMs: Date.now() - started,
        message: "已选择浏览器原生朗读，离线即可发声。",
      });
    }

    const res = await synthesizeSpeech({
      text: "Hello, little explorer!",
      lang: "en",
      engine,
      voiceEn: override?.voiceEn || settings.ttsVoiceEn,
      voiceZh: settings.ttsVoiceZh,
      speed: override?.speed ?? settings.ttsSpeed,
      apiBaseUrl: override?.baseUrl ?? settings.ttsApiBaseUrl,
      apiKey: override?.apiKey?.trim() ? override.apiKey.trim() : settings.ttsApiKey,
      apiModel: override?.model ?? settings.ttsApiModel,
    });

    if (res.mode === "audio") {
      return NextResponse.json({
        ok: true,
        latencyMs: Date.now() - started,
        message: `${engine === "edge" ? "Edge-TTS" : "云端 TTS"} 语音合成正常（${res.buffer.length} bytes）`,
      });
    }

    return NextResponse.json({
      ok: false,
      latencyMs: Date.now() - started,
      message: `云端 TTS 暂不可用（${res.reason || "网络受限"}），孩子端会自动回退到浏览器原生朗读，不影响学习。`,
    });
  }

  // target === 'stt'
  const sttEngine = override?.engine || settings.sttEngine;
  if (sttEngine === "browser") {
    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - started,
      message: "已选择浏览器原生语音识别（免额外配置）。",
    });
  }

  const key = override?.apiKey?.trim() ? override.apiKey.trim() : settings.sttApiKey;
  if (sttEngine === "minimax") {
    if (!key.trim()) {
      return NextResponse.json({
        ok: false,
        latencyMs: Date.now() - started,
        message: "请填写 MiniMax API Key",
      });
    }

    try {
      const wavBuffer = createSilentWavBuffer(400, 16000);
      const model = (override?.model ?? settings.sttApiModel).trim() || MINIMAX_STT_DEFAULT_MODEL;
      await transcribeWithMiniMax({
        audioBlob: new Blob([wavBuffer], { type: "audio/wav" }),
        filename: "ping.wav",
        baseUrl: override?.baseUrl ?? settings.sttApiBaseUrl,
        apiKey: key,
        model,
      });
      return NextResponse.json({
        ok: true,
        latencyMs: Date.now() - started,
        message: `MiniMax 语音识别 (${model}) 连接成功！`,
      });
    } catch (err) {
      return NextResponse.json({
        ok: false,
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : "MiniMax 语音识别连接失败",
      });
    }
  }

  const base = normalizeBaseUrl(override?.baseUrl ?? settings.sttApiBaseUrl);
  if (!base) {
    return NextResponse.json({
      ok: false,
      latencyMs: Date.now() - started,
      message: "请填写 Whisper STT 的 Base URL",
    });
  }

  try {
    const modelsUrl = `${base}/models`;
    const headers: Record<string, string> = {};
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({
        ok: false,
        latencyMs: Date.now() - started,
        message: `STT API Key 鉴权失败 (HTTP ${res.status})`,
      });
    }
    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - started,
      message: `STT 接口可达 (HTTP ${res.status})`,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      latencyMs: Date.now() - started,
      message: `STT 接口无法访问：${err instanceof Error ? err.message : "网络错误"}`,
    });
  }
}
