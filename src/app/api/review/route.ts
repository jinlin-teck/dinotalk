import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, todayDateKey } from "@/db";
import { wordMastery } from "@/db/schema";
import { getAllPhonics, getAllVocab } from "@/data/curriculum";
import { isDueForReview, sortReviewQueue } from "@/lib/srs";
import { assertJsonSameOrigin } from "@/lib/security/endpoint-guard";
import {
  addDailyLogStats,
  awardStarsAndMood,
  DEFAULT_PROFILE_ID,
  isValidCurriculumItemKey,
  upsertWordMasteryItem,
} from "@/lib/services/learning-service";
import type { EnrichedReviewItem } from "@/types/api";

export type { EnrichedReviewItem };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickTwoDistinct<T>(pool: T[]): T[] {
  if (pool.length <= 2) return pool.slice();
  const picked = new Set<number>();
  while (picked.size < 2) {
    picked.add(Math.floor(Math.random() * pool.length));
  }
  return Array.from(picked, (index) => pool[index]);
}

export async function GET() {
  const db = getDb();
  const now = new Date();
  const allRows = db
    .select()
    .from(wordMastery)
    .where(eq(wordMastery.profileId, DEFAULT_PROFILE_ID))
    .all();

  const vocabList = getAllVocab();
  const phonicsList = getAllPhonics();
  const vocabMap = new Map(vocabList.map((v) => [v.id, v]));
  const phonicsMap = new Map(phonicsList.map((p) => [p.id, p]));

  const dueRows = sortReviewQueue(allRows.filter((r) => isDueForReview(r.nextReviewAt, now)));
  const isWarmup = dueRows.length === 0;

  let selectedRows = dueRows.slice(0, 6);
  if (selectedRows.length === 0) {
    if (allRows.length > 0) {
      selectedRows = sortReviewQueue(allRows).slice(0, 6);
    } else {
      const warmupVocab = vocabList.slice(0, 5);
      const items: EnrichedReviewItem[] = warmupVocab.map((v) => {
        const pool = vocabList.filter(
          (o) => o.id !== v.id && o.word.toLowerCase() !== v.word.toLowerCase()
        );
        const distractors = pickTwoDistinct(pool);
        return {
          itemKey: v.id,
          itemType: "word",
          unitId: v.unitId,
          unitTitleZh: v.unitTitleZh,
          displayText: v.word,
          audioText: v.word,
          subText: v.phonetic,
          zh: v.zh,
          visualKey: v.visualKey,
          masteryLevel: 0,
          distractors: distractors.map((o) => ({
            text: o.word,
            zh: o.zh,
            visualKey: o.visualKey,
          })),
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
      const pool = vocabList.filter(
        (o) => o.id !== v.id && o.word.toLowerCase() !== v.word.toLowerCase()
      );
      const distractors = pickTwoDistinct(pool);
      enriched.push({
        itemKey: row.itemKey,
        itemType: "word",
        unitId: v.unitId,
        unitTitleZh: v.unitTitleZh,
        displayText: v.word,
        audioText: v.word,
        subText: v.phonetic,
        zh: v.zh,
        visualKey: v.visualKey,
        masteryLevel: row.masteryLevel,
        distractors: distractors.map((o) => ({
          text: o.word,
          zh: o.zh,
          visualKey: o.visualKey,
        })),
      });
    } else {
      const p = phonicsMap.get(row.itemKey);
      if (!p) continue;
      const sample = p.sampleWords[0];
      const pool = phonicsList.filter(
        (o) => o.id !== p.id && o.letter.toLowerCase() !== p.letter.toLowerCase()
      );
      const distractors = pickTwoDistinct(pool);
      enriched.push({
        itemKey: row.itemKey,
        itemType: "phonics",
        unitId: p.unitId,
        unitTitleZh: p.unitTitleZh,
        displayText: p.letter,
        audioText: sample?.word ?? p.letter,
        subText: p.soundLabel,
        zh: `${p.soundLabel} · ${sample?.zh ?? p.letter}`,
        visualKey: sample?.visualKey || "star",
        masteryLevel: row.masteryLevel,
        distractors: distractors.map((o) => {
          const oSample = o.sampleWords[0];
          return {
            text: o.letter,
            zh: `${o.soundLabel} · ${oSample?.zh ?? o.letter}`,
            visualKey: oSample?.visualKey || "star",
          };
        }),
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
  const originError = assertJsonSameOrigin(request);
  if (originError) return originError;

  const body = await request.json().catch(() => null);
  const parsed = SubmitReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "复习提交参数无效" }, { status: 400 });
  }

  const { itemKey, itemType, unitId, correct } = parsed.data;
  if (!isValidCurriculumItemKey(itemKey, itemType)) {
    return NextResponse.json({ error: "复习词条不存在于课程中" }, { status: 400 });
  }

  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const today = todayDateKey(now);

  const existingRow = db
    .select({ nextReviewAt: wordMastery.nextReviewAt })
    .from(wordMastery)
    .where(
      and(
        eq(wordMastery.profileId, DEFAULT_PROFILE_ID),
        eq(wordMastery.itemKey, itemKey)
      )
    )
    .get();

  // 只有真正到期（或首次接触）的复习才奖励星星，避免重复提交刷星。
  const starsAwarded = correct && isDueForReview(existingRow?.nextReviewAt, now) ? 1 : 0;

  const srs = db.transaction((tx) => {
    const nextSrs = upsertWordMasteryItem(tx, {
      itemKey,
      itemType,
      unitId,
      correct,
      now,
    });

    if (starsAwarded > 0) {
      awardStarsAndMood(tx, {
        starsDelta: starsAwarded,
        nowIso,
      });
    }

    addDailyLogStats(tx, today, {
      wordsPracticed: 1,
      studySeconds: 15,
    });

    return nextSrs;
  });

  return NextResponse.json({
    ok: true,
    masteryLevel: srs.masteryLevel,
    nextReviewAt: srs.nextReviewAt,
    starsAwarded,
  });
}
