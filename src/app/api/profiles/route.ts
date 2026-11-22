import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { childProfiles } from "@/db/schema";
import {
  clearActiveProfileCookie,
  extractProfileIdFromRequest,
  resolveActiveProfile,
  setActiveProfileCookie,
} from "@/lib/auth/profile-session";
import { assertJsonSameOrigin } from "@/lib/security/endpoint-guard";
import { consumeRateLimit, getRequestSourceKey } from "@/lib/security/rate-limit";
import {
  createChildProfile,
  findProfileByNickname,
  listPublicProfileSummaries,
  MAX_CHILD_PROFILES,
  normalizeNickname,
  serializeProfile,
  toPublicProfileSummary,
} from "@/lib/services/learning-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateProfileSchema = z.object({
  nickname: z.string().min(1).max(20),
});

export async function GET(request: Request) {
  const db = getDb();
  const activeProfile = resolveActiveProfile(db, request);
  const profiles = listPublicProfileSummaries(db);
  const res = NextResponse.json({
    profiles,
    activeProfileId: activeProfile?.id ?? null,
  });
  if (!activeProfile && extractProfileIdFromRequest(request) !== null) {
    clearActiveProfileCookie(res, request);
  }
  return res;
}

export async function POST(request: Request) {
  const originError = assertJsonSameOrigin(request);
  if (originError) return originError;

  if (consumeRateLimit("profile-create", getRequestSourceKey(request), 30, 5 * 60 * 1000)) {
    return NextResponse.json(
      { error: "创建档案太频繁啦，稍等一会儿再试试哦~" },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入有效的名字（1~20 个字符）" }, { status: 400 });
  }

  const nickname = normalizeNickname(parsed.data.nickname);
  if (!nickname) {
    return NextResponse.json({ error: "名字不能为空哦~" }, { status: 400 });
  }

  const db = getDb();
  const txRes = db.transaction(
    (tx) => {
      const duplicate = findProfileByNickname(tx, nickname);
      if (duplicate) {
        return { kind: "conflict" as const, existing: duplicate };
      }

      const countRow = tx
        .select({ count: sql<number>`count(*)` })
        .from(childProfiles)
        .get();
      if (Number(countRow?.count ?? 0) >= MAX_CHILD_PROFILES) {
        return { kind: "limit" as const };
      }

      const created = createChildProfile(tx, { nickname });
      return { kind: "created" as const, created };
    },
    { behavior: "immediate" }
  );

  if (txRes.kind === "conflict") {
    return NextResponse.json(
      {
        error: `已经有叫「${txRes.existing.nickname}」的小伙伴啦！`,
        code: "duplicate_nickname",
        existingProfile: toPublicProfileSummary(txRes.existing),
      },
      { status: 409 }
    );
  }

  if (txRes.kind === "limit") {
    return NextResponse.json(
      { error: `最多支持创建 ${MAX_CHILD_PROFILES} 个学习档案，请联系家长在控制台清理不用的档案` },
      { status: 400 }
    );
  }

  const res = NextResponse.json(
    {
      ok: true,
      profile: serializeProfile(txRes.created),
      profiles: listPublicProfileSummaries(db),
    },
    { status: 201 }
  );
  return setActiveProfileCookie(res, request, txRes.created.id);
}
