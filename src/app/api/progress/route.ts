import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, todayDateKey } from "@/db";
import { childProfiles, unitProgress, wordMastery } from "@/db/schema";
import { getUnitById } from "@/data/curriculum";
import {
  buildNoActiveProfileResponse,
  clearActiveProfileCookie,
  extractProfileIdFromRequest,
  resolveActiveProfile,
} from "@/lib/auth/profile-session";
import { assertJsonSameOrigin } from "@/lib/security/endpoint-guard";
import {
  addDailyLogStats,
  awardStarsAndMood,
  serializeProfile,
  unitHasCurriculumItem,
  unlockUnitAccessoryIfCompleted,
  upsertWordMasteryItem,
} from "@/lib/services/learning-service";
import type { CurriculumItemType } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getDb();
  const activeProfile = resolveActiveProfile(db, request);
  if (!activeProfile) {
    const res = NextResponse.json({
      needsProfile: true,
      unitProgress: [],
      wordMastery: [],
    });
    if (extractProfileIdFromRequest(request) !== null) {
      clearActiveProfileCookie(res, request);
    }
    return res;
  }

  const progress = db
    .select()
    .from(unitProgress)
    .where(eq(unitProgress.profileId, activeProfile.id))
    .all();
  const mastery = db
    .select()
    .from(wordMastery)
    .where(eq(wordMastery.profileId, activeProfile.id))
    .all();

  return NextResponse.json({
    needsProfile: false,
    unitProgress: progress,
    wordMastery: mastery,
  });
}

const CompleteStepSchema = z.object({
  unitId: z.string().min(1),
  step: z.enum(["story", "phonics", "game"]),
  score: z.number().int().min(0).max(100).optional(),
  practicedItems: z
    .array(
      z.object({
        itemKey: z.string().min(1),
        itemType: z.enum(["word", "phonics", "sentence"]),
        correct: z.boolean(),
      })
    )
    .optional(),
});

export async function POST(request: Request) {
  const originError = assertJsonSameOrigin(request);
  if (originError) return originError;

  const body = await request.json().catch(() => null);
  const parsed = CompleteStepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "提交进度参数有误" }, { status: 400 });
  }

  const { unitId, step, score, practicedItems } = parsed.data;
  const unit = getUnitById(unitId);
  if (!unit) {
    return NextResponse.json({ error: "单元不存在" }, { status: 404 });
  }

  if (practicedItems) {
    const seen = new Set<string>();
    for (const item of practicedItems) {
      if (seen.has(item.itemKey) || !unitHasCurriculumItem(unit, item.itemKey, item.itemType)) {
        return NextResponse.json({ error: "练习词条必须属于当前单元，且不能重复提交" }, { status: 400 });
      }
      seen.add(item.itemKey);
    }
  }

  const db = getDb();
  const activeProfile = resolveActiveProfile(db, request);
  if (!activeProfile) {
    return buildNoActiveProfileResponse();
  }
  const profileId = activeProfile.id;

  const now = new Date();
  const nowIso = now.toISOString();
  const today = todayDateKey(now);

  const defaultItems: Array<{ itemKey: string; itemType: CurriculumItemType; correct: boolean }> =
    practicedItems && practicedItems.length > 0
      ? practicedItems
      : step === "phonics"
      ? unit.phonics.map((p) => ({ itemKey: p.id, itemType: "phonics" as const, correct: true }))
      : unit.vocab.map((v) => ({ itemKey: v.id, itemType: "word" as const, correct: true }));

  const txResult = db.transaction(
    (tx) => {
      const profileRow = tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, profileId))
        .get();
      if (!profileRow) return null;

      const existingRow = tx
        .select()
        .from(unitProgress)
        .where(and(eq(unitProgress.profileId, profileId), eq(unitProgress.unitId, unitId)))
        .get();

      const wasDone =
        existingRow &&
        ((step === "story" && existingRow.storyDone === 1) ||
          (step === "phonics" && existingRow.phonicsDone === 1) ||
          (step === "game" && existingRow.gameDone === 1));

      if (wasDone && !practicedItems?.length) {
        return {
          unitProgress: existingRow,
          starsAwarded: 0,
          unlockedAccessory: null,
          profile: serializeProfile(profileRow),
        };
      }

      const nextStory = step === "story" ? 1 : existingRow?.storyDone ?? 0;
      const nextPhonics = step === "phonics" ? 1 : existingRow?.phonicsDone ?? 0;
      const nextGame = step === "game" ? 1 : existingRow?.gameDone ?? 0;
      const nextRoleplay = existingRow?.roleplayDone ?? 0;
      const nextStarsCount = nextStory + nextPhonics + nextGame + nextRoleplay;
      const nextBestGame =
        step === "game" && score !== undefined
          ? Math.max(existingRow?.bestGameScore ?? 0, score)
          : existingRow?.bestGameScore ?? 0;

      if (existingRow) {
        tx.update(unitProgress)
          .set({
            storyDone: nextStory,
            phonicsDone: nextPhonics,
            gameDone: nextGame,
            roleplayDone: nextRoleplay,
            starsEarned: nextStarsCount,
            bestGameScore: nextBestGame,
            updatedAt: nowIso,
          })
          .where(eq(unitProgress.id, existingRow.id))
          .run();
      } else {
        tx.insert(unitProgress)
          .values({
            profileId,
            unitId,
            storyDone: nextStory,
            phonicsDone: nextPhonics,
            gameDone: nextGame,
            roleplayDone: nextRoleplay,
            starsEarned: nextStarsCount,
            bestGameScore: nextBestGame,
            updatedAt: nowIso,
          })
          .run();
      }

      const updatedProgress = tx
        .select()
        .from(unitProgress)
        .where(and(eq(unitProgress.profileId, profileId), eq(unitProgress.unitId, unitId)))
        .get()!;

      const starsAwarded = wasDone ? 0 : 3;

      awardStarsAndMood(tx, {
        starsDelta: starsAwarded,
        moodDelta: wasDone ? 0 : 5,
        nowIso,
        profileId,
      });

      const unlockedAccessory = unlockUnitAccessoryIfCompleted(tx, {
        unitId,
        starsEarned: nextStarsCount,
        nowIso,
        profileId,
      });

      const freshProfile = tx
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.id, profileId))
        .get()!;

      for (const item of defaultItems) {
        upsertWordMasteryItem(tx, {
          itemKey: item.itemKey,
          itemType: item.itemType,
          unitId,
          correct: item.correct,
          now,
          profileId,
        });
      }

      addDailyLogStats(
        tx,
        today,
        {
          activitiesCompleted: 1,
          wordsPracticed: defaultItems.length,
          studySeconds: 45,
        },
        profileId
      );

      return {
        unitProgress: updatedProgress,
        starsAwarded,
        unlockedAccessory,
        profile: serializeProfile(freshProfile),
      };
    },
    { behavior: "immediate" }
  );

  if (!txResult) {
    return buildNoActiveProfileResponse();
  }

  return NextResponse.json(txResult);
}
