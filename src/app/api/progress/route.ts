import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, todayDateKey } from "@/db";
import { childProfiles, dailyLogs, unitProgress, wordMastery } from "@/db/schema";
import { getUnitById } from "@/data/curriculum";
import { calculateNextReview } from "@/lib/srs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const progress = db.select().from(unitProgress).where(eq(unitProgress.profileId, 1)).all();
  const mastery = db.select().from(wordMastery).where(eq(wordMastery.profileId, 1)).all();

  return NextResponse.json({
    unitProgress: progress,
    wordMastery: mastery,
  });
}

const CompleteStepSchema = z.object({
  unitId: z.string().min(1),
  step: z.enum(["story", "phonics", "game", "roleplay"]),
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

  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();

  let row = db
    .select()
    .from(unitProgress)
    .where(and(eq(unitProgress.profileId, 1), eq(unitProgress.unitId, unitId)))
    .get();

  const wasDone =
    row &&
    ((step === "story" && row.storyDone === 1) ||
      (step === "phonics" && row.phonicsDone === 1) ||
      (step === "game" && row.gameDone === 1) ||
      (step === "roleplay" && row.roleplayDone === 1));

  const nextStory = step === "story" ? 1 : row?.storyDone ?? 0;
  const nextPhonics = step === "phonics" ? 1 : row?.phonicsDone ?? 0;
  const nextGame = step === "game" ? 1 : row?.gameDone ?? 0;
  const nextRoleplay = step === "roleplay" ? 1 : row?.roleplayDone ?? 0;
  const nextStarsCount = nextStory + nextPhonics + nextGame + nextRoleplay;
  const nextBestGame =
    step === "game" && score !== undefined
      ? Math.max(row?.bestGameScore ?? 0, score)
      : row?.bestGameScore ?? 0;

  if (row) {
    db.update(unitProgress)
      .set({
        storyDone: nextStory,
        phonicsDone: nextPhonics,
        gameDone: nextGame,
        roleplayDone: nextRoleplay,
        starsEarned: nextStarsCount,
        bestGameScore: nextBestGame,
        updatedAt: nowIso,
      })
      .where(eq(unitProgress.id, row.id))
      .run();
  } else {
    db.insert(unitProgress)
      .values({
        profileId: 1,
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

  row = db
    .select()
    .from(unitProgress)
    .where(and(eq(unitProgress.profileId, 1), eq(unitProgress.unitId, unitId)))
    .get()!;

  // Award stars: first time completing step yields +3 (roleplay +4), repeat practice yields +1
  const starsAwarded = wasDone ? 1 : step === "roleplay" ? 4 : 3;

  const profile = db.select().from(childProfiles).where(eq(childProfiles.id, 1)).get()!;
  const nextTotalStars = profile.totalStars + starsAwarded;
  const nextLevel = Math.max(profile.level, 1 + Math.floor(nextTotalStars / 20));
  db.update(childProfiles)
    .set({
      totalStars: nextTotalStars,
      level: nextLevel,
      petMood: Math.min(100, profile.petMood + 5),
      updatedAt: nowIso,
    })
    .where(eq(childProfiles.id, 1))
    .run();

  // Upsert SRS items
  const defaultItems: Array<{ itemKey: string; itemType: "word" | "phonics"; correct: boolean }> =
    practicedItems && practicedItems.length > 0
      ? practicedItems
      : step === "phonics"
      ? unit.phonics.map((p) => ({ itemKey: p.id, itemType: "phonics" as const, correct: true }))
      : unit.vocab.map((v) => ({ itemKey: v.id, itemType: "word" as const, correct: true }));

  for (const item of defaultItems) {
    const existing = db
      .select()
      .from(wordMastery)
      .where(and(eq(wordMastery.profileId, 1), eq(wordMastery.itemKey, item.itemKey)))
      .get();

    const srs = calculateNextReview(existing?.masteryLevel ?? 0, item.correct, now);
    if (existing) {
      db.update(wordMastery)
        .set({
          masteryLevel: srs.masteryLevel,
          correctCount: existing.correctCount + (item.correct ? 1 : 0),
          wrongCount: existing.wrongCount + (item.correct ? 0 : 1),
          nextReviewAt: srs.nextReviewAt,
          lastPracticedAt: nowIso,
        })
        .where(eq(wordMastery.id, existing.id))
        .run();
    } else {
      db.insert(wordMastery)
        .values({
          profileId: 1,
          itemKey: item.itemKey,
          itemType: item.itemType,
          unitId,
          masteryLevel: srs.masteryLevel,
          correctCount: item.correct ? 1 : 0,
          wrongCount: item.correct ? 0 : 1,
          nextReviewAt: srs.nextReviewAt,
          lastPracticedAt: nowIso,
        })
        .run();
    }
  }

  // Update today's daily log
  const today = todayDateKey(now);
  const log = db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.profileId, 1), eq(dailyLogs.dateKey, today)))
    .get();
  if (log) {
    db.update(dailyLogs)
      .set({
        activitiesCompleted: log.activitiesCompleted + 1,
        wordsPracticed: log.wordsPracticed + defaultItems.length,
        studySeconds: log.studySeconds + 45,
      })
      .where(eq(dailyLogs.id, log.id))
      .run();
  } else {
    db.insert(dailyLogs)
      .values({
        profileId: 1,
        dateKey: today,
        studySeconds: 45,
        activitiesCompleted: 1,
        wordsPracticed: defaultItems.length,
      })
      .run();
  }

  const freshProfile = db.select().from(childProfiles).where(eq(childProfiles.id, 1)).get()!;
  return NextResponse.json({
    unitProgress: row,
    starsAwarded,
    profile: freshProfile,
  });
}
