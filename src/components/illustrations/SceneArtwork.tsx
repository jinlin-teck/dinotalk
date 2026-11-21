"use client";

import { SCENE_PALETTES } from "./visual-keys";

interface SceneArtworkProps {
  sceneKey: string;
  completedCount?: number;
  className?: string;
}

export function SceneArtwork({
  sceneKey,
  completedCount = 0,
  className = "",
}: SceneArtworkProps) {
  const palette = SCENE_PALETTES[sceneKey] ?? SCENE_PALETTES.dock;
  const stage = Math.max(0, Math.min(3, completedCount));

  return (
    <svg
      viewBox="0 0 800 180"
      preserveAspectRatio="xMidYMid slice"
      className={`w-full h-full ${className}`}
      aria-hidden="true"
    >
      <rect width="800" height="180" fill={palette.sky} />
      {/* Sun / Glow */}
      <circle cx="96" cy="52" r="34" fill={palette.accent} opacity="0.24" />
      <circle cx="96" cy="52" r="20" fill={palette.accent} opacity="0.58" />

      {/* Soft Clouds */}
      <g fill="#FFFFFF" opacity="0.88">
        <ellipse cx="260" cy="46" rx="44" ry="16" />
        <ellipse cx="290" cy="40" rx="28" ry="14" />
        <ellipse cx="620" cy="54" rx="52" ry="18" />
        <ellipse cx="655" cy="48" rx="30" ry="14" />
      </g>

      {/* Rolling Hills */}
      <path d="M0 130 Q210 86 430 128 T800 116 L800 180 L0 180 Z" fill={palette.hill2} opacity="0.65" />
      <path d="M0 144 Q260 110 520 146 T800 138 L800 180 L0 180 Z" fill={palette.hill1} opacity="0.9" />

      {/* Scene-specific SVG props linked to roleplay progress (0..3) */}
      {sceneKey === "dock" && (
        <g>
          {/* Wooden pier + Sailboat */}
          <rect x="30" y="138" width="210" height="14" rx="4" fill="#B45309" />
          <rect x="60" y="152" width="12" height="28" fill="#92400E" />
          <rect x="190" y="152" width="12" height="28" fill="#92400E" />
          <g transform={`translate(${stage * 28}, 0)`}>
            <path d="M360 136 L430 136 L416 154 L374 154 Z" fill="#EF4444" />
            <line x1="395" y1="86" x2="395" y2="136" stroke="#78350F" strokeWidth="4" />
            <path d="M397 88 L434 128 L397 128 Z" fill="#FFFFFF" />
            {stage >= 2 && <path d="M395 88 L372 96 L395 104 Z" fill="#FACC15" />}
          </g>
        </g>
      )}

      {sceneKey === "studio" && (
        <g>
          {/* Progressive Rainbow Arcs (grow with completed goals) */}
          <path d="M210 165 A175 135 0 0 1 560 165" fill="none" stroke="#EF4444" strokeWidth="10" opacity={stage >= 1 ? 0.9 : 0.2} />
          <path d="M222 165 A163 123 0 0 1 548 165" fill="none" stroke="#F97316" strokeWidth="10" opacity={stage >= 1 ? 0.9 : 0.15} />
          <path d="M234 165 A151 111 0 0 1 536 165" fill="none" stroke="#FACC15" strokeWidth="10" opacity={stage >= 2 ? 0.9 : 0.12} />
          <path d="M246 165 A139 99 0 0 1 524 165" fill="none" stroke="#10B981" strokeWidth="10" opacity={stage >= 2 ? 0.9 : 0.1} />
          <path d="M258 165 A127 87 0 0 1 512 165" fill="none" stroke="#3B82F6" strokeWidth="10" opacity={stage >= 3 ? 0.95 : 0.1} />
          <path d="M270 165 A115 75 0 0 1 500 165" fill="none" stroke="#8B5CF6" strokeWidth="10" opacity={stage >= 3 ? 0.95 : 0.08} />
          {/* Paint palette */}
          <ellipse cx="148" cy="148" rx="34" ry="22" fill="#FDE68A" stroke="#B45309" strokeWidth="3" />
          <circle cx="134" cy="142" r="5" fill="#EF4444" />
          <circle cx="148" cy="136" r="5" fill="#3B82F6" />
          <circle cx="164" cy="144" r="5" fill="#10B981" />
        </g>
      )}

      {sceneKey === "party" && (
        <g>
          {/* Party bunting flags */}
          <path d="M160 22 Q400 58 640 22" fill="none" stroke="#EC4899" strokeWidth="2.5" />
          <polygon points="220,30 236,52 252,33" fill="#F43F5E" />
          <polygon points="300,38 316,60 332,40" fill="#FACC15" />
          <polygon points="384,42 400,64 416,42" fill="#38BDF8" />
          <polygon points="468,38 484,60 500,36" fill="#10B981" />
          <polygon points="548,30 564,52 580,27" fill="#A855F7" />
          {/* Birthday Cake */}
          <rect x="332" y="114" width="116" height="48" rx="10" fill="#FFF1F2" stroke="#F472B6" strokeWidth="3" />
          <path d="M332 130 Q350 142 368 130 T404 130 T448 130" fill="none" stroke="#EC4899" strokeWidth="6" />
          {[358, 390, 422].map((cx, i) => (
            <g key={cx}>
              <rect x={cx - 4} y="92" width="8" height="22" rx="2" fill={i === 1 ? "#38BDF8" : "#FACC15"} />
              {/* Flame extinguishes on stage 3 celebration! */}
              {stage < 3 && <ellipse cx={cx} cy="86" rx="4" ry="7" fill="#F97316" />}
            </g>
          ))}
          {/* Balloons rise as goals complete */}
          {stage >= 1 && <circle cx="170" cy={110 - stage * 12} r="18" fill="#EC4899" opacity="0.85" />}
          {stage >= 2 && <circle cx="212" cy={100 - stage * 10} r="16" fill="#3B82F6" opacity="0.85" />}
        </g>
      )}

      {sceneKey === "home" && (
        <g>
          {/* Cozy house & photo frames */}
          <rect x="290" y="96" width="140" height="72" rx="6" fill="#FFF7ED" stroke="#EA580C" strokeWidth="3" />
          <polygon points="274,98 360,46 446,98" fill="#F97316" stroke="#C2410C" strokeWidth="3" />
          <rect x="342" y="128" width="36" height="40" rx="6" fill="#FDBA74" />
          <rect x="304" y="114" width="26" height="24" rx="4" fill="#BAE6FD" stroke="#EA580C" strokeWidth="2" />
          <rect x="390" y="114" width="26" height="24" rx="4" fill="#BAE6FD" stroke="#EA580C" strokeWidth="2" />
          {stage >= 1 && <text x="347" y="88" fontSize="22">❤️</text>}
          {stage >= 2 && <text x="458" y="128" fontSize="24">🌸</text>}
          {stage >= 3 && <text x="242" y="128" fontSize="24">🌟</text>}
        </g>
      )}

      {sceneKey === "fruitshop" && (
        <g>
          {/* Fruit stall awning & basket */}
          <rect x="260" y="92" width="220" height="76" rx="8" fill="#FEF3C7" stroke="#D97706" strokeWidth="3" />
          {[0, 1, 2, 3, 4].map((i) => (
            <path
              key={i}
              d={`M${256 + i * 46} 70 H${302 + i * 46} L${298 + i * 46} 98 Q${279 + i * 46} 106 ${260 + i * 46} 98 Z`}
              fill={i % 2 === 0 ? "#EF4444" : "#FFFFFF"}
              stroke="#B91C1C"
              strokeWidth="2"
            />
          ))}
          <text x="285" y="148" fontSize="28">🍎</text>
          <text x="330" y="148" fontSize="28">🍌</text>
          <text x="375" y="148" fontSize="28">🍇</text>
          {stage >= 1 && <text x="422" y="148" fontSize="26">🥛</text>}
          {stage >= 2 && <text x="200" y="150" fontSize="26">🧺</text>}
        </g>
      )}

      {sceneKey === "zoo" && (
        <g>
          {/* Bamboo grove + peeking animals as child finds them */}
          {[140, 162, 184, 520, 542].map((bx) => (
            <g key={bx}>
              <rect x={bx} y="54" width="10" height="118" rx="4" fill="#16A34A" />
              <ellipse cx={bx + 14} cy="82" rx="12" ry="5" fill="#22C55E" />
              <ellipse cx={bx - 8} cy="108" rx="10" ry="4" fill="#22C55E" />
            </g>
          ))}
          <text x="235" y="152" fontSize="34" opacity={stage >= 1 ? 1 : 0.35}>🐼</text>
          <text x="345" y="152" fontSize="32" opacity={stage >= 2 ? 1 : 0.25}>🐰</text>
          <text x="445" y="148" fontSize="34" opacity={stage >= 3 ? 1 : 0.2}>🐘</text>
        </g>
      )}

      {sceneKey === "playground" && (
        <g>
          {/* Grass track + jumping stars */}
          <ellipse cx="380" cy="154" rx="220" ry="20" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="4" />
          <text x="210" y="138" fontSize="30">⚽</text>
          <text x="355" y={128 - stage * 8} fontSize="32">🤸</text>
          {stage >= 2 && <text x="468" y="132" fontSize="28">🎈</text>}
        </g>
      )}

      {sceneKey === "classroom" && (
        <g>
          {/* Blackboard + Schoolbag */}
          <rect x="260" y="42" width="210" height="84" rx="8" fill="#065F46" stroke="#B45309" strokeWidth="6" />
          <text x="288" y="88" fontSize="22" fontWeight="bold" fill="#FEF3C7">A B C · 1 2 3</text>
          <text x="322" y="114" fontSize="14" fill="#A7F3D0">
            {stage >= 3 ? "READY FOR SCHOOL!" : "PACK MY BAG"}
          </text>
          <text x="175" y="152" fontSize="34">🎒</text>
          {stage >= 1 && <text x="225" y="150" fontSize="24">✏️</text>}
          {stage >= 2 && <text x="505" y="150" fontSize="26">📘</text>}
        </g>
      )}

      {sceneKey === "weather" && (
        <g>
          {/* Weather vane + progressive rainbow */}
          <line x1="210" y1="88" x2="210" y2="162" stroke="#475569" strokeWidth="5" />
          <polygon points="184,96 236,96 226,88 236,104" fill="#0284C7" />
          {stage >= 1 && <text x="320" y="102" fontSize="32">☀️</text>}
          {stage >= 2 && (
            <path d="M360 156 A120 90 0 0 1 560 156" fill="none" stroke="#EC4899" strokeWidth="8" opacity="0.85" />
          )}
          {stage >= 2 && (
            <path d="M372 156 A108 78 0 0 1 548 156" fill="none" stroke="#FACC15" strokeWidth="8" opacity="0.85" />
          )}
          {stage >= 3 && (
            <path d="M384 156 A96 66 0 0 1 536 156" fill="none" stroke="#38BDF8" strokeWidth="8" opacity="0.9" />
          )}
        </g>
      )}

      {sceneKey === "toyroom" && (
        <g>
          {/* Magic Toy Box + Toys popping out */}
          <rect x="295" y="114" width="160" height="54" rx="10" fill="#F59E0B" stroke="#B45309" strokeWidth="3.5" />
          <rect x="287" y="102" width="176" height="16" rx="6" fill="#FBBF24" stroke="#B45309" strokeWidth="3" />
          <text x="320" y="96" fontSize="28">🤖</text>
          <text x="366" y="94" fontSize="28">🧸</text>
          <text x="412" y="98" fontSize="26">🚗</text>
          {stage >= 2 && <text x="235" y="142" fontSize="28">🪁</text>}
        </g>
      )}

      {/* Celebratory sparkles when all 3 goals complete */}
      {stage >= 3 && (
        <g fill="#FACC15">
          <path d="M150 38 l5 10 11 2-8 7 2 11-10-5-10 5 2-11-8-7 11-2z" />
          <path d="M510 34 l4 8 9 2-6 6 2 9-9-4-9 4 2-9-6-6 9-2z" />
          <path d="M675 76 l4 8 9 2-6 6 2 9-9-4-9 4 2-9-6-6 9-2z" />
        </g>
      )}
    </svg>
  );
}
