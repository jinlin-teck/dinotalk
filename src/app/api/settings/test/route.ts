import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { callChatCompletion, LlmProviderError, stripReasoningTags } from "@/lib/ai/provider";
import { requireParentAuth } from "@/lib/auth/parent-session";
import {
  assertJsonSameOrigin,
  canReuseStoredSecret,
  validateEndpointUrl,
} from "@/lib/security/endpoint-guard";
import { fetchProviderEndpoint } from "@/lib/security/provider-fetch";
import { requiresSttApiKey, resolveSttBaseUrl } from "@/lib/speech/constants";
import { MINIMAX_STT_DEFAULT_MODEL, SttProviderError, transcribeWithMiniMax } from "@/lib/speech/stt";
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

const ORIGIN_CHANGED_SECRET_ERROR =
  "接口域名已变更，为保护已存密钥安全，请重新填写该接口对应的 API Key 后再测试";

export async function POST(request: Request) {
  const originError = assertJsonSameOrigin(request);
  if (originError) return originError;

  const authError = requireParentAuth(request);
  if (authError) return authError;

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
  const sessionError = requireParentAuth(request, settings.parentSessionVersion);
  if (sessionError) return sessionError;

  const { target, override } = parsed.data;
  const started = Date.now();

  if (target === "llm") {
    const provider = override?.provider || settings.llmProvider;
    const rawBaseUrl = override?.baseUrl ?? settings.llmBaseUrl;
    const urlCheck = validateEndpointUrl(rawBaseUrl, { allowEmpty: false });
    if (!urlCheck.ok) {
      return NextResponse.json(
        { ok: false, latencyMs: Date.now() - started, message: urlCheck.error },
        { status: 400 }
      );
    }

    let apiKey = override?.apiKey?.trim() ?? "";
    if (!apiKey) {
      if (canReuseStoredSecret(urlCheck.normalized, settings.llmBaseUrl)) {
        apiKey = settings.llmApiKey;
      } else if (settings.llmApiKey.trim() && provider !== "ollama") {
        return NextResponse.json(
          {
            ok: false,
            latencyMs: Date.now() - started,
            message: ORIGIN_CHANGED_SECRET_ERROR,
          },
          { status: 400 }
        );
      }
    }

    const cfg = {
      provider,
      baseUrl: urlCheck.normalized,
      apiKey,
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
        { timeoutMs: 25000, maxTokens: 512, jsonMode: false }
      );
      const cleanedSample = stripReasoningTags(sample).trim() || sample.trim();
      return NextResponse.json({
        ok: true,
        latencyMs: Date.now() - started,
        message: "大模型连接成功！",
        sample: apiKey ? cleanedSample.replaceAll(apiKey, "****") : cleanedSample,
      });
    } catch (err) {
      return NextResponse.json({
        ok: false,
        latencyMs: Date.now() - started,
        message: err instanceof LlmProviderError ? err.message : "连接大模型失败",
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

    let ttsBaseUrl = "";
    let ttsApiKey = "";
    if (engine === "openai") {
      const rawTtsUrl = override?.baseUrl ?? settings.ttsApiBaseUrl;
      const urlCheck = validateEndpointUrl(rawTtsUrl, { allowEmpty: false });
      if (!urlCheck.ok) {
        return NextResponse.json(
          { ok: false, latencyMs: Date.now() - started, message: urlCheck.error },
          { status: 400 }
        );
      }
      ttsBaseUrl = urlCheck.normalized;

      ttsApiKey = override?.apiKey?.trim() ?? "";
      if (!ttsApiKey) {
        if (canReuseStoredSecret(ttsBaseUrl, settings.ttsApiBaseUrl)) {
          ttsApiKey = settings.ttsApiKey;
        } else if (settings.ttsApiKey.trim()) {
          return NextResponse.json(
            {
              ok: false,
              latencyMs: Date.now() - started,
              message: ORIGIN_CHANGED_SECRET_ERROR,
            },
            { status: 400 }
          );
        }
      }
    }

    const res = await synthesizeSpeech({
      text: "Hello, little explorer!",
      lang: "en",
      engine,
      voiceEn: override?.voiceEn || settings.ttsVoiceEn,
      voiceZh: settings.ttsVoiceZh,
      speed: override?.speed ?? settings.ttsSpeed,
      apiBaseUrl: ttsBaseUrl,
      apiKey: ttsApiKey,
      apiModel: override?.model ?? settings.ttsApiModel,
      skipCache: true,
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

  const storedSttUrl = resolveSttBaseUrl(settings.sttEngine, settings.sttApiBaseUrl);
  const rawSttUrl = resolveSttBaseUrl(sttEngine, override?.baseUrl ?? settings.sttApiBaseUrl);

  const sttUrlCheck = validateEndpointUrl(rawSttUrl, { allowEmpty: false });
  if (!sttUrlCheck.ok) {
    return NextResponse.json(
      { ok: false, latencyMs: Date.now() - started, message: sttUrlCheck.error },
      { status: 400 }
    );
  }

  let key = override?.apiKey?.trim() ?? "";
  if (!key) {
    if (canReuseStoredSecret(sttUrlCheck.normalized, storedSttUrl)) {
      key = settings.sttApiKey;
    } else if (settings.sttApiKey.trim()) {
      return NextResponse.json(
        {
          ok: false,
          latencyMs: Date.now() - started,
          message: ORIGIN_CHANGED_SECRET_ERROR,
        },
        { status: 400 }
      );
    }
  }

  if (!key.trim() && requiresSttApiKey(sttEngine, sttUrlCheck.normalized)) {
    return NextResponse.json({
      ok: false,
      latencyMs: Date.now() - started,
      message: sttEngine === "minimax" ? "请填写 MiniMax API Key" : "请填写 OpenAI API Key",
    });
  }

  if (sttEngine === "minimax") {
    try {
      const wavBuffer = createSilentWavBuffer(400, 16000);
      const model =
        (override?.model ?? settings.sttApiModel).trim() || MINIMAX_STT_DEFAULT_MODEL;
      await transcribeWithMiniMax({
        audioBlob: new Blob([wavBuffer], { type: "audio/wav" }),
        filename: "ping.wav",
        baseUrl: sttUrlCheck.normalized,
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
        message: err instanceof SttProviderError ? err.message : "MiniMax 语音识别连接失败",
      });
    }
  }

  try {
    const modelsUrl = `${sttUrlCheck.normalized}/models`;
    const headers: Record<string, string> = {};
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetchProviderEndpoint(modelsUrl, { headers, signal: AbortSignal.timeout(8000) });
    await res.body?.cancel();
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
  } catch {
    return NextResponse.json({
      ok: false,
      latencyMs: Date.now() - started,
      message: "STT 接口无法访问，请检查网络和接口地址",
    });
  }
}
