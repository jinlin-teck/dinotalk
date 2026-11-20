"use client";

interface SceneArtworkProps {
  sceneKey: string;
  className?: string;
}

const SCENE_PALETTES: Record<
  string,
  { sky: string; hill1: string; hill2: string; accent: string; label: string }
> = {
  dock: { sky: "#E0F2FE", hill1: "#6EE7B7", hill2: "#38BDF8", accent: "#F59E0B", label: "阳光码头" },
  studio: { sky: "#FEF3C7", hill1: "#FBCFE8", hill2: "#FDE68A", accent: "#EC4899", label: "魔法画室" },
  party: { sky: "#FCE7F3", hill1: "#FDE68A", hill2: "#F9A8D4", accent: "#EC4899", label: "生日派对" },
  home: { sky: "#FFEDD5", hill1: "#FDBA74", hill2: "#FED7AA", accent: "#F97316", label: "恐龙之家" },
  fruitshop: { sky: "#FEE2E2", hill1: "#BBF7D0", hill2: "#FECACA", accent: "#EF4444", label: "阳光水果店" },
  zoo: { sky: "#EDE9FE", hill1: "#86EFAC", hill2: "#C4B5FD", accent: "#8B5CF6", label: "奇妙动物园" },
  playground: { sky: "#CFFAFE", hill1: "#6EE7B7", hill2: "#A5F3FC", accent: "#06B6D4", label: "草地运动场" },
  classroom: { sky: "#DBEAFE", hill1: "#BFDBFE", hill2: "#93C5FD", accent: "#3B82F6", label: "快乐教室" },
  weather: { sky: "#E0F2FE", hill1: "#BAE6FD", hill2: "#7DD3FC", accent: "#0EA5E9", label: "小小气象站" },
  toyroom: { sky: "#FEF9C3", hill1: "#FDE047", hill2: "#FDBA74", accent: "#F59E0B", label: "神奇玩具屋" },
};

export function SceneArtwork({ sceneKey, className = "" }: SceneArtworkProps) {
  const palette = SCENE_PALETTES[sceneKey] ?? SCENE_PALETTES.dock;

  return (
    <svg
      viewBox="0 0 800 180"
      preserveAspectRatio="xMidYMid slice"
      className={`w-full h-full ${className}`}
      aria-hidden="true"
    >
      <rect width="800" height="180" fill={palette.sky} />
      {/* Sun / Rainbow Glow */}
      <circle cx="96" cy="52" r="34" fill={palette.accent} opacity="0.24" />
      <circle cx="96" cy="52" r="20" fill={palette.accent} opacity="0.55" />
      {/* Soft Clouds */}
      <g fill="#FFFFFF" opacity="0.85">
        <ellipse cx="260" cy="46" rx="44" ry="16" />
        <ellipse cx="290" cy="40" rx="28" ry="14" />
        <ellipse cx="620" cy="54" rx="52" ry="18" />
        <ellipse cx="655" cy="48" rx="30" ry="14" />
      </g>
      {/* Rolling Hills */}
      <path d="M0 130 Q210 86 430 128 T800 116 L800 180 L0 180 Z" fill={palette.hill2} opacity="0.65" />
      <path d="M0 144 Q260 110 520 146 T800 138 L800 180 L0 180 Z" fill={palette.hill1} opacity="0.85" />
      {/* Decorative stars */}
      <circle cx="440" cy="42" r="5" fill={palette.accent} opacity="0.5" />
      <circle cx="720" cy="72" r="6" fill={palette.accent} opacity="0.4" />
    </svg>
  );
}
