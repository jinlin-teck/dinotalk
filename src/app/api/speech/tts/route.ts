import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { synthesizeSpeech } from "@/lib/speech/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TtsSchema = z.object({
  text: z.string().min(1).max(400),
  lang: z.enum(["en", "zh"]).optional().default("en"),
  speed: z.number().min(0.55).max(1.4).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = TtsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ fallback: "browser", reason: "invalid_input" }, { status: 200 });
  }

  const db = getDb();
  const settings = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
  if (!settings) {
    return NextResponse.json({ fallback: "browser", reason: "no_settings" }, { status: 200 });
  }

  const result = await synthesizeSpeech({
    text: parsed.data.text,
    lang: parsed.data.lang,
    engine: settings.ttsEngine,
    voiceEn: settings.ttsVoiceEn,
    voiceZh: settings.ttsVoiceZh,
    speed: parsed.data.speed ?? settings.ttsSpeed,
    apiBaseUrl: settings.ttsApiBaseUrl,
    apiKey: settings.ttsApiKey,
    apiModel: settings.ttsApiModel,
  });

  if (result.mode === "audio") {
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
        "X-TTS-Cached": result.cached ? "1" : "0",
      },
    });
  }

  return NextResponse.json(
    { fallback: "browser", reason: result.reason ?? "browser_mode" },
    { status: 200 }
  );
}
