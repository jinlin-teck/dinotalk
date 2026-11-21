import { NextResponse } from "next/server";
import { and, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, todayDateKey } from "@/db";
import { childProfiles, dailyLogs, unitProgress, wordMastery } from "@/db/schema";
import { PET_ACCESSORIES, PET_SNACKS } from "@/data/curriculum";
import { requireParentAuth } from "@/lib/auth/parent-session";
import { assertJsonSameOrigin } from "@/lib/security/endpoint-guard";
import {
  addDailyLogStats,
  DEFAULT_PROFILE_ID,
  parseJsonStringArray,
  serializeProfile,
} from "@/lib/services/learning-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function updateStreakIfNeeded(
  profile: typeof childProfiles.$inferSelect,
  db: ReturnType<typeof getDb>
) {
  const today = todayDateKey();
  if (profile.lastActiveDate === today) {
    return profile;
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = todayDateKey(yesterday);
  // 专为 7 岁儿童设计的温和打卡机制：连续登录递增，断签后保留历史最高基础（至少 1 天），不归零挫败孩子。
  const nextStreak =
    profile.lastActiveDate === yesterdayKey
      ? profile.streakDays + 1
      : Math.max(1, profile.streakDays);

  const now = new Date().toISOString();
  db.update(childProfiles)
    .set({
      streakDays: nextStreak,
      lastActiveDate: today,
      updatedAt: now,
    })
    .where(eq(childProfiles.id, profile.id))
    .run();

  return {
    ...profile,
    streakDays: nextStreak,
    lastActiveDate: today,
    updatedAt: now,
  };
}

export async function GET() {
  const db = getDb();
  let profile = db
    .select()
    .from(childProfiles)
    .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
    .get();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  profile = updateStreakIfNeeded(profile, db);

  const today = todayDateKey();
  const todayLog =
    db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.profileId, DEFAULT_PROFILE_ID), eq(dailyLogs.dateKey, today)))
      .get() ?? {
      id: 0,
      profileId: DEFAULT_PROFILE_ID,
      dateKey: today,
      studySeconds: 0,
      activitiesCompleted: 0,
      wordsPracticed: 0,
    };

  const nowIso = new Date().toISOString();
  const dueCountRow = db
    .select({ count: sql<number>`count(*)` })
    .from(wordMastery)
    .where(
      and(eq(wordMastery.profileId, DEFAULT_PROFILE_ID), lte(wordMastery.nextReviewAt, nowIso))
    )
    .get();

  const progress = db
    .select()
    .from(unitProgress)
    .where(eq(unitProgress.profileId, DEFAULT_PROFILE_ID))
    .all();

  return NextResponse.json({
    profile: serializeProfile(profile),
    todayLog,
    dueReviewCount: Number(dueCountRow?.count ?? 0),
    unitProgress: progress,
  });
}

const PatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_profile"),
    nickname: z.string().min(1).max(20).optional(),
    companionName: z.string().min(1).max(20).optional(),
    dailyGoalMinutes: z.number().int().min(5).max(60).optional(),
    eyeCareMinutes: z.number().int().min(5).max(60).optional(),
  }),
  z.object({
    action: z.literal("feed"),
    snackId: z.string().min(1),
  }),
  z.object({
    action: z.literal("buy_accessory"),
    accessoryId: z.string().min(1),
  }),
  z.object({
    action: z.literal("equip_accessory"),
    accessoryId: z.string().min(1),
  }),
  z.object({
    action: z.literal("heartbeat_study"),
    seconds: z.number().int().min(5).max(300),
  }),
]);

export async function PATCH(request: Request) {
  const originError = assertJsonSameOrigin(request);
  if (originError) return originError;

  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数格式不正确" }, { status: 400 });
  }

  const data = parsed.data;
  if (data.action === "update_profile") {
    const authError = requireParentAuth(request);
    if (authError) return authError;
  }

  const db = getDb();
  const now = new Date().toISOString();

  if (data.action === "update_profile") {
    const result = db.transaction((tx) => {
      const profile = tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .get();
      if (!profile) return null;

      tx.update(childProfiles)
        .set({
          nickname: data.nickname?.trim() || profile.nickname,
          companionName: data.companionName?.trim() || profile.companionName,
          dailyGoalMinutes: data.dailyGoalMinutes ?? profile.dailyGoalMinutes,
          eyeCareMinutes: data.eyeCareMinutes ?? profile.eyeCareMinutes,
          updatedAt: now,
        })
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .run();

      return tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .get()!;
    });

    if (!result) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    return NextResponse.json({ profile: serializeProfile(result) });
  }

  if (data.action === "feed") {
    const snack = PET_SNACKS.find((s) => s.id === data.snackId);
    if (!snack) {
      return NextResponse.json({ error: "未找到该零食" }, { status: 400 });
    }

    const txRes = db.transaction((tx) => {
      const profile = tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .get();
      if (!profile) return { error: "Profile not found", status: 404 as const };
      if (profile.totalStars < snack.costStars) {
        return {
          error: "星星不够啦，再去学一个单元赚星星吧！",
          status: 400 as const,
        };
      }

      const nextStars = profile.totalStars - snack.costStars;
      const nextHunger = Math.min(100, profile.petHunger + snack.hungerGain);
      const nextMood = Math.min(100, profile.petMood + snack.moodGain);
      const levelGain = snack.costStars >= 4 && nextHunger >= 95 ? 1 : 0;

      tx.update(childProfiles)
        .set({
          totalStars: nextStars,
          petHunger: nextHunger,
          petMood: nextMood,
          level: profile.level + levelGain,
          updatedAt: now,
        })
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .run();

      const fresh = tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .get()!;
      return { fresh };
    });

    if ("error" in txRes) {
      return NextResponse.json({ error: txRes.error }, { status: txRes.status });
    }
    return NextResponse.json({
      messageZh: snack.reactionZh,
      profile: serializeProfile(txRes.fresh),
    });
  }

  if (data.action === "buy_accessory") {
    const item = PET_ACCESSORIES.find((a) => a.id === data.accessoryId);
    if (!item) {
      return NextResponse.json({ error: "未找到该装扮" }, { status: 400 });
    }

    const txRes = db.transaction((tx) => {
      const profile = tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .get();
      if (!profile) return { error: "Profile not found", status: 404 as const };

      const owned = parseJsonStringArray(profile.ownedAccessoriesJson);
      const equipped = parseJsonStringArray(profile.equippedAccessoriesJson);

      if (owned.includes(item.id)) {
        return { error: "你已经拥有这个装扮啦", status: 400 as const };
      }
      if (profile.totalStars < item.costStars) {
        return { error: "星星还差一点点，加油闯关哦！", status: 400 as const };
      }

      const nextOwned = [...owned, item.id];
      const nextEquipped = equipped.includes(item.id) ? equipped : [...equipped, item.id];

      tx.update(childProfiles)
        .set({
          totalStars: profile.totalStars - item.costStars,
          ownedAccessoriesJson: JSON.stringify(nextOwned),
          equippedAccessoriesJson: JSON.stringify(nextEquipped),
          petMood: Math.min(100, profile.petMood + 10),
          updatedAt: now,
        })
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .run();

      const fresh = tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .get()!;
      return { fresh };
    });

    if ("error" in txRes) {
      return NextResponse.json({ error: txRes.error }, { status: txRes.status });
    }
    return NextResponse.json({
      messageZh: `太酷啦！已解锁并戴上「${item.nameZh}」！`,
      profile: serializeProfile(txRes.fresh),
    });
  }

  if (data.action === "equip_accessory") {
    const txRes = db.transaction((tx) => {
      const profile = tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .get();
      if (!profile) return { error: "Profile not found", status: 404 as const };

      const owned = parseJsonStringArray(profile.ownedAccessoriesJson);
      if (!owned.includes(data.accessoryId)) {
        return { error: "请先用星星解锁这件装扮哦", status: 400 as const };
      }
      const equipped = parseJsonStringArray(profile.equippedAccessoriesJson);
      const nextEquipped = equipped.includes(data.accessoryId)
        ? equipped.filter((id) => id !== data.accessoryId)
        : [...equipped, data.accessoryId];

      tx.update(childProfiles)
        .set({
          equippedAccessoriesJson: JSON.stringify(nextEquipped),
          updatedAt: now,
        })
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .run();

      const fresh = tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .get()!;
      return { fresh };
    });

    if ("error" in txRes) {
      return NextResponse.json({ error: txRes.error }, { status: txRes.status });
    }
    return NextResponse.json({ profile: serializeProfile(txRes.fresh) });
  }

  // heartbeat_study
  const today = todayDateKey();
  db.transaction((tx) => {
    addDailyLogStats(tx, today, { studySeconds: data.seconds });
  });

  return NextResponse.json({ ok: true });
}
