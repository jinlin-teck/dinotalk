import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { childProfiles } from "@/db/schema";
import { requireParentAuth } from "@/lib/auth/parent-session";
import {
  clearActiveProfileCookie,
  extractProfileIdFromRequest,
} from "@/lib/auth/profile-session";
import { assertJsonSameOrigin, assertSameOrigin } from "@/lib/security/endpoint-guard";
import {
  deleteChildProfileCascade,
  findProfileByNickname,
  normalizeNickname,
  serializeProfile,
} from "@/lib/services/learning-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseProfileIdParam(rawId: string): number | null {
  const trimmed = rawId.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

const ParentUpdateProfileSchema = z.object({
  nickname: z.string().min(1).max(20).optional(),
  companionName: z.string().min(1).max(20).optional(),
  dailyGoalMinutes: z.number().int().min(5).max(60).optional(),
  eyeCareMinutes: z.number().int().min(5).max(60).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const originError = assertJsonSameOrigin(request);
  if (originError) return originError;

  const authError = requireParentAuth(request);
  if (authError) return authError;

  const { id: rawId } = await context.params;
  const profileId = parseProfileIdParam(rawId);
  if (profileId === null) {
    return NextResponse.json({ error: "无效的孩子档案 ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = ParentUpdateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "更新档案参数格式不正确" }, { status: 400 });
  }

  const d = parsed.data;
  const nextNickname = d.nickname !== undefined ? normalizeNickname(d.nickname) : undefined;
  if (nextNickname !== undefined && !nextNickname) {
    return NextResponse.json({ error: "孩子昵称不能为空" }, { status: 400 });
  }
  const nextCompanion =
    d.companionName !== undefined ? normalizeNickname(d.companionName) : undefined;
  if (nextCompanion !== undefined && !nextCompanion) {
    return NextResponse.json({ error: "恐龙伙伴名字不能为空" }, { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();
  const txRes = db.transaction(
    (tx) => {
      const existing = tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, profileId))
        .get();
      if (!existing) {
        return { kind: "not_found" as const };
      }

      if (nextNickname !== undefined) {
        const duplicate = findProfileByNickname(tx, nextNickname, profileId);
        if (duplicate) {
          return { kind: "conflict" as const, existing: duplicate };
        }
      }

      tx.update(childProfiles)
        .set({
          nickname: nextNickname ?? existing.nickname,
          companionName: nextCompanion ?? existing.companionName,
          dailyGoalMinutes: d.dailyGoalMinutes ?? existing.dailyGoalMinutes,
          eyeCareMinutes: d.eyeCareMinutes ?? existing.eyeCareMinutes,
          updatedAt: now,
        })
        .where(eq(childProfiles.id, profileId))
        .run();

      const updated = tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, profileId))
        .get()!;
      return { kind: "updated" as const, updated };
    },
    { behavior: "immediate" }
  );

  if (txRes.kind === "not_found") {
    return NextResponse.json({ error: "找不到该孩子档案" }, { status: 404 });
  }
  if (txRes.kind === "conflict") {
    return NextResponse.json(
      { error: `已存在名为「${txRes.existing.nickname}」的孩子档案` },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    profile: serializeProfile(txRes.updated),
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const authError = requireParentAuth(request);
  if (authError) return authError;

  const { id: rawId } = await context.params;
  const profileId = parseProfileIdParam(rawId);
  if (profileId === null) {
    return NextResponse.json({ error: "无效的孩子档案 ID" }, { status: 400 });
  }

  const db = getDb();
  const deleted = db.transaction(
    (tx) => deleteChildProfileCascade(tx, profileId),
    { behavior: "immediate" }
  );

  if (!deleted) {
    return NextResponse.json({ error: "找不到该孩子档案或已被删除" }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true, deletedId: profileId });
  if (extractProfileIdFromRequest(request) === profileId) {
    clearActiveProfileCookie(res, request);
  }
  return res;
}
