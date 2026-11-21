import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { resolveActiveSttMode } from "@/lib/speech/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const row = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();

  const sttMode = row
    ? resolveActiveSttMode({
        sttEngine: row.sttEngine,
        sttApiBaseUrl: row.sttApiBaseUrl,
        hasSttApiKey: Boolean(row.sttApiKey.trim()),
      })
    : "browser";

  return NextResponse.json({ sttMode });
}
