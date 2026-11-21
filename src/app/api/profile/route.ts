import { NextResponse } from "next/server";
import { and, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, todayDateKey } from "@/db";
import { appSettings, childProfiles, dailyLogs, unitProgress, wordMastery } from "@/db/schema";
import { DINO_SKINS, PET_ACCESSORIES, PET_SNACKS } from "@/data/curriculum";
import { requireParentAuth } from "@/lib/auth/parent-session";
import { assertJsonSameOrigin } from "@/lib/security/endpoint-guard";
import { resolveActiveSttMode } from "@/lib/speech/constants";
import { consumeVoiceProof } from "@/lib/speech/voice-proof";
import {
  addDailyLogStats,
  applyAccessoryEquipWithSlot,
  DEFAULT_PROFILE_ID,
  type DbOrTx,
  parseJsonStringArray,
  serializeProfile,
  withCompletedUnitAccessories,
} from "@/lib/services/learning-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function calendarDaysBetween(prevKey: string, nextKey: string): number {
  const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(prevKey);
  const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nextKey);
  if (!m1 || !m2) return 0;
  const t1 = Date.UTC(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]), 12);
  const t2 = Date.UTC(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]), 12);
  const diff = Math.round((t2 - t1) / (24 * 60 * 60 * 1000));
  return diff > 0 ? diff : 0;
}

function withDailyActivity(
  profile: typeof childProfiles.$inferSelect,
  now: Date
) {
  const today = todayDateKey(now);
  if (profile.lastActiveDate === today) {
    return profile;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = todayDateKey(yesterday);
  // 专为 7 岁儿童设计的温和打卡机制：连续登录递增，断签后保留历史最高基础（至少 1 天），不归零挫败孩子。
  const nextStreak =
    profile.lastActiveDate === yesterdayKey
      ? profile.streakDays + 1
      : Math.max(1, profile.streakDays);

  // 温和隔日饥饿与开心值回落（保底不归零、不惩罚，制造“回来喂喂小恐龙”的温馨互动）
  const daysGap = Math.min(3, calendarDaysBetween(profile.lastActiveDate, today));
  const nextHunger =
    daysGap > 0 ? Math.max(40, profile.petHunger - daysGap * 18) : profile.petHunger;
  const nextMood =
    daysGap > 0 ? Math.max(60, profile.petMood - daysGap * 8) : profile.petMood;

  return {
    ...profile,
    streakDays: nextStreak,
    petHunger: nextHunger,
    petMood: nextMood,
    lastActiveDate: today,
  };
}

function getProfileProgress(db: DbOrTx) {
  return db.select().from(unitProgress).where(eq(unitProgress.profileId, DEFAULT_PROFILE_ID)).all();
}

export async function GET() {
  const db = getDb();
  const profile = db
    .select()
    .from(childProfiles)
    .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
    .get();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  const now = new Date();
  const today = todayDateKey(now);
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

  const nowIso = now.toISOString();
  const dueCountRow = db
    .select({ count: sql<number>`count(*)` })
    .from(wordMastery)
    .where(
      and(eq(wordMastery.profileId, DEFAULT_PROFILE_ID), lte(wordMastery.nextReviewAt, nowIso))
    )
    .get();

  const progress = getProfileProgress(db);

  return NextResponse.json({
    profile: serializeProfile(withCompletedUnitAccessories(withDailyActivity(profile, now), progress)),
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
    spokenDiscount: z.boolean().optional(),
    voiceProof: z.string().min(1).max(128).optional(),
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
    action: z.literal("select_avatar"),
    skinId: z.string().min(1),
  }),
  z.object({
    action: z.literal("heartbeat_study"),
    seconds: z.number().int().min(5).max(300),
  }),
  z.object({ action: z.literal("record_activity") }),
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
  const nowDate = new Date();
  const now = nowDate.toISOString();

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

    const effectiveCost = data.spokenDiscount
      ? Math.max(1, Math.floor(snack.costStars / 2))
      : snack.costStars;

    const txRes = db.transaction((tx) => {
      const profile = tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .get();
      if (!profile) return { error: "Profile not found", status: 404 as const };
      if (profile.totalStars < effectiveCost) {
        return {
          error: "星星不够啦，再去学一个单元赚星星吧！",
          status: 400 as const,
        };
      }

      if (data.spokenDiscount) {
        const settings = tx.select().from(appSettings).where(eq(appSettings.id, 1)).get()!;
        const activeSttMode = resolveActiveSttMode({
          sttEngine: settings.sttEngine,
          sttApiBaseUrl: settings.sttApiBaseUrl,
          hasSttApiKey: Boolean(settings.sttApiKey.trim()),
        });
        if (activeSttMode !== "browser" && !consumeVoiceProof(tx, data.voiceProof, profile.id, {
          purpose: "feed",
          snackId: snack.id,
        })) {
          return {
            error: "这次录音没能验证半价，请重新录音，或点「直接投喂」哦！",
            status: 400 as const,
          };
        }
      }

      const activity = withDailyActivity(profile, nowDate);
      const nextStars = profile.totalStars - effectiveCost;
      const nextHunger = Math.min(100, activity.petHunger + snack.hungerGain);
      const nextMood = Math.min(
        100,
        activity.petMood + snack.moodGain + (data.spokenDiscount ? 5 : 0)
      );
      const levelGain = snack.costStars >= 4 && nextHunger >= 95 ? 1 : 0;

      tx.update(childProfiles)
        .set({
          totalStars: nextStars,
          petHunger: nextHunger,
          petMood: nextMood,
          lastActiveDate: activity.lastActiveDate,
          streakDays: activity.streakDays,
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
    }, { behavior: "immediate" });

    if ("error" in txRes) {
      return NextResponse.json({ error: txRes.error }, { status: txRes.status });
    }
    return NextResponse.json({
      messageZh: data.spokenDiscount
        ? `🎙️ 英文读得超响亮！半价仅花 ${effectiveCost}⭐，${snack.reactionZh}`
        : snack.reactionZh,
      costStars: effectiveCost,
      profile: serializeProfile(txRes.fresh),
    });
  }

  if (data.action === "buy_accessory") {
    const item = PET_ACCESSORIES.find((a) => a.id === data.accessoryId);
    if (!item) {
      return NextResponse.json({ error: "未找到该装扮" }, { status: 400 });
    }
    if (item.unlockUnitId) {
      return NextResponse.json(
        { error: "这是关卡满 4 星免费赠送的专属荣誉装扮，快去通关解锁吧！" },
        { status: 400 }
      );
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
      const nextEquipped = applyAccessoryEquipWithSlot(equipped, item.id, "equip");

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
    if (!PET_ACCESSORIES.some((item) => item.id === data.accessoryId)) {
      return NextResponse.json({ error: "未找到该装扮" }, { status: 400 });
    }
    const txRes = db.transaction((tx) => {
      const profile = tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .get();
      if (!profile) return { error: "Profile not found", status: 404 as const };

      const { ownedAccessoriesJson } = withCompletedUnitAccessories(profile, getProfileProgress(tx));
      const owned = parseJsonStringArray(ownedAccessoriesJson);
      if (!owned.includes(data.accessoryId)) {
        return { error: "请先用星星解锁这件装扮哦", status: 400 as const };
      }
      const equipped = parseJsonStringArray(profile.equippedAccessoriesJson);
      const nextEquipped = applyAccessoryEquipWithSlot(equipped, data.accessoryId, "toggle");

      tx.update(childProfiles)
        .set({
          equippedAccessoriesJson: JSON.stringify(nextEquipped),
          ownedAccessoriesJson,
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
    }, { behavior: "immediate" });

    if ("error" in txRes) {
      return NextResponse.json({ error: txRes.error }, { status: txRes.status });
    }
    return NextResponse.json({ profile: serializeProfile(txRes.fresh) });
  }

  if (data.action === "select_avatar") {
    const skin = DINO_SKINS.find((s) => s.id === data.skinId);
    if (!skin) {
      return NextResponse.json({ error: "未找到该恐龙肤色" }, { status: 400 });
    }

    const txRes = db.transaction((tx) => {
      const profile = tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .get();
      if (!profile) return { error: "Profile not found", status: 404 as const };

      const owned = parseJsonStringArray(profile.ownedSkinIdsJson);
      const isUnlocked = skin.costStars === 0 || owned.includes(skin.id);

      if (!isUnlocked) {
        if (profile.level < skin.minLevel) {
          return {
            error: `升级到 Lv.${skin.minLevel} 后即可解锁「${skin.nameZh}」哦！`,
            status: 400 as const,
          };
        }
        if (profile.totalStars < skin.costStars) {
          return {
            error: `解锁「${skin.nameZh}」需要 ${skin.costStars} 颗星星，继续闯关集星吧！`,
            status: 400 as const,
          };
        }
        const nextOwned = [...owned, skin.id];
        tx.update(childProfiles)
          .set({
            totalStars: profile.totalStars - skin.costStars,
            avatarId: skin.id,
            ownedSkinIdsJson: JSON.stringify(nextOwned),
            petMood: Math.min(100, profile.petMood + 10),
            updatedAt: now,
          })
          .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
          .run();
      } else {
        tx.update(childProfiles)
          .set({
            avatarId: skin.id,
            updatedAt: now,
          })
          .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
          .run();
      }

      const fresh = tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
        .get()!;
      return { fresh, newlyUnlocked: !isUnlocked };
    });

    if ("error" in txRes) {
      return NextResponse.json({ error: txRes.error }, { status: txRes.status });
    }
    return NextResponse.json({
      messageZh: txRes.newlyUnlocked
        ? `哇塞！已解锁并变身为「${skin.nameZh}」！`
        : `已换上「${skin.nameZh}」造型！`,
      profile: serializeProfile(txRes.fresh),
    });
  }

  db.transaction((tx) => {
    const profile = tx.select().from(childProfiles).where(eq(childProfiles.id, DEFAULT_PROFILE_ID)).get();
    if (profile) {
      const active = withDailyActivity(profile, nowDate);
      const updated = withCompletedUnitAccessories(active, getProfileProgress(tx));
      if (updated !== profile) {
        tx.update(childProfiles).set({
          streakDays: updated.streakDays,
          petHunger: updated.petHunger,
          petMood: updated.petMood,
          lastActiveDate: updated.lastActiveDate,
          ownedAccessoriesJson: updated.ownedAccessoriesJson,
          updatedAt: now,
        }).where(eq(childProfiles.id, profile.id)).run();
      }
    }

    if (data.action === "heartbeat_study") {
      addDailyLogStats(tx, todayDateKey(nowDate), { studySeconds: data.seconds });
    }
  }, { behavior: "immediate" });

  return NextResponse.json({ ok: true });
}
