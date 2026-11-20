"use client";

interface WordVisualProps {
  visualKey: string;
  size?: "sm" | "md" | "lg";
}

const COLOR_HEX_MAP: Record<string, string> = {
  "color-red": "#EF4444",
  "color-blue": "#3B82F6",
  "color-yellow": "#FACC15",
  "color-green": "#10B981",
  "color-orange": "#F97316",
  "color-pink": "#EC4899",
  "color-purple": "#8B5CF6",
};

const NUM_TEXT_MAP: Record<string, { num: string; color: string }> = {
  "num-1": { num: "1", color: "#F43F5E" },
  "num-2": { num: "2", color: "#FB923C" },
  "num-3": { num: "3", color: "#F59E0B" },
  "num-4": { num: "4", color: "#10B981" },
  "num-5": { num: "5", color: "#06B6D4" },
  "num-6": { num: "6", color: "#3B82F6" },
  "num-7": { num: "7", color: "#8B5CF6" },
  "num-8": { num: "8", color: "#EC4899" },
  "num-9": { num: "9", color: "#14B8A6" },
  "num-10": { num: "10", color: "#F97316" },
  six: { num: "6", color: "#3B82F6" },
  ten: { num: "10", color: "#F97316" },
};

const EMOJI_MAP: Record<string, string> = {
  wave: "👋",
  "sparkle-hi": "✨",
  bye: "🙋",
  sunrise: "🌅",
  nametag: "🏷️",
  friends: "🧑‍🤝‍🧑",
  sun: "☀️",
  star: "⭐",
  apple: "🍎",
  ant: "🐜",
  ax: "🪓",
  tiger: "🐯",
  robot: "🤖",
  pig: "🐷",
  box: "📦",
  paint: "🎨",
  snowy: "❄️",
  nose: "👃",
  net: "🕸️",
  cake: "🎂",
  candle: "🕯️",
  cat: "🐱",
  car: "🚗",
  kite: "🪁",
  crown: "👑",
  egg: "🥚",
  elephant: "🐘",
  mom: "👩",
  dad: "👨",
  sister: "👧",
  brother: "👦",
  grandma: "👵",
  grandpa: "👴",
  baby: "👶",
  hand: "✋",
  hat: "👒",
  happy: "😄",
  rabbit: "🐰",
  milk: "🥛",
  mouth: "👄",
  banana: "🍌",
  orange: "🍊",
  grape: "🍇",
  pear: "🍐",
  bread: "🍞",
  water: "💧",
  dog: "🐶",
  desk: "🪑",
  bird: "🐦",
  fish: "🐟",
  panda: "🐼",
  rainy: "🌧️",
  eye: "👀",
  foot: "🦶",
  head: "🙂",
  ear: "👂",
  jump: "🦘",
  clap: "👏",
  ball: "⚽",
  book: "📘",
  bear: "🧸",
  bag: "🎒",
  pen: "🖊️",
  pencil: "✏️",
  ruler: "📏",
  eraser: "🧽",
  teacher: "👩‍🏫",
  windy: "💨",
  sunny: "☀️",
  cloudy: "☁️",
  cloud: "☁️",
  rainbow: "🌈",
  doll: "🎎",
  sleeping: "😴",
};

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
