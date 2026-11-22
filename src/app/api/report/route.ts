import { NextResponse } from "next/server";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, todayDateKey } from "@/db";
import {
  chatMessages,
  chatSessions,
  childProfiles,
  dailyLogs,
  unitProgress,
  wordMastery,
} from "@/db/schema";
import { getAllPhonics, getAllSentences, getAllVocab, L0_UNITS } from "@/data/curriculum";
import { requireParentAuth } from "@/lib/auth/parent-session";
import { resolveActiveProfile } from "@/lib/auth/profile-session";
import { isDueForReview, isMasteryItemWeak } from "@/lib/srs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildEmptyLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      dateKey: todayDateKey(d),
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      studyMinutes: 0,
      activitiesCompleted: 0,
      wordsPracticed: 0,
    });
  }
  return days;
}

export async function GET(request: Request) {
  const authError = requireParentAuth(request);
  if (authError) return authError;

  const db = getDb();
  const url = new URL(request.url);
  const rawProfileId = url.searchParams.get("profileId")?.trim() ?? "";

  let profile: typeof childProfiles.$inferSelect | undefined;
  if (rawProfileId) {
    if (!/^[1-9]\d*$/.test(rawProfileId)) {
      return NextResponse.json({ error: "无效的孩子档案 ID" }, { status: 400 });
    }
    profile = db
      .select()
      .from(childProfiles)
      .where(eq(childProfiles.id, Number(rawProfileId)))
      .get();
    if (!profile) {
      return NextResponse.json({ error: "找不到该孩子档案" }, { status: 404 });
    }
  } else {
    profile =
      resolveActiveProfile(db, request) ??
      db.select().from(childProfiles).orderBy(asc(childProfiles.id)).get();
  }

  if (!profile) {
    const emptyUnitSummary = L0_UNITS.map((u) => ({
      unitId: u.id,
      order: u.order,
      titleZh: u.titleZh,
      badgeEmoji: u.badgeEmoji,
      storyDone: false,
      phonicsDone: false,
      gameDone: false,
      roleplayDone: false,
      starsEarned: 0,
    }));
    return NextResponse.json({
      profile: null,
      last7Days: buildEmptyLast7Days(),
      unitSummary: emptyUnitSummary,
      wordStats: [],
      parentTips: [],
      recentSessions: [],
    });
  }

  const profileId = profile.id;

  const progressRows = db
    .select()
    .from(unitProgress)
    .where(eq(unitProgress.profileId, profileId))
    .all();
  const masteryRows = db
    .select()
    .from(wordMastery)
    .where(eq(wordMastery.profileId, profileId))
    .all();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaysAgoKey = todayDateKey(sevenDaysAgo);

  const logRows = db
    .select()
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.profileId, profileId),
        gte(dailyLogs.dateKey, sevenDaysAgoKey)
      )
    )
    .all();

  const sessionRows = db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.profileId, profileId))
    .orderBy(desc(chatSessions.id))
    .limit(10)
    .all();

  // Build last 7 days chart
  const logMap = new Map(logRows.map((l) => [l.dateKey, l]));
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = todayDateKey(d);
    const entry = logMap.get(key);
    last7Days.push({
      dateKey: key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      studyMinutes: Math.round(((entry?.studySeconds ?? 0) / 60) * 10) / 10,
      activitiesCompleted: entry?.activitiesCompleted ?? 0,
      wordsPracticed: entry?.wordsPracticed ?? 0,
    });
  }

  const now = new Date();
  const vocabMap = new Map(getAllVocab().map((v) => [v.id, v]));
  const phonicsMap = new Map(getAllPhonics().map((p) => [p.id, p]));
  const sentenceMap = new Map(getAllSentences().map((s) => [s.id, s]));

  const wordStats = masteryRows
    .map((m) => {
      const v = vocabMap.get(m.itemKey);
      const p = phonicsMap.get(m.itemKey);
      const s = sentenceMap.get(m.itemKey);
      const isDue = isDueForReview(m.nextReviewAt, now);
      const needsAttention = isMasteryItemWeak(
        {
          masteryLevel: m.masteryLevel,
          wrongCount: m.wrongCount,
          nextReviewAt: m.nextReviewAt,
        },
        now
      );
      return {
        itemKey: m.itemKey,
        itemType: m.itemType,
        unitId: m.unitId,
        label: v ? v.word : s ? s.en : p ? (p.lowercase ? `${p.letter}/${p.lowercase}` : p.letter) : m.itemKey,
        zh: v ? v.zh : s ? s.zh : p ? p.soundLabel : "",
        masteryLevel: m.masteryLevel,
        correctCount: m.correctCount,
        wrongCount: m.wrongCount,
        isDue,
        needsAttention,
      };
    })
    .sort((a, b) => {
      if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
      if (a.wrongCount !== b.wrongCount) return b.wrongCount - a.wrongCount;
      return a.masteryLevel - b.masteryLevel;
    });

  const progressMap = new Map(progressRows.map((p) => [p.unitId, p]));
  const unitSummary = L0_UNITS.map((u) => {
    const p = progressMap.get(u.id);
    return {
      unitId: u.id,
      order: u.order,
      titleZh: u.titleZh,
      badgeEmoji: u.badgeEmoji,
      storyDone: p?.storyDone === 1,
      phonicsDone: p?.phonicsDone === 1,
      gameDone: p?.gameDone === 1,
      roleplayDone: p?.roleplayDone === 1,
      starsEarned: p?.starsEarned ?? 0,
    };
  });

  // 亲子陪读建议：优先取最近更新过进度的 3 个单元，无记录时推荐 U1-U2
  const recentUnitIds = [...progressRows]
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .map((p) => p.unitId)
    .slice(0, 3);
  const tipUnits =
    recentUnitIds.length > 0
      ? recentUnitIds
          .map((id) => L0_UNITS.find((u) => u.id === id))
          .filter((u): u is NonNullable<typeof u> => Boolean(u))
      : L0_UNITS.slice(0, 2);

  const parentTips = tipUnits.map((u) => ({
    unitId: u.id,
    unitTitleZh: `第 ${u.order} 关 · ${u.titleZh}`,
    badgeEmoji: u.badgeEmoji,
    tipZh:
      u.parentTipZh ||
      `和孩子聊聊本关主题「${u.titleZh}」，一起大声说出核心例句吧！`,
    sampleEn: u.sentences[0]?.en ?? u.vocab[0]?.exampleEn ?? "Hello!",
    sampleZh: u.sentences[0]?.zh ?? u.vocab[0]?.exampleZh ?? "你好！",
  }));

  const sessionIds = sessionRows.map((s) => s.id);
  const msgsBySession = new Map<number, typeof chatMessages.$inferSelect[]>();
  if (sessionIds.length > 0) {
    const allMsgs = db
      .select()
      .from(chatMessages)
      .where(inArray(chatMessages.sessionId, sessionIds))
      .orderBy(asc(chatMessages.id))
      .all();
    for (const m of allMsgs) {
      const list = msgsBySession.get(m.sessionId);
      if (list) list.push(m);
      else msgsBySession.set(m.sessionId, [m]);
    }
  }

  const recentSessions = sessionRows.map((s) => {
    const msgs = msgsBySession.get(s.id) ?? [];
    return {
      id: s.id,
      unitId: s.unitId,
      mode: s.mode,
      summaryZh: s.summaryZh,
      starsEarned: s.starsEarned,
      createdAt: s.createdAt,
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role,
        englishText: m.englishText,
        chineseText: m.chineseText,
      })),
    };
  });

  return NextResponse.json({
    profile: {
      id: profile.id,
      nickname: profile.nickname,
      companionName: profile.companionName,
      totalStars: profile.totalStars,
      level: profile.level,
      streakDays: profile.streakDays,
      dailyGoalMinutes: profile.dailyGoalMinutes,
      eyeCareMinutes: profile.eyeCareMinutes,
    },
    last7Days,
    unitSummary,
    wordStats,
    parentTips,
    recentSessions,
  });
}
