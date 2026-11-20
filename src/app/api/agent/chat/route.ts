import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, todayDateKey } from "@/db";
import {
  appSettings,
  chatMessages,
  chatSessions,
  childProfiles,
  dailyLogs,
  unitProgress,
  wordMastery,
} from "@/db/schema";
import { getUnitById } from "@/data/curriculum";
import { runRoleplayTurn } from "@/lib/ai/tutor-agent";
import { calculateNextReview } from "@/lib/srs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ChatRequestSchema = z.object({
  unitId: z.string().min(1),
  sessionId: z.number().int().positive().optional(),
  userText: z.string().min(1).max(300),
  completedGoalIds: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "对话参数有误" }, { status: 400 });
  }

  const { unitId, userText } = parsed.data;
  const unit = getUnitById(unitId);
  if (!unit) {
    return NextResponse.json({ error: "找不到该单元情景" }, { status: 404 });
  }

  const db = getDb();
  const profile = db.select().from(childProfiles).where(eq(childProfiles.id, 1)).get()!;
  const settings = db.select().from(appSettings).where(eq(appSettings.id, 1)).get()!;
  const now = new Date();
  const nowIso = now.toISOString();

  let sessionId = parsed.data.sessionId;
  let completedGoals: string[] = parsed.data.completedGoalIds ?? [];

  if (sessionId) {
    const existingSession = db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .get();
    if (existingSession) {
      try {
        const stored = JSON.parse(existingSession.completedGoalsJson);
        if (Array.isArray(stored)) {
          completedGoals = Array.from(new Set([...completedGoals, ...stored]));
        }
      } catch {
        // ignore parse errors
      }
    } else {
      sessionId = undefined;
    }
  }

  if (!sessionId) {
    const insertRes = db
      .insert(chatSessions)
      .values({
        profileId: 1,
        unitId,
        mode: "roleplay",
        completedGoalsJson: JSON.stringify(completedGoals),
        summaryZh: `${unit.titleZh}情景练习`,
        starsEarned: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();
    sessionId = Number(insertRes.lastInsertRowid);

    // Seed opening assistant turn for report history clarity
    db.insert(chatMessages)
      .values({
        sessionId,
        role: "assistant",
        englishText: unit.roleplay.openingEn,
        chineseText: unit.roleplay.openingZh,
        emotion: "happy",
        suggestionsJson: JSON.stringify(unit.roleplay.openingSuggestions),
        createdAt: nowIso,
      })
      .run();
  }

  const historyRows = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.id))
    .all();

  const agentResult = await runRoleplayTurn({
    config: {
      provider: settings.llmProvider,
      baseUrl: settings.llmBaseUrl,
      apiKey: settings.llmApiKey,
      model: settings.llmModel,
      temperature: settings.llmTemperature,
    },
    unit,
    childNickname: profile.nickname,
    companionName: profile.companionName,
    history: historyRows.map((r) => ({
      role: r.role === "user" ? "user" : "assistant",
      englishText: r.englishText,
    })),
    userText,
    completedGoalIds: completedGoals,
  });

  const resp = agentResult.response;

  // Save user & assistant messages
  db.insert(chatMessages)
    .values({
      sessionId,
      role: "user",
      englishText: userText.trim(),
      chineseText: "",
      emotion: "happy",
      suggestionsJson: "[]",
      createdAt: nowIso,
    })
    .run();

  db.insert(chatMessages)
    .values({
      sessionId,
      role: "assistant",
      englishText: resp.englishReply,
      chineseText: resp.chineseHint,
      emotion: resp.emotion,
      suggestionsJson: JSON.stringify(resp.nextSuggestions),
      createdAt: nowIso,
    })
    .run();

  // Update word mastery for words mastered in conversation
  for (const w of resp.masteredWords) {
    const card = unit.vocab.find((v) => v.word.toLowerCase() === w.toLowerCase());
    if (!card) continue;
    const existing = db
      .select()
      .from(wordMastery)
      .where(and(eq(wordMastery.profileId, 1), eq(wordMastery.itemKey, card.id)))
      .get();
    const srs = calculateNextReview(existing?.masteryLevel ?? 0, true, now);
    if (existing) {
      db.update(wordMastery)
        .set({
          masteryLevel: srs.masteryLevel,
          correctCount: existing.correctCount + 1,
          nextReviewAt: srs.nextReviewAt,
          lastPracticedAt: nowIso,
        })
        .where(eq(wordMastery.id, existing.id))
        .run();
    } else {
      db.insert(wordMastery)
        .values({
          profileId: 1,
          itemKey: card.id,
          itemType: "word",
          unitId,
          masteryLevel: srs.masteryLevel,
          correctCount: 1,
          wrongCount: 0,
          nextReviewAt: srs.nextReviewAt,
          lastPracticedAt: nowIso,
        })
        .run();
    }
  }

  let starsAwarded = 0;
  if (resp.isSceneComplete) {
    const prog = db
      .select()
      .from(unitProgress)
      .where(and(eq(unitProgress.profileId, 1), eq(unitProgress.unitId, unitId)))
      .get();
    const alreadyRoleplayDone = prog?.roleplayDone === 1;
    starsAwarded = alreadyRoleplayDone ? 1 : 4;

    if (prog) {
      const nextStarsCount =
        prog.storyDone + prog.phonicsDone + prog.gameDone + 1;
      db.update(unitProgress)
        .set({
          roleplayDone: 1,
          starsEarned: nextStarsCount,
          updatedAt: nowIso,
        })
        .where(eq(unitProgress.id, prog.id))
        .run();
    } else {
      db.insert(unitProgress)
        .values({
          profileId: 1,
          unitId,
          storyDone: 0,
          phonicsDone: 0,
          gameDone: 0,
          roleplayDone: 1,
          starsEarned: 1,
          bestGameScore: 0,
          updatedAt: nowIso,
        })
        .run();
    }

    db.update(childProfiles)
      .set({
        totalStars: profile.totalStars + starsAwarded,
        petMood: Math.min(100, profile.petMood + 8),
        updatedAt: nowIso,
      })
      .where(eq(childProfiles.id, 1))
      .run();
  }

  db.update(chatSessions)
    .set({
      completedGoalsJson: JSON.stringify(resp.completedGoalIds),
      summaryZh: `${unit.titleZh} · 已达成 ${resp.completedGoalIds.length}/${unit.roleplay.goals.length} 个小目标`,
      starsEarned: starsAwarded > 0 ? starsAwarded : undefined,
      updatedAt: nowIso,
    })
    .where(eq(chatSessions.id, sessionId))
    .run();

  const today = todayDateKey(now);
  const log = db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.profileId, 1), eq(dailyLogs.dateKey, today)))
    .get();
  if (log) {
    db.update(dailyLogs)
      .set({
        studySeconds: log.studySeconds + 20,
        wordsPracticed: log.wordsPracticed + Math.max(1, resp.masteredWords.length),
        activitiesCompleted: log.activitiesCompleted + (resp.isSceneComplete ? 1 : 0),
      })
      .where(eq(dailyLogs.id, log.id))
      .run();
  } else {
    db.insert(dailyLogs)
      .values({
        profileId: 1,
        dateKey: today,
        studySeconds: 20,
        activitiesCompleted: resp.isSceneComplete ? 1 : 0,
        wordsPracticed: Math.max(1, resp.masteredWords.length),
      })
      .run();
  }

  return NextResponse.json({
    sessionId,
    response: resp,
    usedFallback: agentResult.usedFallback,
    fallbackReason: agentResult.fallbackReason,
    starsAwarded,
  });
}
