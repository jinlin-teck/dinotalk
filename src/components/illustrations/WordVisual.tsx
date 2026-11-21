"use client";

import { COLOR_HEX_MAP, EMOJI_MAP, NUM_TEXT_MAP } from "./visual-keys";

interface WordVisualProps {
  visualKey: string;
  size?: "sm" | "md" | "lg";
}

export function WordVisual({ visualKey, size = "lg" }: WordVisualProps) {
  const boxCls =
    size === "sm"
      ? "w-12 h-12 rounded-xl text-2xl"
      : size === "md"
      ? "w-16 h-16 rounded-2xl text-4xl"
      : "w-24 h-24 rounded-3xl text-5xl";

  if (COLOR_HEX_MAP[visualKey]) {
    const hex = COLOR_HEX_MAP[visualKey];
    return (
      <div
        className={`${boxCls} inline-flex items-center justify-center bg-white border-2 border-slate-200 shadow-sm`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 64 64" className="w-3/4 h-3/4">
          <path
            d="M32 6 C46 6 56 18 54 32 C52 46 42 56 28 56 C14 56 8 44 10 30 C12 16 20 6 32 6 Z"
            fill={hex}
          />
          <circle cx="24" cy="22" r="5" fill="#FFFFFF" opacity="0.45" />
        </svg>
      </div>
    );
  }

  if (NUM_TEXT_MAP[visualKey]) {
    const item = NUM_TEXT_MAP[visualKey];
    return (
      <div
        className={`${boxCls} inline-flex items-center justify-center font-black text-white shadow-sm border-b-4 border-black/15`}
        style={{ backgroundColor: item.color }}
        aria-hidden="true"
      >
        <span className={size === "sm" ? "text-xl" : size === "md" ? "text-2xl" : "text-4xl"}>
          {item.num}
        </span>
      </div>
    );
  }

  const emoji = EMOJI_MAP[visualKey] ?? "🌟";
  return (
    <div
      className={`${boxCls} inline-flex items-center justify-center bg-amber-50/90 border-2 border-amber-200/80 shadow-sm select-none`}
      aria-hidden="true"
    >
      <span>{emoji}</span>
    </div>
  );
}
