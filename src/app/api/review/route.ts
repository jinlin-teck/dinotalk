import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, todayDateKey } from "@/db";
import { childProfiles, wordMastery } from "@/db/schema";
import { getAllPhonics, getAllSentences, getAllVocab, getUnitById } from "@/data/curriculum";
import { isDueForReview, sortReviewQueue } from "@/lib/srs";
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
  unitHasCurriculumItem,
  upsertWordMasteryItem,
} from "@/lib/services/learning-service";
import type {
  CurriculumItemType,
  EnrichedReviewItem,
  ReviewQuestionMode,
} from "@/types/api";

export type { EnrichedReviewItem };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveQuestionMode(
  itemType: CurriculumItemType,
  masteryLevel: number
): ReviewQuestionMode {
  if (itemType === "phonics") {
    return masteryLevel >= 3 ? "blind_listen" : "listen_read";
  }
  if (masteryLevel >= 4) return "speak_card";
  if (masteryLevel >= 2) return "blind_listen";
  return "listen_read";
}

function pickTwoDistinct<T>(pool: T[]): T[] {
  if (pool.length <= 2) return pool.slice();
  const picked = new Set<number>();
  while (picked.size < 2) {
    picked.add(Math.floor(Math.random() * pool.length));
  }
  return Array.from(picked, (index) => pool[index]);
}

export async function GET(request: Request) {
  const db = getDb();
  const activeProfile = resolveActiveProfile(db, request);
  if (!activeProfile) {
    const res = NextResponse.json({
      needsProfile: true,
      items: [],
      isWarmup: true,
      dueCount: 0,
    });
    if (extractProfileIdFromRequest(request) !== null) {
      clearActiveProfileCookie(res, request);
    }
    return res;
  }

  const now = new Date();
  const allRows = db
    .select()
    .from(wordMastery)
    .where(eq(wordMastery.profileId, activeProfile.id))
    .all();

  const vocabList = getAllVocab();
  const phonicsList = getAllPhonics();
  const sentenceList = getAllSentences();
  const vocabMap = new Map(vocabList.map((v) => [v.id, v]));
  const phonicsMap = new Map(phonicsList.map((p) => [p.id, p]));
  const sentenceMap = new Map(sentenceList.map((s) => [s.id, s]));

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
          questionMode: "listen_read",
          distractors: distractors.map((o) => ({
            text: o.word,
            zh: o.zh,
            visualKey: o.visualKey,
          })),
        };
      });
      return NextResponse.json({
        needsProfile: false,
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
        questionMode: resolveQuestionMode("word", row.masteryLevel),
        distractors: distractors.map((o) => ({
          text: o.word,
          zh: o.zh,
          visualKey: o.visualKey,
        })),
      });
    } else if (row.itemType === "sentence") {
      const s = sentenceMap.get(row.itemKey);
      if (!s) continue;
      const pool = sentenceList.filter(
        (o) => o.id !== s.id && o.en.toLowerCase() !== s.en.toLowerCase()
      );
      const distractors = pickTwoDistinct(pool);
      enriched.push({
        itemKey: row.itemKey,
        itemType: "sentence",
        unitId: s.unitId,
        unitTitleZh: s.unitTitleZh,
        displayText: s.en,
        audioText: s.en,
        subText: "核心句型",
        zh: s.zh,
        visualKey: s.visualKey,
        masteryLevel: row.masteryLevel,
        questionMode: resolveQuestionMode("sentence", row.masteryLevel),
        distractors: distractors.map((o) => ({
          text: o.en,
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
        displayText: p.lowercase ? `${p.letter} ${p.lowercase}` : p.letter,
        audioText: sample?.word ?? p.letter,
        subText: p.soundLabel,
        zh: `${p.soundLabel} · ${sample?.zh ?? p.letter}`,
        visualKey: sample?.visualKey || "star",
        masteryLevel: row.masteryLevel,
        questionMode: resolveQuestionMode("phonics", row.masteryLevel),
        distractors: distractors.map((o) => {
          const oSample = o.sampleWords[0];
          return {
            text: o.lowercase ? `${o.letter} ${o.lowercase}` : o.letter,
            zh: `${o.soundLabel} · ${oSample?.zh ?? o.letter}`,
            visualKey: oSample?.visualKey || "star",
          };
        }),
      });
    }
  }

  return NextResponse.json({
    needsProfile: false,
    items: enriched,
    isWarmup,
    dueCount: dueRows.length,
  });
}

const SubmitReviewSchema = z.object({
  itemKey: z.string().min(1),
  itemType: z.enum(["word", "phonics", "sentence"]),
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
  const unit = getUnitById(unitId);
  if (!unit || !unitHasCurriculumItem(unit, itemKey, itemType)) {
    return NextResponse.json({ error: "复习词条不存在于课程中" }, { status: 400 });
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

  const outcome = db.transaction(
    (tx) => {
      const profileRow = tx
        .select({ id: childProfiles.id })
        .from(childProfiles)
        .where(eq(childProfiles.id, profileId))
        .get();
      if (!profileRow) return null;

      const existingRow = tx
        .select({
          nextReviewAt: wordMastery.nextReviewAt,
          masteryLevel: wordMastery.masteryLevel,
          reviewMissPending: wordMastery.reviewMissPending,
        })
        .from(wordMastery)
        .where(and(eq(wordMastery.profileId, profileId), eq(wordMastery.itemKey, itemKey)))
        .get();
      const isDue = isDueForReview(existingRow?.nextReviewAt, now);
      if (!correct && existingRow && (!isDue || existingRow.reviewMissPending)) {
        return { ...existingRow, starsAwarded: 0 };
      }

      const starsAwarded = correct && isDue ? 1 : 0;
      const nextSrs = upsertWordMasteryItem(tx, {
        itemKey,
        itemType,
        unitId,
        correct,
        now,
        profileId,
        reviewMissPending: !correct,
      });

      if (starsAwarded > 0) {
        awardStarsAndMood(tx, {
          starsDelta: starsAwarded,
          nowIso,
          profileId,
        });
      }

      addDailyLogStats(
        tx,
        today,
        {
          wordsPracticed: 1,
          studySeconds: 15,
        },
        profileId
      );

      return { ...nextSrs, starsAwarded };
    },
    { behavior: "immediate" }
  );

  if (!outcome) {
    return buildNoActiveProfileResponse();
  }

  return NextResponse.json({
    ok: true,
    masteryLevel: outcome.masteryLevel,
    nextReviewAt: outcome.nextReviewAt,
    starsAwarded: outcome.starsAwarded,
  });
}
