import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, todayDateKey } from "@/db";
import { appSettings, chatMessages, chatSessions, childProfiles } from "@/db/schema";
import { runFreeTalkTurn } from "@/lib/ai/tutor-agent";
import { assertJsonSameOrigin } from "@/lib/security/endpoint-guard";
import { addDailyLogStats, DEFAULT_PROFILE_ID } from "@/lib/services/learning-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FreeTalkSchema = z.object({
  sessionId: z.number().int().positive().optional(),
  topicId: z.string().optional(),
  userText: z.string().min(1).max(300),
});

export async function POST(request: Request) {
  const originError = assertJsonSameOrigin(request);
  if (originError) return originError;

  const body = await request.json().catch(() => null);
  const parsed = FreeTalkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "聊天参数无效" }, { status: 400 });
  }

  const db = getDb();
  const profile = db
    .select()
    .from(childProfiles)
    .where(eq(childProfiles.id, DEFAULT_PROFILE_ID))
    .get()!;
  const settings = db.select().from(appSettings).where(eq(appSettings.id, 1)).get()!;

  let sessionId = parsed.data.sessionId;
  let historyRows: Array<{ role: "assistant" | "user"; englishText: string }> = [];

  if (sessionId) {
    const existing = db.select().from(chatSessions).where(eq(chatSessions.id, sessionId)).get();
    if (existing) {
      if (existing.mode !== "freetalk") {
        return NextResponse.json({ error: "对话会话类型不匹配" }, { status: 400 });
      }
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
  }

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
    history: historyRows,
    userText: parsed.data.userText,
  });

  const now = new Date();
  const nowIso = now.toISOString();
  const today = todayDateKey(now);

  const activeSessionId = db.transaction((tx) => {
    let targetSessionId = sessionId;
    if (!targetSessionId) {
      const res = tx
        .insert(chatSessions)
        .values({
          profileId: DEFAULT_PROFILE_ID,
          unitId: parsed.data.topicId || "freetalk",
          mode: "freetalk",
          completedGoalsJson: "[]",
          summaryZh: "和 Dino 自由聊英语",
          starsEarned: 0,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .run();
      targetSessionId = Number(res.lastInsertRowid);
    }

    tx.insert(chatMessages)
      .values({
        sessionId: targetSessionId,
        role: "user",
        englishText: parsed.data.userText.trim(),
        chineseText: "",
        emotion: "happy",
        suggestionsJson: "[]",
        createdAt: nowIso,
      })
      .run();

    tx.insert(chatMessages)
      .values({
        sessionId: targetSessionId,
        role: "assistant",
        englishText: result.response.englishReply,
        chineseText: result.response.chineseHint,
        emotion: result.response.emotion,
        suggestionsJson: JSON.stringify(result.response.nextSuggestions),
        createdAt: nowIso,
      })
      .run();

    tx.update(chatSessions)
      .set({ updatedAt: nowIso })
      .where(eq(chatSessions.id, targetSessionId))
      .run();

    addDailyLogStats(tx, today, {
      wordsPracticed: 1,
      studySeconds: 15,
    });

    return targetSessionId;
  });

  return NextResponse.json({
    sessionId: activeSessionId,
    response: result.response,
    usedFallback: result.usedFallback,
    fallbackReason: result.fallbackReason,
  });
}
