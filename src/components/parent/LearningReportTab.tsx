"use client";

import type { ReportData } from "@/types/api";

interface LearningReportTabProps {
  report: ReportData;
}

export function LearningReportTab({ report }: LearningReportTabProps) {
  return (
    <div className="space-y-6">
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

      {/* Word Mastery Wall */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-3">
        <h2 className="text-lg font-black text-slate-900">
          已接触词汇与拼读掌握墙（共 {report.wordStats.length} 项）
        </h2>
        {report.wordStats.length === 0 ? (
          <p className="text-sm text-slate-500">孩子还没有开始学习记录，先去体验第一关吧~</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {report.wordStats.map((w) => (
              <div
                key={w.itemKey}
                className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900"
              >
                {w.label} <span className="text-slate-500">({w.zh})</span> · Lv.{w.masteryLevel}
              </div>
            ))}
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
