"use client";

import { useState } from "react";
import {
  BarChart3,
  Check,
  Edit3,
  KeyRound,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { DinoCharacter } from "@/components/illustrations/DinoCharacter";
import { L0_UNITS } from "@/data/curriculum";
import type { ParentManagedProfile } from "@/types/api";

interface ProfileDraft {
  nickname: string;
  companionName: string;
  dailyGoalMinutes: number;
  eyeCareMinutes: number;
}

interface ProfileSettingsTabProps {
  profiles: ParentManagedProfile[];
  activeProfileId: number | null;
  saving: boolean;
  onCreateProfile: (input: ProfileDraft) => Promise<boolean>;
  onUpdateProfile: (profileId: number, input: ProfileDraft) => Promise<boolean>;
  onDeleteProfile: (profileId: number) => Promise<boolean>;
  onViewReport: (profileId: number) => void;
  onChangePassword: (currentPin: string, newPin: string) => Promise<boolean>;
}

const DEFAULT_DRAFT: ProfileDraft = {
  nickname: "",
  companionName: "Dino",
  dailyGoalMinutes: 15,
  eyeCareMinutes: 15,
};

export function ProfileSettingsTab({
  profiles,
  activeProfileId,
  saving,
  onCreateProfile,
  onUpdateProfile,
  onDeleteProfile,
  onViewReport,
  onChangePassword,
}: ProfileSettingsTabProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createDraft, setCreateDraft] = useState<ProfileDraft>(DEFAULT_DRAFT);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ProfileDraft>(DEFAULT_DRAFT);

  const [pendingDelete, setPendingDelete] = useState<ParentManagedProfile | null>(null);

  const [currentPinDraft, setCurrentPinDraft] = useState("");
  const [newPinDraft, setNewPinDraft] = useState("");
  const [confirmNewPinDraft, setConfirmNewPinDraft] = useState("");
  const [pinLocalError, setPinLocalError] = useState<string | null>(null);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createDraft.nickname.trim()) return;
    const ok = await onCreateProfile(createDraft);
    if (ok) {
      setCreateDraft(DEFAULT_DRAFT);
      setShowCreateForm(false);
    }
  };

  const startEditing = (p: ParentManagedProfile) => {
    setEditingId(p.id);
    setEditDraft({
      nickname: p.nickname,
      companionName: p.companionName,
      dailyGoalMinutes: p.dailyGoalMinutes,
      eyeCareMinutes: p.eyeCareMinutes,
    });
  };

  const handleEditSubmit = async (e: React.FormEvent, profileId: number) => {
    e.preventDefault();
    if (!editDraft.nickname.trim()) return;
    const ok = await onUpdateProfile(profileId, editDraft);
    if (ok) {
      setEditingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const targetId = pendingDelete.id;
    const ok = await onDeleteProfile(targetId);
    if (ok) {
      setPendingDelete(null);
      if (editingId === targetId) setEditingId(null);
    }
  };

  const handleApplyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinLocalError(null);
    const cur = currentPinDraft.trim();
    const next = newPinDraft.trim();
    const conf = confirmNewPinDraft.trim();

    if (!cur) {
      setPinLocalError("请输入当前家长密码");
      return;
    }
    if (next.length < 4 || next.length > 32) {
      setPinLocalError("新密码长度需在 4~32 位字符之间");
      return;
    }
    if (next !== conf) {
      setPinLocalError("两次输入的新密码不一致");
      return;
    }

    const ok = await onChangePassword(cur, next);
    if (ok) {
      setCurrentPinDraft("");
      setNewPinDraft("");
      setConfirmNewPinDraft("");
    }
  };

  const maxUnitStars = L0_UNITS.length * 4;

  return (
    <div className="space-y-6">
      {/* Multi-Child Profiles CRUD */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 space-y-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              <span>孩子学习档案管理（共 {profiles.length} 位）</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              每位小朋友的学习进度、星星、恐龙装扮与对话历史均完全独立隔离。
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            data-testid="parent-create-profile-btn"
            onClick={() => setShowCreateForm((v) => !v)}
            className="min-h-[42px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-sm flex items-center gap-1.5"
          >
            {showCreateForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{showCreateForm ? "收起新建" : "新建孩子档案"}</span>
          </button>
        </div>

        {/* Create New Profile Form */}
        {showCreateForm && (
          <form
            onSubmit={handleCreateSubmit}
            className="rounded-2xl bg-emerald-50/70 border border-emerald-200 p-4 sm:p-5 space-y-4"
          >
            <div className="font-black text-sm text-emerald-900">新增小朋友学习档案</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  孩子昵称 *
                </label>
                <input
                  type="text"
                  maxLength={20}
                  required
                  value={createDraft.nickname}
                  onChange={(e) =>
                    setCreateDraft({ ...createDraft, nickname: e.target.value })
                  }
                  placeholder="例如：苗苗"
                  data-testid="parent-create-nickname"
                  className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  恐龙伙伴名字
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={createDraft.companionName}
                  onChange={(e) =>
                    setCreateDraft({ ...createDraft, companionName: e.target.value })
                  }
                  data-testid="parent-create-companion"
                  className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  每日目标学习时长（分钟）
                </label>
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={createDraft.dailyGoalMinutes}
                  onChange={(e) =>
                    setCreateDraft({
                      ...createDraft,
                      dailyGoalMinutes: Number(e.target.value),
                    })
                  }
                  data-testid="parent-create-daily-goal"
                  className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  护眼休息提醒间隔（分钟）
                </label>
                <select
                  value={createDraft.eyeCareMinutes}
                  onChange={(e) =>
                    setCreateDraft({
                      ...createDraft,
                      eyeCareMinutes: Number(e.target.value),
                    })
                  }
                  data-testid="parent-create-eye-care"
                  className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value={10}>每 10 分钟提醒一次</option>
                  <option value={15}>每 15 分钟提醒一次（推荐）</option>
                  <option value={20}>每 20 分钟提醒一次</option>
                  <option value={30}>每 30 分钟提醒一次</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving || !createDraft.nickname.trim()}
                data-testid="parent-create-submit"
                className="min-h-[42px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{saving ? "创建中..." : "确认创建"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="min-h-[42px] px-4 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-sm"
              >
                取消
              </button>
            </div>
          </form>
        )}

        {/* Profiles List */}
        {profiles.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center space-y-2">
            <p className="text-sm font-bold text-slate-600">还没有孩子学习档案哦</p>
            <p className="text-xs text-slate-500">
              点击右上角「新建孩子档案」，或让孩子打开首页输入/说出名字即可立即创建！
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {profiles.map((p) => {
              const isEditing = editingId === p.id;
              const isActive = p.id === activeProfileId;

              return (
                <div
                  key={p.id}
                  data-testid={`parent-profile-card-${p.id}`}
                  className={`rounded-2xl border p-4 sm:p-5 transition ${
                    isActive
                      ? "border-emerald-300 bg-emerald-50/40"
                      : "border-slate-200 bg-slate-50/40"
                  }`}
                >
                  {isEditing ? (
                    <form
                      onSubmit={(e) => handleEditSubmit(e, p.id)}
                      className="space-y-4"
                    >
                      <div className="font-black text-sm text-slate-900">
                        编辑「{p.nickname}」的档案设置
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-extrabold text-slate-700 mb-1">
                            孩子昵称
                          </label>
                          <input
                            type="text"
                            maxLength={20}
                            required
                            value={editDraft.nickname}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, nickname: e.target.value })
                            }
                            data-testid="parent-edit-nickname"
                            className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-extrabold text-slate-700 mb-1">
                            恐龙伙伴名字
                          </label>
                          <input
                            type="text"
                            maxLength={20}
                            required
                            value={editDraft.companionName}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, companionName: e.target.value })
                            }
                            data-testid="parent-edit-companion"
                            className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-extrabold text-slate-700 mb-1">
                            每日目标学习时长（分钟）
                          </label>
                          <input
                            type="number"
                            min={5}
                            max={60}
                            value={editDraft.dailyGoalMinutes}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                dailyGoalMinutes: Number(e.target.value),
                              })
                            }
                            data-testid="parent-edit-daily-goal"
                            className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-extrabold text-slate-700 mb-1">
                            护眼休息提醒间隔（分钟）
                          </label>
                          <select
                            value={editDraft.eyeCareMinutes}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                eyeCareMinutes: Number(e.target.value),
                              })
                            }
                            data-testid="parent-edit-eye-care"
                            className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                          >
                            <option value={10}>每 10 分钟</option>
                            <option value={15}>每 15 分钟（推荐）</option>
                            <option value={20}>每 20 分钟</option>
                            <option value={30}>每 30 分钟</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          disabled={saving || !editDraft.nickname.trim()}
                          data-testid="parent-edit-save"
                          className="min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>保存修改</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="min-h-[40px] px-4 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-xs"
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <DinoCharacter
                          size={58}
                          mood="happy"
                          avatarId={p.avatarId}
                          equippedAccessories={p.equippedAccessories}
                          className="shrink-0"
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-black text-base text-slate-900 truncate">
                              {p.nickname}
                            </span>
                            {isActive && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black">
                                当前浏览器使用中
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                              Lv.{p.level} · {p.totalStars} ⭐
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 font-medium flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>伙伴：{p.companionName}</span>
                            <span>
                              关卡星：{p.totalUnitStars}/{maxUnitStars}
                            </span>
                            <span>已掌握词条：{p.masteredItemCount}</span>
                            <span>
                              目标 {p.dailyGoalMinutes}m · 护眼 {p.eyeCareMinutes}m
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onViewReport(p.id)}
                          data-testid={`parent-report-profile-${p.id}`}
                          className="min-h-[38px] px-3 rounded-xl bg-white hover:bg-emerald-50 border border-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1"
                        >
                          <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>报告</span>
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => startEditing(p)}
                          data-testid={`parent-edit-profile-${p.id}`}
                          className="min-h-[38px] px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>编辑</span>
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => setPendingDelete(p)}
                          data-testid={`parent-delete-profile-${p.id}`}
                          className="min-h-[38px] px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>删除</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Parent Password Change Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-700" />
              <span>家长控制台密码修改</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              进入家长控制台全程使用密码验证（服务端 scrypt 加盐哈希存储）；修改后当前会话会自动刷新并失效其他设备登录态。
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800">
            已启用密码保护
          </span>
        </div>

        <form onSubmit={handleApplyPassword} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="password"
              maxLength={32}
              value={currentPinDraft}
              onChange={(e) => {
                setCurrentPinDraft(e.target.value);
                setPinLocalError(null);
              }}
              placeholder="当前密码"
              data-testid="parent-current-pin"
              className="h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium"
            />
            <input
              type="password"
              maxLength={32}
              value={newPinDraft}
              onChange={(e) => {
                setNewPinDraft(e.target.value);
                setPinLocalError(null);
              }}
              placeholder="新密码（4~32 位字符）"
              data-testid="parent-new-pin"
              className="h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium"
            />
            <input
              type="password"
              maxLength={32}
              value={confirmNewPinDraft}
              onChange={(e) => {
                setConfirmNewPinDraft(e.target.value);
                setPinLocalError(null);
              }}
              placeholder="确认新密码"
              data-testid="parent-confirm-new-pin"
              className="h-11 rounded-xl border border-slate-300 px-3 text-sm font-medium"
            />
          </div>

          {pinLocalError && (
            <p className="text-xs font-bold text-rose-600">{pinLocalError}</p>
          )}

          <button
            type="submit"
            disabled={saving || !currentPinDraft.trim() || newPinDraft.trim().length < 4}
            data-testid="parent-update-pin-btn"
            className="min-h-[44px] px-5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-sm"
          >
            更新家长密码
          </button>
        </form>
      </div>

      {/* Delete Confirmation Modal */}
      {pendingDelete && (
        <div
          data-testid="parent-delete-confirm-modal"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 border-2 border-rose-200 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900">
              确认删除「{pendingDelete.nickname}」的档案吗？
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              删除后，该孩子的全部学习记录（{pendingDelete.totalStars} 颗星星、关卡进度、单词掌握记录、恐龙装扮和 AI 对话回顾）将被
              <strong className="text-rose-700">永久清除且无法恢复</strong>。
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setPendingDelete(null)}
                className="min-h-[42px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                data-testid="parent-delete-confirm-btn"
                onClick={handleConfirmDelete}
                className="min-h-[42px] px-5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-black text-sm"
              >
                {saving ? "删除中..." : "确认永久删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
