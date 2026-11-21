"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Lock, ShieldCheck } from "lucide-react";

interface MathChallenge {
  a: number;
  b: number;
  token: string;
}

interface ParentGateProps {
  onUnlocked: () => void;
}

export function ParentGate({ onUnlocked }: ParentGateProps) {
  const [loading, setLoading] = useState(true);
  const [hasParentPin, setHasParentPin] = useState(false);
  const [challenge, setChallenge] = useState<MathChallenge | null>(null);
  const [gateInput, setGateInput] = useState("");
  const [gateError, setGateError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchChallenge = useCallback(async () => {
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
      setHasParentPin(Boolean(data.hasParentPin));
      setChallenge(data.challenge ?? null);
    } catch {
      setGateError("网络异常，无法获取家长验证状态");
    } finally {
      setLoading(false);
    }
  }, [onUnlocked]);

  useEffect(() => {
    fetchChallenge();
  }, [fetchChallenge]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const raw = gateInput.trim();
    if (!raw) {
      setGateError(hasParentPin ? "请输入家长密码" : "请输入计算结果");
      return;
    }

    setSubmitting(true);
    setGateError("");
    try {
      const payload = hasParentPin
        ? { action: "unlock", pin: raw }
        : {
            action: "unlock",
            challengeToken: challenge?.token ?? "",
            answer: Number(raw),
          };

      const res = await fetch("/api/parent/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.authenticated) {
        setGateInput("");
        onUnlocked();
        return;
      }

      if (data?.challenge) {
        setChallenge(data.challenge);
      }
      setGateError(data?.error || "验证未通过，请再试一次");
      setGateInput("");
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
            <Lock className="w-3.5 h-3.5" /> 家长锁
          </span>
        </div>

        <div className="text-center space-y-2 pt-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800 text-white flex items-center justify-center">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">进入家长控制台</h1>
          <p className="text-sm text-slate-500">
            {hasParentPin
              ? "请输入家长自设密码，以保护 AI 模型与语音配置："
              : "为防止小朋友误修改 AI 模型与语音设置，请先完成算术验证："}
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm font-bold text-slate-500">
            正在准备家长验证...
          </div>
        ) : (
          <form onSubmit={handleUnlock} className="space-y-4">
            {!hasParentPin && challenge && (
              <div className="text-center text-3xl font-black text-emerald-700 bg-emerald-50 rounded-2xl py-4 border border-emerald-200">
                {challenge.a} + {challenge.b} = ?
              </div>
            )}
            <input
              type={hasParentPin ? "password" : "number"}
              inputMode={hasParentPin ? "text" : "numeric"}
              value={gateInput}
              onChange={(e) => setGateInput(e.target.value)}
              placeholder={hasParentPin ? "请输入家长密码" : "请输入计算结果"}
              data-testid="parent-gate-input"
              className="w-full min-h-[50px] rounded-2xl border-2 border-slate-300 focus:border-emerald-500 outline-none px-4 text-center text-xl font-bold"
              autoFocus
            />
            {gateError && (
              <p className="text-xs font-bold text-rose-600 text-center">{gateError}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              data-testid="parent-gate-submit"
              className="w-full min-h-[50px] rounded-2xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-black text-base transition"
            >
              {submitting ? "验证中..." : "解锁进入"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
