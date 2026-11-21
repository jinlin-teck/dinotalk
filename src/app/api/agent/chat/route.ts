import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, todayDateKey } from "@/db";
import {
  appSettings,
  chatMessages,
  chatSessions,
  childProfiles,
  unitProgress,
} from "@/db/schema";
import { getUnitById } from "@/data/curriculum";
import { runRoleplayTurn } from "@/lib/ai/tutor-agent";
import { assertJsonSameOrigin } from "@/lib/security/endpoint-guard";
import { resolveActiveSttMode } from "@/lib/speech/constants";
import { consumeVoiceProof } from "@/lib/speech/voice-proof";
import {
  addDailyLogStats,
  awardStarsAndMood,
  DEFAULT_PROFILE_ID,
  parseJsonStringArray,
  unlockUnitAccessoryIfCompleted,
  upsertWordMasteryItem,
} from "@/lib/services/learning-service";
import type { UnlockedAccessoryNotice } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ChatRequestSchema = z.object({
  unitId: z.string().min(1),
  sessionId: z.number().int().positive().optional(),
  userText: z.string().min(1).max(300),
  usedVoice: z.boolean().optional(),
  voiceProof: z.string().min(1).max(128).optional(),
});

export async function POST(request: Request) {
  const originError = assertJsonSameOrigin(request);
  if (originError) return originError;

  const body = await request.json().catch(() => null);
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "对话参数有误" }, { status: 400 });
  }

  const { unitId, userText, usedVoice, voiceProof } = parsed.data;
  const unit = getUnitById(unitId);
  if (!unit) {
    return NextResponse.json({ error: "找不到该单元情景" }, { status: 404 });
  }

  const db = getDb();
  const profile = db
    .select()
    .from(childProfiles)
    .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
    .get()!;
  const settings = db.select().from(appSettings).where(eq(appSettings.id, 1)).get()!;
  const activeSttMode = resolveActiveSttMode({
    sttEngine: settings.sttEngine,
    sttApiBaseUrl: settings.sttApiBaseUrl,
    hasSttApiKey: Boolean(settings.sttApiKey.trim()),
  });
  const cloudProof = usedVoice && activeSttMode !== "browser" ? voiceProof : undefined;

  const validGoalIds = new Set(unit.roleplay.goals.map((g) => g.id));
  let sessionId = parsed.data.sessionId;
  let initialCompletedGoals: string[] = [];
  let historyRows: Array<{ role: "assistant" | "user"; englishText: string }> = [];

  if (sessionId) {
    const existingSession = db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .get();
    if (existingSession) {
      if (existingSession.profileId !== DEFAULT_PROFILE_ID || existingSession.unitId !== unitId || existingSession.mode !== "roleplay") {
        return NextResponse.json({ error: "对话会话与当前关卡不匹配" }, { status: 400 });
      }
      initialCompletedGoals = parseJsonStringArray(existingSession.completedGoalsJson).filter(
        (id) => validGoalIds.has(id)
      );
      const rows = db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(asc(chatMessages.id))
        .all();
      historyRows = rows.map((r) => ({
        role: r.role === "user" ? "user" : "assistant",
        englishText: r.englishText,
      }));
    } else {
      sessionId = undefined;
    }
  } else {
    historyRows = [{ role: "assistant", englishText: unit.roleplay.openingEn }];
  }

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
    history: historyRows,
    userText,
    completedGoalIds: initialCompletedGoals,
  });

  const resp = agentResult.response;
  const now = new Date();
  const nowIso = now.toISOString();
  const today = todayDateKey(now);

  const txResult = db.transaction((tx) => {
    let activeSessionId = sessionId;
    let existingSession = activeSessionId
      ? tx.select().from(chatSessions).where(eq(chatSessions.id, activeSessionId)).get()
      : undefined;

    if (!existingSession) {
      const insertRes = tx
        .insert(chatSessions)
        .values({
          profileId: DEFAULT_PROFILE_ID,
          unitId,
          mode: "roleplay",
          completedGoalsJson: "[]",
          summaryZh: `${unit.titleZh}情景练习`,
          starsEarned: 0,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .run();
      activeSessionId = Number(insertRes.lastInsertRowid);

      // Seed opening assistant turn for report history clarity
      tx.insert(chatMessages)
        .values({
          sessionId: activeSessionId,
          role: "assistant",
          englishText: unit.roleplay.openingEn,
          chineseText: unit.roleplay.openingZh,
          emotion: "happy",
          suggestionsJson: JSON.stringify(unit.roleplay.openingSuggestions),
          createdAt: nowIso,
        })
        .run();

      existingSession = tx
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, activeSessionId))
        .get()!;
    }

    // Verify cloud speech against this turn. Browser Web Speech is trusted for local encouragement.
    const verifiedCloudTurn = consumeVoiceProof(tx, cloudProof, DEFAULT_PROFILE_ID, {
      purpose: "roleplay",
      transcript: userText,
    });
    const hasVoiceTurn =
      existingSession.hasVoiceTurn ||
      verifiedCloudTurn ||
      (activeSttMode === "browser" && usedVoice === true);

    const storedGoals = parseJsonStringArray(existingSession.completedGoalsJson).filter((id) =>
      validGoalIds.has(id)
    );
    const mergedGoalSet = new Set([...storedGoals, ...resp.completedGoalIds]);
    const finalCompletedGoals = unit.roleplay.goals
      .filter((g) => mergedGoalSet.has(g.id))
      .map((g) => g.id);
    const authoritativeComplete =
      finalCompletedGoals.length >= unit.roleplay.goals.length;

    tx.insert(chatMessages)
      .values({
        sessionId: activeSessionId!,
        role: "user",
        englishText: userText.trim(),
        chineseText: "",
        emotion: "happy",
        suggestionsJson: "[]",
        createdAt: nowIso,
      })
      .run();

    tx.insert(chatMessages)
      .values({
        sessionId: activeSessionId!,
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
      upsertWordMasteryItem(tx, {
        itemKey: card.id,
        itemType: "word",
        unitId,
        correct: true,
        now,
      });
    }

    let starsAwarded = 0;
    let voiceBonusStars = 0;
    let unlockedAccessory: UnlockedAccessoryNotice | null = null;
    const alreadyRewardedInSession = existingSession.starsEarned > 0;

    if (authoritativeComplete && !alreadyRewardedInSession) {
      const prog = tx
        .select()
        .from(unitProgress)
        .where(
          and(eq(unitProgress.profileId, DEFAULT_PROFILE_ID), eq(unitProgress.unitId, unitId))
        )
        .get();
      const alreadyRoleplayDone = prog?.roleplayDone === 1;
      const baseStars = alreadyRoleplayDone ? 1 : 4;
      voiceBonusStars = !alreadyRoleplayDone && hasVoiceTurn ? 1 : 0;
      starsAwarded = baseStars + voiceBonusStars;

      const nextStarsCount = prog
        ? prog.storyDone + prog.phonicsDone + prog.gameDone + 1
        : 1;

      if (prog) {
        tx.update(unitProgress)
          .set({
            roleplayDone: 1,
            starsEarned: nextStarsCount,
            updatedAt: nowIso,
          })
          .where(eq(unitProgress.id, prog.id))
          .run();
      } else {
        tx.insert(unitProgress)
          .values({
            profileId: DEFAULT_PROFILE_ID,
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

      awardStarsAndMood(tx, {
        starsDelta: starsAwarded,
        moodDelta: 8,
        nowIso,
      });

      unlockedAccessory = unlockUnitAccessoryIfCompleted(tx, {
        unitId,
        starsEarned: nextStarsCount,
        nowIso,
      });
    }

    tx.update(chatSessions)
      .set({
        completedGoalsJson: JSON.stringify(finalCompletedGoals),
        summaryZh: `${unit.titleZh} · 已达成 ${finalCompletedGoals.length}/${unit.roleplay.goals.length} 个小目标`,
        starsEarned:
          starsAwarded > 0 ? existingSession.starsEarned + starsAwarded : existingSession.starsEarned,
        hasVoiceTurn,
        updatedAt: nowIso,
      })
      .where(eq(chatSessions.id, activeSessionId!))
      .run();

    addDailyLogStats(tx, today, {
      studySeconds: 20,
      wordsPracticed: Math.max(1, resp.masteredWords.length),
      activitiesCompleted: starsAwarded > 0 ? 1 : 0,
    });

    return {
      sessionId: activeSessionId!,
      starsAwarded,
      voiceBonusStars,
      unlockedAccessory,
      finalCompletedGoals,
      authoritativeComplete,
    };
  }, { behavior: "immediate" });

  const normalizedResp = {
    ...resp,
    completedGoalIds: txResult.finalCompletedGoals,
    isSceneComplete: txResult.authoritativeComplete,
  };

  return NextResponse.json({
    sessionId: txResult.sessionId,
    response: normalizedResp,
    usedFallback: agentResult.usedFallback,
    fallbackReason: agentResult.fallbackReason,
    starsAwarded: txResult.starsAwarded,
    voiceBonusStars: txResult.voiceBonusStars,
    unlockedAccessory: txResult.unlockedAccessory,
  });
}
