"use client";

import type { ReportData } from "@/types/api";

interface LearningReportTabProps {
  report: ReportData;
}

function itemTypeBadge(itemType: string): string {
  if (itemType === "phonics") return "拼读";
  if (itemType === "sentence") return "句型";
  return "单词";
}

export function LearningReportTab({ report }: LearningReportTabProps) {
  const attentionItems = report.wordStats.filter((w) => w.needsAttention);
  const steadyItems = report.wordStats.filter((w) => !w.needsAttention);

  return (
    <div className="space-y-6">
      {/* Parent 1-Minute Companion Tips */}
      {report.parentTips && report.parentTips.length > 0 && (
        <div className="bg-gradient-to-br from-amber-50 to-emerald-50 rounded-3xl border-2 border-amber-200 p-5 sm:p-6 space-y-3">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              🏡 今晚 1 分钟亲子英语陪读卡
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              根据孩子最近学习进度自动生成，吃饭或睡前随口练 1 句，把屏幕里的英语带进真实生活！
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {report.parentTips.map((tip) => (
              <div
                key={tip.unitId}
                className="rounded-2xl bg-white border border-amber-200 p-4 space-y-2 shadow-2xs"
              >
                <div className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                  <span>{tip.badgeEmoji}</span>
                  <span>{tip.unitTitleZh}</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{tip.tipZh}</p>
                <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs">
                  <div className="font-black text-emerald-900">{tip.sampleEn}</div>
                  <div className="text-emerald-700 mt-0.5">{tip.sampleZh}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7-day bar chart */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <h2 className="text-lg font-black text-slate-900">近 7 天学习活跃趋势</h2>
        <div className="grid grid-cols-7 gap-2 items-end h-40 pt-4">
          {report.last7Days.map((d) => {
            const maxVal = Math.max(
              5,
              ...report.last7Days.map((x) => x.studyMinutes + x.activitiesCompleted * 2)
            );
            const score = d.studyMinutes + d.activitiesCompleted * 2;
            const pct = Math.max(8, Math.round((score / maxVal) * 100));
            return (
              <div key={d.dateKey} className="flex flex-col items-center gap-1.5 h-full justify-end">
                <span className="text-[11px] font-bold text-slate-500">
                  {d.activitiesCompleted}项
                </span>
                <div
                  className="w-full max-w-[38px] rounded-t-xl bg-emerald-500 transition-all"
                  style={{ height: `${pct}%` }}
                  title={`${d.dateKey}: ${d.studyMinutes}分钟, ${d.activitiesCompleted}项活动`}
                />
                <span className="text-xs font-bold text-slate-600">{d.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Unit Progress Matrix */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <h2 className="text-lg font-black text-slate-900">L0 启蒙岛 10 单元学习进度</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {report.unitSummary.map((u) => (
            <div
              key={u.unitId}
              data-testid={`report-unit-${u.unitId}`}
              className="rounded-2xl border border-slate-200 p-3.5 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{u.badgeEmoji}</span>
                <div>
                  <div className="font-bold text-sm text-slate-900">
                    U{u.order}. {u.titleZh}
                  </div>
                  <div className="text-xs text-slate-500">
                    {[
                      u.storyDone ? "绘本✓" : "绘本○",
                      u.phonicsDone ? "拼读✓" : "拼读○",
                      u.gameDone ? "游戏✓" : "游戏○",
                      u.roleplayDone ? "剧场✓" : "剧场○",
                    ].join(" · ")}
                  </div>
                </div>
              </div>
              <span className="text-sm font-black text-amber-600 shrink-0">
                {u.starsEarned}/4⭐
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Word / Phonics / Sentence Mastery Wall (Weak items highlighted first) */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <h2 className="text-lg font-black text-slate-900">
          词汇、拼读与句型掌握墙（共 {report.wordStats.length} 项）
        </h2>
        {report.wordStats.length === 0 ? (
          <p className="text-sm text-slate-500">孩子还没有开始学习记录，先去体验第一关吧~</p>
        ) : (
          <div className="space-y-4">
            {attentionItems.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-extrabold text-amber-800">
                  ⚠️ 重点巩固（待复习或掌握度偏低，共 {attentionItems.length} 项）
                </div>
                <div className="flex flex-wrap gap-2">
                  {attentionItems.map((w) => (
                    <div
                      key={w.itemKey}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold ${
                        w.wrongCount > 0
                          ? "bg-rose-50 border-rose-200 text-rose-900"
                          : "bg-amber-50 border-amber-200 text-amber-900"
                      }`}
                    >
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/80 mr-1">
                        {itemTypeBadge(w.itemType)}
                      </span>
                      {w.label} <span className="opacity-75">({w.zh})</span> · Lv.{w.masteryLevel}
                      {w.wrongCount > 0 && (
                        <span className="ml-1 text-rose-700">· 错{w.wrongCount}次</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {steadyItems.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-extrabold text-emerald-800">
                  ✅ 稳步掌握（共 {steadyItems.length} 项）
                </div>
                <div className="flex flex-wrap gap-2">
                  {steadyItems.map((w) => (
                    <div
                      key={w.itemKey}
                      className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900"
                    >
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/80 mr-1">
                        {itemTypeBadge(w.itemType)}
                      </span>
                      {w.label} <span className="text-slate-500">({w.zh})</span> · Lv.
                      {w.masteryLevel}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent AI Dialogues */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <h2 className="text-lg font-black text-slate-900">最近 AI 情景对话回顾</h2>
        {report.recentSessions.length === 0 ? (
          <p className="text-sm text-slate-500">暂无 AI 情景对话记录。</p>
        ) : (
          <div className="space-y-4">
            {report.recentSessions.map((sess) => (
              <div
                key={sess.id}
                data-testid={`report-session-${sess.id}`}
                className="rounded-2xl border border-slate-200 p-4 space-y-2 bg-slate-50/70"
              >
                <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>{sess.summaryZh}</span>
                  <span>{sess.mode === "roleplay" ? "情景剧场" : "自由聊天"}</span>
                </div>
                <div className="space-y-1.5">
                  {sess.messages.map((m) => (
                    <div key={m.id} className="text-xs">
                      <span className="font-black text-slate-800">
                        {m.role === "user" ? "宝贝：" : "Dino："}
                      </span>
                      <span className="text-slate-700">{m.englishText}</span>
                      {m.chineseText && (
                        <span className="text-slate-500 ml-1.5">({m.chineseText})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
