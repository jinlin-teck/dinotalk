import { and, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getAllPhonics, getAllVocab } from "@/data/curriculum";
import type * as schema from "@/db/schema";
import {
  childProfiles,
  dailyLogs,
  wordMastery,
  type ChildProfile,
} from "@/db/schema";
import { calculateNextReview } from "@/lib/srs";
import type { SerializedProfile } from "@/types/api";

export const DEFAULT_PROFILE_ID = 1;

export type DbOrTx = Pick<
  BetterSQLite3Database<typeof schema>,
  "select" | "insert" | "update"
>;

let cachedVocabKeys: Set<string> | null = null;
let cachedPhonicsKeys: Set<string> | null = null;

function getVocabKeySet(): Set<string> {
  if (!cachedVocabKeys) {
    cachedVocabKeys = new Set(getAllVocab().map((v) => v.id));
  }
  return cachedVocabKeys;
}

function getPhonicsKeySet(): Set<string> {
  if (!cachedPhonicsKeys) {
    cachedPhonicsKeys = new Set(getAllPhonics().map((p) => p.id));
  }
  return cachedPhonicsKeys;
}

export function isValidCurriculumItemKey(
  itemKey: string,
  itemType: "word" | "phonics"
): boolean {
  return itemType === "phonics"
    ? getPhonicsKeySet().has(itemKey)
    : getVocabKeySet().has(itemKey);
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
  return {
    ...row,
    equippedAccessories: parseJsonStringArray(row.equippedAccessoriesJson),
    ownedAccessories: parseJsonStringArray(row.ownedAccessoriesJson),
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
    itemType: "word" | "phonics";
    unitId: string;
    correct: boolean;
    now: Date;
    profileId?: number;
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

  if (existing) {
    tx.update(wordMastery)
      .set({
        masteryLevel: srs.masteryLevel,
        correctCount: sql`${wordMastery.correctCount} + ${params.correct ? 1 : 0}`,
        wrongCount: sql`${wordMastery.wrongCount} + ${params.correct ? 0 : 1}`,
        nextReviewAt: srs.nextReviewAt,
        lastPracticedAt: nowIso,
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
