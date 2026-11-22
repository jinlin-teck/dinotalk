import { NextResponse } from "next/server";
import { asc, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { childProfiles, dailyLogs, unitProgress, wordMastery } from "@/db/schema";
import { requireParentAuth } from "@/lib/auth/parent-session";
import { resolveActiveProfile } from "@/lib/auth/profile-session";
import { assertJsonSameOrigin } from "@/lib/security/endpoint-guard";
import {
  createChildProfile,
  findProfileByNickname,
  MAX_CHILD_PROFILES,
  normalizeNickname,
  serializeProfile,
} from "@/lib/services/learning-service";
import type { ParentManagedProfile } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParentCreateProfileSchema = z.object({
  nickname: z.string().min(1).max(20),
  companionName: z.string().min(1).max(20).optional(),
  dailyGoalMinutes: z.number().int().min(5).max(60).optional(),
  eyeCareMinutes: z.number().int().min(5).max(60).optional(),
});

export async function GET(request: Request) {
  const authError = requireParentAuth(request);
  if (authError) return authError;

  const db = getDb();
  const activeProfile = resolveActiveProfile(db, request);
  const rows = db.select().from(childProfiles).orderBy(asc(childProfiles.id)).all();
  const progressRows = db.select().from(unitProgress).all();
  const masteryRows = db.select().from(wordMastery).all();
  const logRows = db.select().from(dailyLogs).all();

  const unitStatsMap = new Map<number, { completedUnitsCount: number; totalUnitStars: number }>();
  for (const row of progressRows) {
    const entry = unitStatsMap.get(row.profileId) ?? {
      completedUnitsCount: 0,
      totalUnitStars: 0,
    };
    if (row.starsEarned >= 4) {
      entry.completedUnitsCount += 1;
    }
    entry.totalUnitStars += row.starsEarned;
    unitStatsMap.set(row.profileId, entry);
  }

  const masteryCountMap = new Map<number, number>();
  for (const row of masteryRows) {
    if (row.masteryLevel >= 1) {
      masteryCountMap.set(row.profileId, (masteryCountMap.get(row.profileId) ?? 0) + 1);
    }
  }

  const studySecondsMap = new Map<number, number>();
  for (const row of logRows) {
    studySecondsMap.set(row.profileId, (studySecondsMap.get(row.profileId) ?? 0) + row.studySeconds);
  }

  const profiles: ParentManagedProfile[] = rows.map((row) => {
    const unitStats = unitStatsMap.get(row.id) ?? { completedUnitsCount: 0, totalUnitStars: 0 };
    return {
      ...serializeProfile(row),
      completedUnitsCount: unitStats.completedUnitsCount,
      totalUnitStars: unitStats.totalUnitStars,
      masteredItemCount: masteryCountMap.get(row.id) ?? 0,
      totalStudyMinutes: Math.round(((studySecondsMap.get(row.id) ?? 0) / 60) * 10) / 10,
    };
  });

  return NextResponse.json({
    profiles,
    activeProfileId: activeProfile?.id ?? null,
  });
}

export async function POST(request: Request) {
  const originError = assertJsonSameOrigin(request);
  if (originError) return originError;

  const authError = requireParentAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const parsed = ParentCreateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "新建档案参数格式不正确" }, { status: 400 });
  }

  const nickname = normalizeNickname(parsed.data.nickname);
  if (!nickname) {
    return NextResponse.json({ error: "孩子昵称不能为空" }, { status: 400 });
  }
  const companionName =
    parsed.data.companionName !== undefined
      ? normalizeNickname(parsed.data.companionName)
      : "Dino";
  if (!companionName) {
    return NextResponse.json({ error: "恐龙伙伴名字不能为空" }, { status: 400 });
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

      const created = createChildProfile(tx, {
        nickname,
        companionName,
        dailyGoalMinutes: parsed.data.dailyGoalMinutes,
        eyeCareMinutes: parsed.data.eyeCareMinutes,
      });
      return { kind: "created" as const, created };
    },
    { behavior: "immediate" }
  );

  if (txRes.kind === "conflict") {
    return NextResponse.json(
      { error: `已存在名为「${txRes.existing.nickname}」的孩子档案，请使用其他昵称` },
      { status: 409 }
    );
  }
  if (txRes.kind === "limit") {
    return NextResponse.json(
      { error: `最多只能创建 ${MAX_CHILD_PROFILES} 个孩子档案` },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      profile: serializeProfile(txRes.created),
    },
    { status: 201 }
  );
}
