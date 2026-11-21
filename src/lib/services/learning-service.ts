import { and, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  getUnitRewardAccessory,
  PET_ACCESSORIES,
  type UnitDef,
} from "@/data/curriculum";
import type * as schema from "@/db/schema";
import {
  childProfiles,
  dailyLogs,
  wordMastery,
  type ChildProfile,
} from "@/db/schema";
import { calculateNextReview } from "@/lib/srs";
import type {
  CurriculumItemType,
  SerializedProfile,
  UnlockedAccessoryNotice,
} from "@/types/api";

export const DEFAULT_PROFILE_ID = 1;

export type DbOrTx = Pick<
  BetterSQLite3Database<typeof schema>,
  "select" | "insert" | "update"
>;

export function unitHasCurriculumItem(
  unit: UnitDef,
  itemKey: string,
  itemType: CurriculumItemType
): boolean {
  const items = itemType === "phonics" ? unit.phonics : itemType === "sentence" ? unit.sentences : unit.vocab;
  return items.some((item) => item.id === itemKey);
}

export function parseJsonStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function serializeProfile(row: ChildProfile): SerializedProfile {
  const { ownedSkinIdsJson, ...profile } = row;
  return {
    ...profile,
    equippedAccessories: parseJsonStringArray(row.equippedAccessoriesJson),
    ownedAccessories: parseJsonStringArray(row.ownedAccessoriesJson),
    ownedSkinIds: parseJsonStringArray(ownedSkinIdsJson),
  };
}

export function addDailyLogStats(
  tx: DbOrTx,
  dateKey: string,
  delta: {
    studySeconds?: number;
    activitiesCompleted?: number;
    wordsPracticed?: number;
  },
  profileId = DEFAULT_PROFILE_ID
): void {
  const studySeconds = Math.max(0, Math.floor(delta.studySeconds ?? 0));
  const activitiesCompleted = Math.max(0, Math.floor(delta.activitiesCompleted ?? 0));
  const wordsPracticed = Math.max(0, Math.floor(delta.wordsPracticed ?? 0));

  tx.insert(dailyLogs)
    .values({
      profileId,
      dateKey,
      studySeconds,
      activitiesCompleted,
      wordsPracticed,
    })
    .onConflictDoUpdate({
      target: [dailyLogs.profileId, dailyLogs.dateKey],
      set: {
        studySeconds: sql`${dailyLogs.studySeconds} + ${studySeconds}`,
        activitiesCompleted: sql`${dailyLogs.activitiesCompleted} + ${activitiesCompleted}`,
        wordsPracticed: sql`${dailyLogs.wordsPracticed} + ${wordsPracticed}`,
      },
    })
    .run();
}

export function upsertWordMasteryItem(
  tx: DbOrTx,
  params: {
    itemKey: string;
    itemType: CurriculumItemType;
    unitId: string;
    correct: boolean;
    now: Date;
    profileId?: number;
    reviewMissPending?: boolean;
  }
) {
  const profileId = params.profileId ?? DEFAULT_PROFILE_ID;
  const nowIso = params.now.toISOString();

  const existing = tx
    .select()
    .from(wordMastery)
    .where(and(eq(wordMastery.profileId, profileId), eq(wordMastery.itemKey, params.itemKey)))
    .get();

  const srs = calculateNextReview(existing?.masteryLevel ?? 0, params.correct, params.now);
  const reviewMissPending = params.correct ? false : params.reviewMissPending;

  if (existing) {
    tx.update(wordMastery)
      .set({
        itemType: params.itemType,
        unitId: params.unitId,
        masteryLevel: srs.masteryLevel,
        correctCount: sql`${wordMastery.correctCount} + ${params.correct ? 1 : 0}`,
        wrongCount: sql`${wordMastery.wrongCount} + ${params.correct ? 0 : 1}`,
        nextReviewAt: srs.nextReviewAt,
        lastPracticedAt: nowIso,
        reviewMissPending,
      })
      .where(eq(wordMastery.id, existing.id))
      .run();
  } else {
    tx.insert(wordMastery)
      .values({
        profileId,
        itemKey: params.itemKey,
        itemType: params.itemType,
        unitId: params.unitId,
        masteryLevel: srs.masteryLevel,
        correctCount: params.correct ? 1 : 0,
        wrongCount: params.correct ? 0 : 1,
        nextReviewAt: srs.nextReviewAt,
        lastPracticedAt: nowIso,
        reviewMissPending,
      })
      .run();
  }

  return srs;
}

export function awardStarsAndMood(
  tx: DbOrTx,
  params: {
    starsDelta: number;
    moodDelta?: number;
    nowIso: string;
    profileId?: number;
  }
): ChildProfile | undefined {
  const profileId = params.profileId ?? DEFAULT_PROFILE_ID;
  const starsDelta = Math.max(0, Math.floor(params.starsDelta));
  const moodDelta = Math.max(0, Math.floor(params.moodDelta ?? 0));

  if (starsDelta > 0 || moodDelta > 0) {
    tx.update(childProfiles)
      .set({
        totalStars: sql`${childProfiles.totalStars} + ${starsDelta}`,
        level: sql`MAX(${childProfiles.level}, 1 + ((${childProfiles.totalStars} + ${starsDelta}) / 20))`,
        petMood: sql`MIN(100, ${childProfiles.petMood} + ${moodDelta})`,
        updatedAt: params.nowIso,
      })
      .where(eq(childProfiles.id, profileId))
      .run();
  }

  return tx.select().from(childProfiles).where(eq(childProfiles.id, profileId)).get();
}

export function unlockUnitAccessoryIfCompleted(
  tx: DbOrTx,
  params: {
    unitId: string;
    starsEarned: number;
    nowIso: string;
    profileId?: number;
  }
): UnlockedAccessoryNotice | null {
  if (params.starsEarned < 4) return null;
  const reward = getUnitRewardAccessory(params.unitId);
  if (!reward) return null;

  const profileId = params.profileId ?? DEFAULT_PROFILE_ID;
  const profile = tx
    .select()
    .from(childProfiles)
    .where(eq(childProfiles.id, profileId))
    .get();
  if (!profile) return null;

  const owned = parseJsonStringArray(profile.ownedAccessoriesJson);
  if (owned.includes(reward.id)) return null;

  const nextOwned = [...owned, reward.id];
  tx.update(childProfiles)
    .set({
      ownedAccessoriesJson: JSON.stringify(nextOwned),
      updatedAt: params.nowIso,
    })
    .where(eq(childProfiles.id, profileId))
    .run();

  return {
    id: reward.id,
    nameZh: reward.nameZh,
    emoji: reward.emoji,
    descZh: reward.descZh,
  };
}

export function withCompletedUnitAccessories(
  profile: ChildProfile,
  progress: Array<{ unitId: string; starsEarned: number }>
): ChildProfile {
  const owned = parseJsonStringArray(profile.ownedAccessoriesJson);
  const ownedSet = new Set(owned);
  let added = false;
  for (const row of progress) {
    if (row.starsEarned < 4) continue;
    const reward = getUnitRewardAccessory(row.unitId);
    if (reward && !ownedSet.has(reward.id)) {
      ownedSet.add(reward.id);
      owned.push(reward.id);
      added = true;
    }
  }
  return added ? { ...profile, ownedAccessoriesJson: JSON.stringify(owned) } : profile;
}

/**
 * Equips or toggles an accessory while enforcing same-slot exclusivity
 * (e.g., swapping hats or eyewear so SVG overlays never collide),
 * while allowing different slots (hat + face + neck + hand) to combine freely.
 */
export function applyAccessoryEquipWithSlot(
  equipped: string[],
  accessoryId: string,
  mode: "toggle" | "equip" = "toggle"
): string[] {
  if (mode === "toggle" && equipped.includes(accessoryId)) {
    return equipped.filter((id) => id !== accessoryId);
  }
  const target = PET_ACCESSORIES.find((a) => a.id === accessoryId);
  const targetSlot = target?.slot;
  const filtered = equipped.filter((id) => {
    if (id === accessoryId) return false;
    if (!targetSlot) return true;
    const existing = PET_ACCESSORIES.find((a) => a.id === id);
    return existing?.slot !== targetSlot;
  });
  return [...filtered, accessoryId];
}
