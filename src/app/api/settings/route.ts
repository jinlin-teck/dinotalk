import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { isLlmConfigured, maskSecret } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeSanitizedSettings(row: typeof appSettings.$inferSelect) {
  const llmConfigured = isLlmConfigured({
    provider: row.llmProvider,
    baseUrl: row.llmBaseUrl,
    apiKey: row.llmApiKey,
    model: row.llmModel,
    temperature: row.llmTemperature,
  });

  return {
    llmProvider: row.llmProvider,
    llmBaseUrl: row.llmBaseUrl,
    llmApiKeyMasked: maskSecret(row.llmApiKey),
    hasLlmApiKey: Boolean(row.llmApiKey.trim()),
    isLlmReady: llmConfigured,
    llmModel: row.llmModel,
    llmTemperature: row.llmTemperature,
    ttsEngine: row.ttsEngine,
    ttsVoiceEn: row.ttsVoiceEn,
    ttsVoiceZh: row.ttsVoiceZh,
    ttsSpeed: row.ttsSpeed,
    ttsAutoPlayZh: row.ttsAutoPlayZh === 1,
    ttsApiBaseUrl: row.ttsApiBaseUrl,
    ttsApiKeyMasked: maskSecret(row.ttsApiKey),
    hasTtsApiKey: Boolean(row.ttsApiKey.trim()),
    ttsApiModel: row.ttsApiModel,
    sttEngine: row.sttEngine,
    sttApiBaseUrl: row.sttApiBaseUrl,
    sttApiKeyMasked: maskSecret(row.sttApiKey),
    hasSttApiKey: Boolean(row.sttApiKey.trim()),
    sttApiModel: row.sttApiModel,
    hasParentPin: Boolean(row.parentPin.trim()),
    updatedAt: row.updatedAt,
  };
}

export async function GET() {
  const db = getDb();
  const row = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
  if (!row) {
    return NextResponse.json({ error: "Settings not found" }, { status: 404 });
  }
  return NextResponse.json({ settings: serializeSanitizedSettings(row) });
}

const UpdateSettingsSchema = z.object({
  llmProvider: z.string().min(1).max(40).optional(),
  llmBaseUrl: z.string().max(300).optional(),
  llmApiKey: z.string().max(300).optional(),
  clearLlmApiKey: z.boolean().optional(),
  llmModel: z.string().max(120).optional(),
  llmTemperature: z.number().min(0).max(1.5).optional(),
  ttsEngine: z.enum(["edge", "openai", "browser"]).optional(),
  ttsVoiceEn: z.string().min(1).max(80).optional(),
  ttsVoiceZh: z.string().min(1).max(80).optional(),
  ttsSpeed: z.number().min(0.55).max(1.3).optional(),
  ttsAutoPlayZh: z.boolean().optional(),
  ttsApiBaseUrl: z.string().max(300).optional(),
  ttsApiKey: z.string().max(300).optional(),
  clearTtsApiKey: z.boolean().optional(),
  ttsApiModel: z.string().max(80).optional(),
  sttEngine: z.enum(["browser", "openai", "minimax"]).optional(),
  sttApiBaseUrl: z.string().max(300).optional(),
  sttApiKey: z.string().max(300).optional(),
  clearSttApiKey: z.boolean().optional(),
  sttApiModel: z.string().max(80).optional(),
  parentPin: z.string().max(20).optional(),
});

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = UpdateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "配置格式不正确" }, { status: 400 });
  }

  const db = getDb();
  const existing = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
  if (!existing) {
    return NextResponse.json({ error: "Settings not found" }, { status: 404 });
  }

  const d = parsed.data;
  const nextLlmKey = d.clearLlmApiKey
    ? ""
    : d.llmApiKey !== undefined && d.llmApiKey.trim() !== ""
    ? d.llmApiKey.trim()
    : existing.llmApiKey;

  const nextTtsKey = d.clearTtsApiKey
    ? ""
    : d.ttsApiKey !== undefined && d.ttsApiKey.trim() !== ""
    ? d.ttsApiKey.trim()
    : existing.ttsApiKey;

  const nextSttKey = d.clearSttApiKey
    ? ""
    : d.sttApiKey !== undefined && d.sttApiKey.trim() !== ""
    ? d.sttApiKey.trim()
    : existing.sttApiKey;

  const now = new Date().toISOString();

  db.update(appSettings)
    .set({
      llmProvider: d.llmProvider ?? existing.llmProvider,
      llmBaseUrl: d.llmBaseUrl !== undefined ? d.llmBaseUrl.trim() : existing.llmBaseUrl,
      llmApiKey: nextLlmKey,
      llmModel: d.llmModel !== undefined ? d.llmModel.trim() : existing.llmModel,
      llmTemperature: d.llmTemperature ?? existing.llmTemperature,
      ttsEngine: d.ttsEngine ?? existing.ttsEngine,
      ttsVoiceEn: d.ttsVoiceEn ?? existing.ttsVoiceEn,
      ttsVoiceZh: d.ttsVoiceZh ?? existing.ttsVoiceZh,
      ttsSpeed: d.ttsSpeed ?? existing.ttsSpeed,
      ttsAutoPlayZh:
        d.ttsAutoPlayZh !== undefined ? (d.ttsAutoPlayZh ? 1 : 0) : existing.ttsAutoPlayZh,
      ttsApiBaseUrl:
        d.ttsApiBaseUrl !== undefined ? d.ttsApiBaseUrl.trim() : existing.ttsApiBaseUrl,
      ttsApiKey: nextTtsKey,
      ttsApiModel: d.ttsApiModel !== undefined ? d.ttsApiModel.trim() : existing.ttsApiModel,
      sttEngine: d.sttEngine ?? existing.sttEngine,
      sttApiBaseUrl:
        d.sttApiBaseUrl !== undefined ? d.sttApiBaseUrl.trim() : existing.sttApiBaseUrl,
      sttApiKey: nextSttKey,
      sttApiModel: d.sttApiModel !== undefined ? d.sttApiModel.trim() : existing.sttApiModel,
      parentPin: d.parentPin !== undefined ? d.parentPin.trim() : existing.parentPin,
      updatedAt: now,
    })
    .where(eq(appSettings.id, 1))
    .run();

  const updated = db.select().from(appSettings).where(eq(appSettings.id, 1)).get()!;
  return NextResponse.json({
    ok: true,
    settings: serializeSanitizedSettings(updated),
  });
}
