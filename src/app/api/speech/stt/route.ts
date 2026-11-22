import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { resolveActiveProfile } from "@/lib/auth/profile-session";
import { assertSameOrigin } from "@/lib/security/endpoint-guard";
import { consumeRateLimit, getRequestSourceKey } from "@/lib/security/rate-limit";
import { resolveActiveSttMode } from "@/lib/speech/constants";
import { transcribeWithMiniMax, transcribeWithOpenAi } from "@/lib/speech/stt";
import { issueVoiceProof } from "@/lib/speech/voice-proof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FORM_BYTES = MAX_AUDIO_BYTES + 64 * 1024; // multipart headers and hints
const RATE_LIMIT_MAX = 40;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const VoiceProofPurposeSchema = z.enum(["feed", "roleplay"]);

function oversizedAudioResponse() {
  return NextResponse.json(
    { ok: false, error: "录音文件过大，请简短说话后再试哦" },
    { status: 413 }
  );
}

function isAllowedAudioMime(mime: string): boolean {
  const clean = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!clean) return true;
  return (
    clean.startsWith("audio/") ||
    clean === "video/webm" ||
    clean === "application/octet-stream"
  );
}

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  if (Number(request.headers.get("content-length")) > MAX_FORM_BYTES) {
    return oversizedAudioResponse();
  }

  if (
    consumeRateLimit(
      "speech-stt",
      getRequestSourceKey(request),
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MS
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "语音识别请求太频繁，休息一下再试试哦~" },
      { status: 429 }
    );
  }

  let bytesRead = 0;
  let formTooLarge = false;
  const limitedBody = request.body?.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytesRead += chunk.byteLength;
        if (bytesRead > MAX_FORM_BYTES) {
          formTooLarge = true;
          controller.error(new Error("Multipart body exceeds size limit"));
          return;
        }
        controller.enqueue(chunk);
      },
    })
  );
  const form = await new Response(limitedBody, { headers: request.headers })
    .formData()
    .catch(() => null);
  if (formTooLarge) return oversizedAudioResponse();
  if (!form) {
    return NextResponse.json({ ok: false, error: "音频表单读取失败" }, { status: 400 });
  }

  const audio = form.get("audio");
  const hints = typeof form.get("hints") === "string" ? (form.get("hints") as string) : "";
  const rawLang = typeof form.get("language") === "string" ? (form.get("language") as string).trim().toLowerCase() : "";
  const language: "en" | "zh" = rawLang === "zh" || rawLang === "zh-cn" ? "zh" : "en";
  const purpose = VoiceProofPurposeSchema.safeParse(form.get("voiceProofPurpose") ?? undefined);

  if (!(audio instanceof Blob) || audio.size < 16) {
    return NextResponse.json({ ok: false, error: "录音太短，请再试一次哦" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return oversizedAudioResponse();
  }
  if (!isAllowedAudioMime(audio.type)) {
    return NextResponse.json({ ok: false, error: "不支持的音频格式" }, { status: 400 });
  }

  const db = getDb();
  const settings = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();

  const activeMode = settings
    ? resolveActiveSttMode({
        sttEngine: settings.sttEngine,
        sttApiBaseUrl: settings.sttApiBaseUrl,
        hasSttApiKey: Boolean(settings.sttApiKey.trim()),
      })
    : "browser";

  if (!settings || activeMode === "browser") {
    return NextResponse.json({
      ok: false,
      code: "stt_not_configured",
      error: "语音设置有变化，请再录一次试试哦！",
      text: "",
    });
  }

  try {
    const filename = audio instanceof File && audio.name ? audio.name : "speech.wav";
    const text =
      activeMode === "minimax"
        ? await transcribeWithMiniMax({
            audioBlob: audio,
            filename,
            baseUrl: settings.sttApiBaseUrl,
            apiKey: settings.sttApiKey,
            model: settings.sttApiModel,
            hints,
            language,
          })
        : await transcribeWithOpenAi({
            audioBlob: audio,
            filename,
            baseUrl: settings.sttApiBaseUrl,
            apiKey: settings.sttApiKey,
            model: settings.sttApiModel,
            hints,
            language,
          });
    let voiceProof: string | undefined;
    if (text.trim() && purpose.success) {
      const activeProfile = resolveActiveProfile(db, request);
      if (activeProfile) {
        voiceProof = issueVoiceProof(text, activeProfile.id, purpose.data);
      }
    }
    return NextResponse.json({ ok: true, text, voiceProof });
  } catch {
    return NextResponse.json({
      ok: false,
      code: "stt_failed",
      error: "语音识别暂时不可用，可以再试一次或点提示卡片继续哦~",
      text: "",
    });
  }
}
