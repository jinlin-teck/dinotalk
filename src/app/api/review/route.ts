import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, todayDateKey } from "@/db";
import { childProfiles, dailyLogs, wordMastery } from "@/db/schema";
import { getAllPhonics, getAllVocab } from "@/data/curriculum";
import { calculateNextReview, isDueForReview, sortReviewQueue } from "@/lib/srs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface EnrichedReviewItem {
  itemKey: string;
  itemType: "word" | "phonics";
  unitId: string;
  unitTitleZh: string;
  displayText: string;
  subText: string;
  zh: string;
  visualKey: string;
  masteryLevel: number;
  distractors: Array<{ text: string; zh: string; visualKey: string }>;
}

export async function GET() {
  const db = getDb();
  const now = new Date();
  const allRows = db.select().from(wordMastery).where(eq(wordMastery.profileId, 1)).all();

  const vocabList = getAllVocab();
  const phonicsList = getAllPhonics();
  const vocabMap = new Map(vocabList.map((v) => [v.id, v]));
  const phonicsMap = new Map(phonicsList.map((p) => [p.id, p]));

  const dueRows = sortReviewQueue(allRows.filter((r) => isDueForReview(r.nextReviewAt, now)));
  const isWarmup = dueRows.length === 0;

  let selectedRows = dueRows.slice(0, 6);
  if (selectedRows.length === 0) {
    // If child already reviewed everything or is brand new, offer gentle warmup cards
    if (allRows.length > 0) {
      selectedRows = sortReviewQueue(allRows).slice(0, 6);
    } else {
      const warmupVocab = vocabList.slice(0, 5);
      const items: EnrichedReviewItem[] = warmupVocab.map((v) => {
        const others = vocabList.filter((o) => o.id !== v.id).slice(0, 2);
        return {
          itemKey: v.id,
          itemType: "word",
          unitId: v.unitId,
          unitTitleZh: v.unitTitleZh,
          displayText: v.word,
          subText: v.phonetic,
          zh: v.zh,
          visualKey: v.visualKey,
          masteryLevel: 0,
          distractors: others.map((o) => ({ text: o.word, zh: o.zh, visualKey: o.visualKey })),
        };
      });
      return NextResponse.json({
        items,
        isWarmup: true,
        dueCount: 0,
      });
    }
  }

  const enriched: EnrichedReviewItem[] = [];
  for (const row of selectedRows) {
    if (row.itemType === "word") {
      const v = vocabMap.get(row.itemKey);
      if (!v) continue;
      const pool = vocabList.filter((o) => o.id !== v.id);
      const step = Math.max(1, Math.floor(pool.length / 3));
      const d1 = pool[(enriched.length * 3) % pool.length];
      const d2 = pool[(enriched.length * 3 + step) % pool.length];
      enriched.push({
        itemKey: row.itemKey,
        itemType: "word",
        unitId: v.unitId,
        unitTitleZh: v.unitTitleZh,
        displayText: v.word,
        subText: v.phonetic,
        zh: v.zh,
        visualKey: v.visualKey,
        masteryLevel: row.masteryLevel,
        distractors: [d1, d2].filter(Boolean).map((o) => ({
          text: o.word,
          zh: o.zh,
          visualKey: o.visualKey,
        })),
      });
    } else {
      const p = phonicsMap.get(row.itemKey);
      if (!p) continue;
      const pool = phonicsList.filter((o) => o.id !== p.id);
      const d1 = pool[(enriched.length * 2) % pool.length];
      const d2 = pool[(enriched.length * 2 + 5) % pool.length];
      enriched.push({
        itemKey: row.itemKey,
        itemType: "phonics",
        unitId: p.unitId,
        unitTitleZh: p.unitTitleZh,
        displayText: p.letter,
        subText: p.soundLabel,
        zh: p.mnemonicZh.slice(0, 22),
        visualKey: p.sampleWords[0]?.visualKey || "star",
        masteryLevel: row.masteryLevel,
        distractors: [d1, d2].filter(Boolean).map((o) => ({
          text: o.letter,
          zh: o.soundLabel,
          visualKey: o.sampleWords[0]?.visualKey || "star",
        })),
      });
    }
  }

  return NextResponse.json({
    items: enriched,
    isWarmup,
    dueCount: dueRows.length,
  });
}

const SubmitReviewSchema = z.object({
  itemKey: z.string().min(1),
  itemType: z.enum(["word", "phonics"]),
  unitId: z.string().min(1),
  correct: z.boolean(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = SubmitReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "复习提交参数无效" }, { status: 400 });
  }

  const { itemKey, itemType, unitId, correct } = parsed.data;
  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();

  const existing = db
    .select()
    .from(wordMastery)
    .where(and(eq(wordMastery.profileId, 1), eq(wordMastery.itemKey, itemKey)))
    .get();

  const srs = calculateNextReview(existing?.masteryLevel ?? 0, correct, now);
  if (existing) {
    db.update(wordMastery)
      .set({
        masteryLevel: srs.masteryLevel,
        correctCount: existing.correctCount + (correct ? 1 : 0),
        wrongCount: existing.wrongCount + (correct ? 0 : 1),
        nextReviewAt: srs.nextReviewAt,
        lastPracticedAt: nowIso,
      })
      .where(eq(wordMastery.id, existing.id))
      .run();
  } else {
    db.insert(wordMastery)
      .values({
        profileId: 1,
        itemKey,
        itemType,
        unitId,
        masteryLevel: srs.masteryLevel,
        correctCount: correct ? 1 : 0,
        wrongCount: correct ? 0 : 1,
        nextReviewAt: srs.nextReviewAt,
        lastPracticedAt: nowIso,
      })
      .run();
  }

  const starsAwarded = correct ? 1 : 0;
  if (starsAwarded > 0) {
    const profile = db.select().from(childProfiles).where(eq(childProfiles.id, 1)).get()!;
    db.update(childProfiles)
      .set({
        totalStars: profile.totalStars + starsAwarded,
        updatedAt: nowIso,
      })
      .where(eq(childProfiles.id, 1))
      .run();
  }

  const today = todayDateKey(now);
  const log = db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.profileId, 1), eq(dailyLogs.dateKey, today)))
    .get();
  if (log) {
    db.update(dailyLogs)
      .set({
        wordsPracticed: log.wordsPracticed + 1,
        studySeconds: log.studySeconds + 15,
      })
      .where(eq(dailyLogs.id, log.id))
      .run();
  } else {
    db.insert(dailyLogs)
      .values({
        profileId: 1,
        dateKey: today,
        studySeconds: 15,
        activitiesCompleted: 0,
        wordsPracticed: 1,
      })
      .run();
  }

  return NextResponse.json({
    ok: true,
    masteryLevel: srs.masteryLevel,
    nextReviewAt: srs.nextReviewAt,
    starsAwarded,
  });
}
