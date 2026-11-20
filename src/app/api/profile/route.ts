import { NextResponse } from "next/server";
import { eq, and, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb, todayDateKey } from "@/db";
import { childProfiles, dailyLogs, unitProgress, wordMastery } from "@/db/schema";
import { PET_ACCESSORIES, PET_SNACKS } from "@/data/curriculum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseJsonStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function updateStreakIfNeeded(profile: typeof childProfiles.$inferSelect, db: ReturnType<typeof getDb>) {
  const today = todayDateKey();
  if (profile.lastActiveDate === today) {
    return profile;
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = todayDateKey(yesterday);
  const nextStreak =
    profile.lastActiveDate === yesterdayKey ? profile.streakDays + 1 : Math.max(1, profile.streakDays);

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
  let profile = db.select().from(childProfiles).where(eq(childProfiles.id, 1)).get();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  profile = updateStreakIfNeeded(profile, db);

  const today = todayDateKey();
  const todayLog =
    db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.profileId, 1), eq(dailyLogs.dateKey, today)))
      .get() ?? {
      id: 0,
      profileId: 1,
      dateKey: today,
      studySeconds: 0,
      activitiesCompleted: 0,
      wordsPracticed: 0,
    };

  const nowIso = new Date().toISOString();
  const dueItems = db
    .select()
    .from(wordMastery)
    .where(and(eq(wordMastery.profileId, 1), lte(wordMastery.nextReviewAt, nowIso)))
    .all();

  const progress = db.select().from(unitProgress).where(eq(unitProgress.profileId, 1)).all();

  return NextResponse.json({
    profile: {
      ...profile,
      equippedAccessories: parseJsonStringArray(profile.equippedAccessoriesJson),
      ownedAccessories: parseJsonStringArray(profile.ownedAccessoriesJson),
    },
    todayLog,
    dueReviewCount: dueItems.length,
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
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数格式不正确" }, { status: 400 });
  }

  const db = getDb();
  const profile = db.select().from(childProfiles).where(eq(childProfiles.id, 1)).get();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const data = parsed.data;

  if (data.action === "update_profile") {
    const updated = {
      nickname: data.nickname?.trim() || profile.nickname,
      companionName: data.companionName?.trim() || profile.companionName,
      dailyGoalMinutes: data.dailyGoalMinutes ?? profile.dailyGoalMinutes,
      eyeCareMinutes: data.eyeCareMinutes ?? profile.eyeCareMinutes,
      updatedAt: now,
    };
    db.update(childProfiles).set(updated).where(eq(childProfiles.id, 1)).run();
    const fresh = db.select().from(childProfiles).where(eq(childProfiles.id, 1)).get()!;
    return NextResponse.json({
      profile: {
        ...fresh,
        equippedAccessories: parseJsonStringArray(fresh.equippedAccessoriesJson),
        ownedAccessories: parseJsonStringArray(fresh.ownedAccessoriesJson),
      },
    });
  }

  if (data.action === "feed") {
    const snack = PET_SNACKS.find((s) => s.id === data.snackId);
    if (!snack) {
      return NextResponse.json({ error: "未找到该零食" }, { status: 400 });
    }
    if (profile.totalStars < snack.costStars) {
      return NextResponse.json({ error: "星星不够啦，再去学一个单元赚星星吧！" }, { status: 400 });
    }

    const nextStars = profile.totalStars - snack.costStars;
    const nextHunger = Math.min(100, profile.petHunger + snack.hungerGain);
    const nextMood = Math.min(100, profile.petMood + snack.moodGain);
    const levelGain = snack.costStars >= 4 && nextHunger >= 95 ? 1 : 0;

    db.update(childProfiles)
      .set({
        totalStars: nextStars,
        petHunger: nextHunger,
        petMood: nextMood,
        level: profile.level + levelGain,
        updatedAt: now,
      })
      .where(eq(childProfiles.id, 1))
      .run();

    const fresh = db.select().from(childProfiles).where(eq(childProfiles.id, 1)).get()!;
    return NextResponse.json({
      messageZh: snack.reactionZh,
      profile: {
        ...fresh,
        equippedAccessories: parseJsonStringArray(fresh.equippedAccessoriesJson),
        ownedAccessories: parseJsonStringArray(fresh.ownedAccessoriesJson),
      },
    });
  }

  if (data.action === "buy_accessory") {
    const item = PET_ACCESSORIES.find((a) => a.id === data.accessoryId);
    if (!item) {
      return NextResponse.json({ error: "未找到该装扮" }, { status: 400 });
    }
    const owned = parseJsonStringArray(profile.ownedAccessoriesJson);
    const equipped = parseJsonStringArray(profile.equippedAccessoriesJson);

    if (owned.includes(item.id)) {
      return NextResponse.json({ error: "你已经拥有这个装扮啦" }, { status: 400 });
    }
    if (profile.totalStars < item.costStars) {
      return NextResponse.json({ error: "星星还差一点点，加油闯关哦！" }, { status: 400 });
    }

    const nextOwned = [...owned, item.id];
    const nextEquipped = equipped.includes(item.id) ? equipped : [...equipped, item.id];

    db.update(childProfiles)
      .set({
        totalStars: profile.totalStars - item.costStars,
        ownedAccessoriesJson: JSON.stringify(nextOwned),
        equippedAccessoriesJson: JSON.stringify(nextEquipped),
        petMood: Math.min(100, profile.petMood + 10),
        updatedAt: now,
      })
      .where(eq(childProfiles.id, 1))
      .run();

    const fresh = db.select().from(childProfiles).where(eq(childProfiles.id, 1)).get()!;
    return NextResponse.json({
      messageZh: `太酷啦！已解锁并戴上「${item.nameZh}」！`,
      profile: {
        ...fresh,
        equippedAccessories: parseJsonStringArray(fresh.equippedAccessoriesJson),
        ownedAccessories: parseJsonStringArray(fresh.ownedAccessoriesJson),
      },
    });
  }

  if (data.action === "equip_accessory") {
    const owned = parseJsonStringArray(profile.ownedAccessoriesJson);
    if (!owned.includes(data.accessoryId)) {
      return NextResponse.json({ error: "请先用星星解锁这件装扮哦" }, { status: 400 });
    }
    const equipped = parseJsonStringArray(profile.equippedAccessoriesJson);
    const nextEquipped = equipped.includes(data.accessoryId)
      ? equipped.filter((id) => id !== data.accessoryId)
      : [...equipped, data.accessoryId];

    db.update(childProfiles)
      .set({
        equippedAccessoriesJson: JSON.stringify(nextEquipped),
        updatedAt: now,
      })
      .where(eq(childProfiles.id, 1))
      .run();

    const fresh = db.select().from(childProfiles).where(eq(childProfiles.id, 1)).get()!;
    return NextResponse.json({
      profile: {
        ...fresh,
        equippedAccessories: parseJsonStringArray(fresh.equippedAccessoriesJson),
        ownedAccessories: parseJsonStringArray(fresh.ownedAccessoriesJson),
      },
    });
  }

  // heartbeat_study
  const today = todayDateKey();
  const existingLog = db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.profileId, 1), eq(dailyLogs.dateKey, today)))
    .get();

  if (existingLog) {
    db.update(dailyLogs)
      .set({ studySeconds: existingLog.studySeconds + data.seconds })
      .where(eq(dailyLogs.id, existingLog.id))
      .run();
  } else {
    db.insert(dailyLogs)
      .values({
        profileId: 1,
        dateKey: today,
        studySeconds: data.seconds,
        activitiesCompleted: 0,
        wordsPracticed: 0,
      })
      .run();
  }

  return NextResponse.json({ ok: true });
}
