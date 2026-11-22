import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { isLlmConfigured, maskSecret } from "@/lib/ai/provider";
import {
  hashParentPin,
  requireParentAuth,
  setParentSessionCookie,
  validateParentPinFormat,
} from "@/lib/auth/parent-session";
import {
  assertJsonSameOrigin,
  canReuseStoredSecret,
  validateEndpointUrl,
} from "@/lib/security/endpoint-guard";
import { resolveSttBaseUrl } from "@/lib/speech/constants";
import type { SanitizedSettings } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asTtsEngine(value: string): SanitizedSettings["ttsEngine"] {
  return value === "edge" || value === "openai" || value === "browser" ? value : "edge";
}

function asSttEngine(value: string): SanitizedSettings["sttEngine"] {
  return value === "browser" || value === "openai" || value === "minimax" ? value : "browser";
}

function serializeSanitizedSettings(
  row: typeof appSettings.$inferSelect
): SanitizedSettings {
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
    ttsEngine: asTtsEngine(row.ttsEngine),
    ttsVoiceEn: row.ttsVoiceEn,
    ttsVoiceZh: row.ttsVoiceZh,
    ttsSpeed: row.ttsSpeed,
    ttsAutoPlayZh: row.ttsAutoPlayZh === 1,
    ttsApiBaseUrl: row.ttsApiBaseUrl,
    ttsApiKeyMasked: maskSecret(row.ttsApiKey),
    hasTtsApiKey: Boolean(row.ttsApiKey.trim()),
    ttsApiModel: row.ttsApiModel,
    sttEngine: asSttEngine(row.sttEngine),
    sttApiBaseUrl: row.sttApiBaseUrl,
    sttApiKeyMasked: maskSecret(row.sttApiKey),
    hasSttApiKey: Boolean(row.sttApiKey.trim()),
    sttApiModel: row.sttApiModel,
    hasParentPin: Boolean(row.parentPin.trim()),
    updatedAt: row.updatedAt,
  };
}

export async function GET(request: Request) {
  const authError = requireParentAuth(request);
  if (authError) return authError;

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
  parentPin: z.string().max(32).optional(),
});

function resolveApiKey(
  storedKey: string,
  draftKey: string | undefined,
  clear: boolean | undefined,
  storedUrl: string,
  nextUrl: string
): string | null {
  if (clear) return "";
  const enteredKey = draftKey?.trim();
  if (enteredKey) return enteredKey;
  // 目标地址为空时没有可发送的出口，保留已存密钥不算跨来源复用。
  if (!nextUrl.trim()) return storedKey;
  if (!storedKey.trim() || storedUrl === nextUrl || canReuseStoredSecret(nextUrl, storedUrl)) {
    return storedKey;
  }
  return null;
}

function originChangeResponse(label: string) {
  return NextResponse.json(
    { error: `${label}接口来源已变更，请输入新来源对应的 API Key，或明确清除已存密钥` },
    { status: 400 }
  );
}

export async function PUT(request: Request) {
  const originError = assertJsonSameOrigin(request);
  if (originError) return originError;

  const authError = requireParentAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const parsed = UpdateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "配置格式不正确" }, { status: 400 });
  }

  const db = getDb();
  return db.transaction((tx) => saveSettings(request, tx, parsed.data), { behavior: "immediate" });
}

function saveSettings(
  request: Request,
  db: Pick<ReturnType<typeof getDb>, "select" | "update">,
  d: z.infer<typeof UpdateSettingsSchema>
) {
  const existing = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
  if (!existing) {
    return NextResponse.json({ error: "Settings not found" }, { status: 404 });
  }

  const authError = requireParentAuth(request, existing.parentSessionVersion);
  if (authError) return authError;

  const llmUrlCheck =
    d.llmBaseUrl !== undefined && d.llmBaseUrl !== existing.llmBaseUrl
      ? validateEndpointUrl(d.llmBaseUrl, { allowEmpty: true })
      : { ok: true as const, normalized: existing.llmBaseUrl, origin: "" };
  if (!llmUrlCheck.ok) {
    return NextResponse.json({ error: `大模型 ${llmUrlCheck.error}` }, { status: 400 });
  }

  const ttsUrlCheck =
    d.ttsApiBaseUrl !== undefined && d.ttsApiBaseUrl !== existing.ttsApiBaseUrl
      ? validateEndpointUrl(d.ttsApiBaseUrl, { allowEmpty: true })
      : { ok: true as const, normalized: existing.ttsApiBaseUrl, origin: "" };
  if (!ttsUrlCheck.ok) {
    return NextResponse.json({ error: `TTS ${ttsUrlCheck.error}` }, { status: 400 });
  }

  const sttUrlCheck =
    d.sttApiBaseUrl !== undefined && d.sttApiBaseUrl !== existing.sttApiBaseUrl
      ? validateEndpointUrl(d.sttApiBaseUrl, { allowEmpty: true })
      : { ok: true as const, normalized: existing.sttApiBaseUrl, origin: "" };
  if (!sttUrlCheck.ok) {
    return NextResponse.json({ error: `STT ${sttUrlCheck.error}` }, { status: 400 });
  }

  let validatedParentPin: string | undefined;
  if (d.parentPin !== undefined) {
    const pinCheck = validateParentPinFormat(d.parentPin);
    if (!pinCheck.ok) {
      return NextResponse.json({ error: pinCheck.error }, { status: 400 });
    }
    validatedParentPin = pinCheck.normalized;
  }

  const nextLlmBaseUrl = llmUrlCheck.normalized;
  const nextTtsBaseUrl = ttsUrlCheck.normalized;
  const nextSttEngine = d.sttEngine ?? existing.sttEngine;
  const storedSttUrl = resolveSttBaseUrl(existing.sttEngine, existing.sttApiBaseUrl);
  let nextSttBaseUrl = sttUrlCheck.normalized;
  if (
    nextSttEngine === "browser" && existing.sttEngine === "minimax" &&
    !nextSttBaseUrl.trim() && !existing.sttApiBaseUrl.trim() && existing.sttApiKey.trim() &&
    !d.clearSttApiKey
  ) {
    // Keep the MiniMax key tied to its original default when cloud STT is paused.
    nextSttBaseUrl = storedSttUrl;
  }
  const nextSttUrl = resolveSttBaseUrl(nextSttEngine, nextSttBaseUrl);
  if (nextSttUrl !== storedSttUrl && nextSttUrl && !nextSttBaseUrl) {
    const defaultUrlCheck = validateEndpointUrl(nextSttUrl);
    if (!defaultUrlCheck.ok) {
      return NextResponse.json({ error: `STT ${defaultUrlCheck.error}` }, { status: 400 });
    }
  }

  const nextLlmKey = resolveApiKey(
    existing.llmApiKey, d.llmApiKey, d.clearLlmApiKey, existing.llmBaseUrl, nextLlmBaseUrl
  );
  if (nextLlmKey === null) return originChangeResponse("大模型");
  const nextTtsKey = resolveApiKey(
    existing.ttsApiKey, d.ttsApiKey, d.clearTtsApiKey, existing.ttsApiBaseUrl, nextTtsBaseUrl
  );
  if (nextTtsKey === null) return originChangeResponse("TTS ");
  const nextSttKey = resolveApiKey(
    existing.sttApiKey, d.sttApiKey, d.clearSttApiKey, storedSttUrl, nextSttUrl
  );
  if (nextSttKey === null) return originChangeResponse("STT ");

  const nextParentPin =
    validatedParentPin === undefined
      ? existing.parentPin
      : hashParentPin(validatedParentPin);
  const nextSessionVersion = existing.parentSessionVersion + (validatedParentPin === undefined ? 0 : 1);

  const now = new Date().toISOString();

  db.update(appSettings)
    .set({
      llmProvider: d.llmProvider ?? existing.llmProvider,
      llmBaseUrl: nextLlmBaseUrl,
      llmApiKey: nextLlmKey,
      llmModel: d.llmModel !== undefined ? d.llmModel.trim() : existing.llmModel,
      llmTemperature: d.llmTemperature ?? existing.llmTemperature,
      ttsEngine: d.ttsEngine ?? existing.ttsEngine,
      ttsVoiceEn: d.ttsVoiceEn ?? existing.ttsVoiceEn,
      ttsVoiceZh: d.ttsVoiceZh ?? existing.ttsVoiceZh,
      ttsSpeed: d.ttsSpeed ?? existing.ttsSpeed,
      ttsAutoPlayZh:
        d.ttsAutoPlayZh !== undefined ? (d.ttsAutoPlayZh ? 1 : 0) : existing.ttsAutoPlayZh,
      ttsApiBaseUrl: nextTtsBaseUrl,
      ttsApiKey: nextTtsKey,
      ttsApiModel: d.ttsApiModel !== undefined ? d.ttsApiModel.trim() : existing.ttsApiModel,
      sttEngine: nextSttEngine,
      sttApiBaseUrl: nextSttBaseUrl,
      sttApiKey: nextSttKey,
      sttApiModel: d.sttApiModel !== undefined ? d.sttApiModel.trim() : existing.sttApiModel,
      parentPin: nextParentPin,
      parentSessionVersion: nextSessionVersion,
      updatedAt: now,
    })
    .where(eq(appSettings.id, 1))
    .run();

  const updated = db.select().from(appSettings).where(eq(appSettings.id, 1)).get()!;
  const response = NextResponse.json({
    ok: true,
    settings: serializeSanitizedSettings(updated),
  });
  return d.parentPin === undefined
    ? response
    : setParentSessionCookie(response, request, nextSessionVersion);
}
