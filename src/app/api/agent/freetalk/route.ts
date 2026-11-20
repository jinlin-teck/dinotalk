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
} from "@/db/schema";
import { runFreeTalkTurn } from "@/lib/ai/tutor-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FreeTalkSchema = z.object({
  sessionId: z.number().int().positive().optional(),
  topicId: z.string().optional(),
  userText: z.string().min(1).max(300),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = FreeTalkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "聊天参数无效" }, { status: 400 });
  }

  const db = getDb();
  const profile = db.select().from(childProfiles).where(eq(childProfiles.id, 1)).get()!;
  const settings = db.select().from(appSettings).where(eq(appSettings.id, 1)).get()!;
  const now = new Date();
  const nowIso = now.toISOString();

  let sessionId = parsed.data.sessionId;
  if (sessionId) {
    const existing = db.select().from(chatSessions).where(eq(chatSessions.id, sessionId)).get();
    if (!existing) sessionId = undefined;
  }

  if (!sessionId) {
    const res = db
      .insert(chatSessions)
      .values({
        profileId: 1,
        unitId: parsed.data.topicId || "freetalk",
        mode: "freetalk",
        completedGoalsJson: "[]",
        summaryZh: "和 Dino 自由聊英语",
        starsEarned: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();
    sessionId = Number(res.lastInsertRowid);
  }

  const historyRows = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.id))
    .all();

  const result = await runFreeTalkTurn({
    config: {
      provider: settings.llmProvider,
      baseUrl: settings.llmBaseUrl,
      apiKey: settings.llmApiKey,
      model: settings.llmModel,
      temperature: settings.llmTemperature,
    },
    childNickname: profile.nickname,
    companionName: profile.companionName,
    history: historyRows.map((r) => ({
      role: r.role === "user" ? "user" : "assistant",
      englishText: r.englishText,
    })),
    userText: parsed.data.userText,
  });

  db.insert(chatMessages)
    .values({
      sessionId,
      role: "user",
      englishText: parsed.data.userText.trim(),
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
      englishText: result.response.englishReply,
      chineseText: result.response.chineseHint,
      emotion: result.response.emotion,
      suggestionsJson: JSON.stringify(result.response.nextSuggestions),
      createdAt: nowIso,
    })
    .run();

  db.update(chatSessions)
    .set({ updatedAt: nowIso })
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
    sessionId,
    response: result.response,
    usedFallback: result.usedFallback,
    fallbackReason: result.fallbackReason,
  });
}
