import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { transcribeWithMiniMax, transcribeWithOpenAi } from "@/lib/speech/stt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ ok: false, error: "音频表单读取失败" }, { status: 400 });
  }

  const audio = form.get("audio");
  const hints = typeof form.get("hints") === "string" ? (form.get("hints") as string) : "";

  if (!(audio instanceof Blob) || audio.size < 16) {
    return NextResponse.json({ ok: false, error: "录音太短，请再试一次哦" }, { status: 400 });
  }

  const db = getDb();
  const settings = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();

  const isOpenAiReady =
    settings?.sttEngine === "openai" && Boolean(settings.sttApiBaseUrl.trim());
  const isMiniMaxReady =
    settings?.sttEngine === "minimax" && Boolean(settings.sttApiKey.trim());

  if (!settings || (!isOpenAiReady && !isMiniMaxReady)) {
    return NextResponse.json({
      ok: false,
      code: "stt_not_configured",
      error: "未配置云端语音识别，已使用浏览器原生语音识别",
      text: "",
    });
  }

  try {
    const filename = audio instanceof File && audio.name ? audio.name : "speech.wav";
    const text =
      settings.sttEngine === "minimax"
        ? await transcribeWithMiniMax({
            audioBlob: audio,
            filename,
            baseUrl: settings.sttApiBaseUrl,
            apiKey: settings.sttApiKey,
            model: settings.sttApiModel,
            hints,
          })
        : await transcribeWithOpenAi({
            audioBlob: audio,
            filename,
            baseUrl: settings.sttApiBaseUrl,
            apiKey: settings.sttApiKey,
            model: settings.sttApiModel,
            hints,
          });
    return NextResponse.json({ ok: true, text });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      code: "stt_failed",
      error: err instanceof Error ? err.message : "语音识别失败",
      text: "",
    });
  }
}
