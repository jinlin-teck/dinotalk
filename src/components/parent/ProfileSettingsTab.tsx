"use client";

import { useState } from "react";
import { KeyRound, Save } from "lucide-react";

interface ProfileSettingsTabProps {
  nicknameDraft: string;
  companionDraft: string;
  dailyGoalDraft: number;
  eyeCareDraft: number;
  hasParentPin: boolean;
  saving: boolean;
  onChangeNickname: (val: string) => void;
  onChangeCompanion: (val: string) => void;
  onChangeDailyGoal: (val: number) => void;
  onChangeEyeCare: (val: number) => void;
  onSaveProfile: () => void;
  onSetPin: (pin: string) => Promise<void>;
}

export function ProfileSettingsTab({
  nicknameDraft,
  companionDraft,
  dailyGoalDraft,
  eyeCareDraft,
  hasParentPin,
  saving,
  onChangeNickname,
  onChangeCompanion,
  onChangeDailyGoal,
  onChangeEyeCare,
  onSaveProfile,
  onSetPin,
}: ProfileSettingsTabProps) {
  const [pinDraft, setPinDraft] = useState("");

  const handleApplyPin = async () => {
    await onSetPin(pinDraft);
    setPinDraft("");
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 space-y-5 shadow-xs">
        <h2 className="text-lg font-black text-slate-900">宝贝学习档案与护眼设置</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
              孩子昵称（AI 伙伴会这样称呼宝贝）
            </label>
            <input
              type="text"
              maxLength={20}
              value={nicknameDraft}
              onChange={(e) => onChangeNickname(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
              恐龙伙伴名字
            </label>
            <input
              type="text"
              maxLength={20}
              value={companionDraft}
              onChange={(e) => onChangeCompanion(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
              每日目标学习时长（分钟）
            </label>
            <input
              type="number"
              min={5}
              max={60}
              value={dailyGoalDraft}
              onChange={(e) => onChangeDailyGoal(Number(e.target.value))}
              className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
              护眼休息提醒间隔（分钟）
            </label>
            <select
              value={eyeCareDraft}
              onChange={(e) => onChangeEyeCare(Number(e.target.value))}
              className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm bg-white"
            >
              <option value={10}>每 10 分钟提醒一次</option>
              <option value={15}>每 15 分钟提醒一次（推荐）</option>
              <option value={20}>每 20 分钟提醒一次</option>
              <option value={30}>每 30 分钟提醒一次</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={onSaveProfile}
          className="min-h-[46px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-sm flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? "保存中..." : "保存档案设置"}</span>
        </button>
      </div>

      {/* Optional Parent PIN */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-700" />
              <span>家长控制台密码锁（可选）</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              未设置时默认通过算术题进入；设置 4~20 位密码后，进入家长控制台需输入密码（服务端加盐哈希存储）。
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-black ${
              hasParentPin
                ? "bg-emerald-100 text-emerald-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {hasParentPin ? "已启用自定义密码" : "当前为算术验证"}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="password"
            maxLength={20}
            value={pinDraft}
            onChange={(e) => setPinDraft(e.target.value)}
            placeholder={
              hasParentPin
                ? "输入新密码以修改（至少 4 位）"
                : "输入 4~20 位数字或字母密码"
            }
            className="flex-1 h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium"
          />
          <button
            type="button"
            disabled={saving || pinDraft.trim().length < 4}
            onClick={handleApplyPin}
            className="min-h-[44px] px-5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-sm"
          >
            {hasParentPin ? "更新密码" : "启用密码锁"}
          </button>
          {hasParentPin && (
            <button
              type="button"
              disabled={saving}
              onClick={() => onSetPin("")}
              className="min-h-[44px] px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-sm border border-rose-200"
            >
              清除密码
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
