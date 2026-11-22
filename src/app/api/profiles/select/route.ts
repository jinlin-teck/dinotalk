import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { childProfiles } from "@/db/schema";
import { setActiveProfileCookie } from "@/lib/auth/profile-session";
import { assertJsonSameOrigin } from "@/lib/security/endpoint-guard";
import { serializeProfile } from "@/lib/services/learning-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SelectProfileSchema = z.object({
  profileId: z.number().int().positive(),
});

export async function POST(request: Request) {
  const originError = assertJsonSameOrigin(request);
  if (originError) return originError;

  const body = await request.json().catch(() => null);
  const parsed = SelectProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "请选择有效的学习档案" }, { status: 400 });
  }

  const db = getDb();
  const profile = db
    .select()
    .from(childProfiles)
    .where(eq(childProfiles.id, parsed.data.profileId))
    .get();
  if (!profile) {
    return NextResponse.json({ error: "该学习档案不存在或已被删除" }, { status: 404 });
  }

  const res = NextResponse.json({
    ok: true,
    profile: serializeProfile(profile),
  });
  return setActiveProfileCookie(res, request, profile.id);
}
