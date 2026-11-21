import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, todayDateKey } from "@/db";
import { unitProgress, wordMastery } from "@/db/schema";
import { getUnitById } from "@/data/curriculum";
import { assertJsonSameOrigin } from "@/lib/security/endpoint-guard";
import {
  addDailyLogStats,
  awardStarsAndMood,
  DEFAULT_PROFILE_ID,
  isValidCurriculumItemKey,
  serializeProfile,
  upsertWordMasteryItem,
} from "@/lib/services/learning-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const progress = db
    .select()
    .from(unitProgress)
    .where(eq(unitProgress.profileId, DEFAULT_PROFILE_ID))
    .all();
  const mastery = db
    .select()
    .from(wordMastery)
    .where(eq(wordMastery.profileId, DEFAULT_PROFILE_ID))
    .all();

  return NextResponse.json({
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
        itemType: z.enum(["word", "phonics"]),
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
    for (const item of practicedItems) {
      if (!isValidCurriculumItemKey(item.itemKey, item.itemType)) {
        return NextResponse.json({ error: "存在无效的词库或拼读项" }, { status: 400 });
      }
    }
  }

  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const today = todayDateKey(now);

  const defaultItems: Array<{ itemKey: string; itemType: "word" | "phonics"; correct: boolean }> =
    practicedItems && practicedItems.length > 0
      ? practicedItems
      : step === "phonics"
      ? unit.phonics.map((p) => ({ itemKey: p.id, itemType: "phonics" as const, correct: true }))
      : unit.vocab.map((v) => ({ itemKey: v.id, itemType: "word" as const, correct: true }));

  const txResult = db.transaction((tx) => {
    const existingRow = tx
      .select()
      .from(unitProgress)
      .where(
        and(eq(unitProgress.profileId, DEFAULT_PROFILE_ID), eq(unitProgress.unitId, unitId))
      )
      .get();

    const wasDone =
      existingRow &&
      ((step === "story" && existingRow.storyDone === 1) ||
        (step === "phonics" && existingRow.phonicsDone === 1) ||
        (step === "game" && existingRow.gameDone === 1));

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
          profileId: DEFAULT_PROFILE_ID,
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
      .where(
        and(eq(unitProgress.profileId, DEFAULT_PROFILE_ID), eq(unitProgress.unitId, unitId))
      )
      .get()!;

    const starsAwarded = wasDone ? 1 : 3;

    const freshProfile = awardStarsAndMood(tx, {
      starsDelta: starsAwarded,
      moodDelta: 5,
      nowIso,
    })!;

    for (const item of defaultItems) {
      upsertWordMasteryItem(tx, {
        itemKey: item.itemKey,
        itemType: item.itemType,
        unitId,
        correct: item.correct,
        now,
      });
    }

    addDailyLogStats(tx, today, {
      activitiesCompleted: 1,
      wordsPracticed: defaultItems.length,
      studySeconds: 45,
    });

    return {
      unitProgress: updatedProgress,
      starsAwarded,
      profile: serializeProfile(freshProfile),
    };
  });

  return NextResponse.json(txResult);
}
