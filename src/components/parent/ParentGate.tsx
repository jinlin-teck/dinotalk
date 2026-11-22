"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Lock, ShieldCheck } from "lucide-react";

interface ParentGateProps {
  onUnlocked: () => void;
}

export function ParentGate({ onUnlocked }: ParentGateProps) {
  const [loading, setLoading] = useState(true);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [confirmPinInput, setConfirmPinInput] = useState("");
  const [gateError, setGateError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchAuthState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/parent/auth", { cache: "no-store" });
      if (!res.ok) {
        setGateError("验证服务暂时不可用，请刷新重试");
        return;
      }
      const data = await res.json();
      if (data.authenticated) {
        onUnlocked();
        return;
      }
      setNeedsPasswordSetup(Boolean(data.needsPasswordSetup));
    } catch {
      setGateError("网络异常，无法获取家长验证状态");
    } finally {
      setLoading(false);
    }
  }, [onUnlocked]);

  useEffect(() => {
    void fetchAuthState();
  }, [fetchAuthState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedPin = pinInput.trim();
    if (!trimmedPin) {
      setGateError("请输入家长密码");
      return;
    }

    if (needsPasswordSetup) {
      if (trimmedPin.length < 4) {
        setGateError("家长密码至少需要 4 位字符");
        return;
      }
      if (trimmedPin !== confirmPinInput.trim()) {
        setGateError("两次输入的密码不一致，请检查后再试");
        return;
      }
    }

    setSubmitting(true);
    setGateError("");
    try {
      const payload = needsPasswordSetup
        ? {
            action: "setup_pin",
            pin: trimmedPin,
            confirmPin: confirmPinInput.trim(),
          }
        : {
            action: "unlock",
            pin: trimmedPin,
          };

      const res = await fetch("/api/parent/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.authenticated) {
        setPinInput("");
        setConfirmPinInput("");
        onUnlocked();
        return;
      }

      if (data?.needsPasswordSetup) {
        setNeedsPasswordSetup(true);
      } else if (res.status === 409) {
        setNeedsPasswordSetup(false);
      }
      setGateError(data?.error || "密码验证未通过，请再试一次");
      if (!needsPasswordSetup) {
        setPinInput("");
      }
    } catch {
      setGateError("网络错误，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-xl border-2 border-slate-200 space-y-5">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" /> 返回孩子端
          </Link>
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" /> 密码验证
          </span>
        </div>

        <div className="text-center space-y-2 pt-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800 text-white flex items-center justify-center">
            {needsPasswordSetup ? (
              <KeyRound className="w-8 h-8" />
            ) : (
              <ShieldCheck className="w-8 h-8" />
            )}
          </div>
          <h1 className="text-2xl font-black text-slate-900">
            {needsPasswordSetup ? "首次设置家长密码" : "进入家长控制台"}
          </h1>
          <p className="text-sm text-slate-500">
            {needsPasswordSetup
              ? "为保护 AI 模型、语音配置与孩子学习档案，请先设置家长专属密码（4~32 位）："
              : "请输入家长密码，以管理模型配置与孩子学习档案："}
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm font-bold text-slate-500">
            正在检查家长验证状态...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {needsPasswordSetup ? (
              <div className="space-y-3">
                <input
                  type="password"
                  maxLength={32}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="设置家长密码（至少 4 位字符）"
                  data-testid="parent-setup-pin"
                  className="w-full min-h-[50px] rounded-2xl border-2 border-slate-300 focus:border-emerald-500 outline-none px-4 text-center text-lg font-bold"
                  autoFocus
                />
                <input
                  type="password"
                  maxLength={32}
                  value={confirmPinInput}
                  onChange={(e) => setConfirmPinInput(e.target.value)}
                  placeholder="再次确认家长密码"
                  data-testid="parent-setup-confirm-pin"
                  className="w-full min-h-[50px] rounded-2xl border-2 border-slate-300 focus:border-emerald-500 outline-none px-4 text-center text-lg font-bold"
                />
              </div>
            ) : (
              <input
                type="password"
                maxLength={32}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="请输入家长密码"
                data-testid="parent-gate-input"
                className="w-full min-h-[50px] rounded-2xl border-2 border-slate-300 focus:border-emerald-500 outline-none px-4 text-center text-xl font-bold"
                autoFocus
              />
            )}

            {gateError && (
              <p className="text-xs font-bold text-rose-600 text-center">{gateError}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              data-testid="parent-gate-submit"
              className="w-full min-h-[50px] rounded-2xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-black text-base transition"
            >
              {submitting
                ? "验证中..."
                : needsPasswordSetup
                ? "设置密码并进入"
                : "解锁进入"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
