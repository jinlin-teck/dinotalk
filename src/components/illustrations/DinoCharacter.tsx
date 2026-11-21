"use client";

import { motion } from "framer-motion";
import { DINO_SKINS } from "@/data/curriculum";
import type { EmotionMood } from "@/data/curriculum/types";

interface DinoCharacterProps {
  mood?: EmotionMood;
  avatarId?: string;
  equippedAccessories?: string[];
  size?: number;
  className?: string;
  onClick?: () => void;
}

export function DinoCharacter({
  mood = "idle",
  avatarId = "dino-green",
  equippedAccessories = [],
  size = 160,
  className = "",
  onClick,
}: DinoCharacterProps) {
  const skin = DINO_SKINS.find((s) => s.id === avatarId) ?? DINO_SKINS[0];

  const isCheering = mood === "cheering" || mood === "excited";
  const isTalking = mood === "talking";
  const isThinking = mood === "thinking";
  const isSleeping = mood === "sleeping";

  const has = (id: string) => equippedAccessories.includes(id);

  return (
    <motion.div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      whileTap={onClick ? { scale: 0.94 } : undefined}
      whileHover={onClick ? { scale: 1.04 } : undefined}
      className={`inline-flex items-center justify-center select-none ${
        onClick ? "cursor-pointer" : ""
      } ${className}`}
      style={{ width: size, height: size }}
      animate={
        isCheering
          ? { y: [0, -10, 0], rotate: [0, -3, 3, 0] }
          : isTalking
          ? { scale: [1, 1.03, 1] }
          : isSleeping
          ? { y: [0, 3, 0] }
          : { y: [0, -4, 0] }
      }
      transition={{
        duration: isCheering ? 0.7 : 2.6,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      <svg
        viewBox="0 0 220 220"
        className="w-full h-full drop-shadow-md"
        aria-label="小恐龙 Dino"
      >
        {/* Ground shadow */}
        <ellipse cx="110" cy="198" rx="56" ry="10" fill={skin.shadowColor} />

        {/* Star Cape (behind body) */}
        {has("star_cape") && (
          <path
            d="M78 112 Q38 134 30 176 Q62 182 88 168 Z"
            fill="#6366F1"
            stroke="#312E81"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        )}

        {/* Back spikes */}
        <path
          d="M66 76 L50 64 L68 58 Z M76 54 L66 36 L86 44 Z M100 40 L98 20 L114 36 Z"
          fill={skin.spikeColor}
          stroke={skin.strokeColor}
          strokeWidth="4"
          strokeLinejoin="round"
        />

        {/* Tail */}
        <path
          d="M72 152 Q30 156 26 130 Q42 134 62 128 Z"
          fill={skin.bodyColor}
          stroke={skin.strokeColor}
          strokeWidth="5"
          strokeLinejoin="round"
        />

        {/* Body */}
        <ellipse
          cx="110"
          cy="144"
          rx="48"
          ry="44"
          fill={skin.bodyColor}
          stroke={skin.strokeColor}
          strokeWidth="5"
        />

        {/* Cream Belly */}
        <ellipse cx="118" cy="148" rx="30" ry="30" fill={skin.bellyColor} />
        <path
          d="M98 136 H138 M96 150 H140 M102 164 H134"
          stroke={skin.shadowColor}
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Fruit Apron (U5 reward) */}
        {has("fruit_apron") && (
          <g>
            <path
              d="M90 124 H146 L142 174 Q118 182 94 174 Z"
              fill="#FFF1F2"
              stroke="#E11D48"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <circle cx="118" cy="150" r="9" fill="#EF4444" />
            <path d="M118 139 Q122 134 126 138" stroke="#16A34A" strokeWidth="3" fill="none" />
          </g>
        )}

        {/* Heart Badge (U4 reward) */}
        {has("heart_badge") && (
          <path
            d="M118 156 C118 156 105 147 105 139 C105 134 110 132 114 136 L118 140 L122 136 C126 132 131 134 131 139 C131 147 118 156 118 156 Z"
            fill="#F43F5E"
            stroke="#9F1239"
            strokeWidth="2.5"
          />
        )}

        {/* Feet */}
        <ellipse
          cx="88"
          cy="186"
          rx="16"
          ry="10"
          fill={skin.feetColor}
          stroke={skin.strokeColor}
          strokeWidth="4"
        />
        <ellipse
          cx="134"
          cy="186"
          rx="16"
          ry="10"
          fill={skin.feetColor}
          stroke={skin.strokeColor}
          strokeWidth="4"
        />

        {/* Little Arms */}
        <motion.path
          d="M148 132 Q174 122 170 140 Q162 146 146 144"
          fill={skin.bodyColor}
          stroke={skin.strokeColor}
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={isCheering ? { rotate: [-12, 16, -12] } : { rotate: [0, 5, 0] }}
          style={{ originX: "148px", originY: "136px" }}
          transition={{ duration: isCheering ? 0.45 : 2, repeat: Infinity }}
        />

        {/* Hand-held items */}
        {has("magic_wand") && (
          <g>
            <line x1="168" y1="138" x2="196" y2="106" stroke="#92400E" strokeWidth="4" strokeLinecap="round" />
            <path
              d="M196 92 l4 9 10 2-7 7 2 10-9-5-9 5 2-10-7-7 10-2z"
              fill="#FACC15"
              stroke="#B45309"
              strokeWidth="2"
            />
          </g>
        )}

        {has("rainbow_brush") && (
          <g>
            <line x1="166" y1="140" x2="194" y2="112" stroke="#D97706" strokeWidth="5" strokeLinecap="round" />
            <path d="M192 108 Q204 96 206 112 Q196 118 192 108 Z" fill="#EC4899" stroke="#831843" strokeWidth="2" />
            <circle cx="204" cy="100" r="3.5" fill="#3B82F6" />
          </g>
        )}

        {has("zoo_binoculars") && (
          <g>
            <circle cx="174" cy="136" r="9" fill="#334155" stroke="#0F172A" strokeWidth="2.5" />
            <circle cx="190" cy="136" r="9" fill="#334155" stroke="#0F172A" strokeWidth="2.5" />
            <circle cx="174" cy="136" r="4.5" fill="#38BDF8" />
            <circle cx="190" cy="136" r="4.5" fill="#38BDF8" />
          </g>
        )}

        {has("rainbow_umbrella") && (
          <g>
            <line x1="176" y1="142" x2="176" y2="96" stroke="#64748B" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M150 98 Q176 70 202 98 Z" fill="#F43F5E" stroke="#9F1239" strokeWidth="2.5" />
            <path d="M162 98 Q176 76 190 98 Z" fill="#FACC15" />
            <path d="M170 98 Q176 82 182 98 Z" fill="#38BDF8" />
          </g>
        )}

        {/* Scarf Accessory */}
        {has("scarf") && (
          <g>
            <path
              d="M72 110 Q114 126 154 108 L150 122 Q114 136 76 122 Z"
              fill="#EF4444"
              stroke="#7F1D1D"
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            <path
              d="M132 118 L142 152 L124 148 Z"
              fill="#F87171"
              stroke="#7F1D1D"
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
          </g>
        )}

        {/* School Bowtie (U8 reward) */}
        {has("school_bowtie") && (
          <g>
            <path d="M116 118 L100 110 L100 126 Z" fill="#E11D48" stroke="#881337" strokeWidth="2.5" />
            <path d="M120 118 L136 110 L136 126 Z" fill="#E11D48" stroke="#881337" strokeWidth="2.5" />
            <circle cx="118" cy="118" r="4.5" fill="#FB7185" stroke="#881337" strokeWidth="2" />
          </g>
        )}

        {/* Head */}
        <path
          d="M66 90 C62 52 94 34 128 38 C164 42 184 68 178 96 C174 116 144 120 116 118 C86 116 68 106 66 90 Z"
          fill={skin.bodyColor}
          stroke={skin.strokeColor}
          strokeWidth="5"
          strokeLinejoin="round"
        />

        {/* Sport Headband (U7 reward) */}
        {has("sport_band") && (
          <path
            d="M74 58 Q124 44 166 60 L163 69 Q124 54 76 67 Z"
            fill="#F97316"
            stroke="#9A3412"
            strokeWidth="2.5"
          />
        )}

        {/* Rosy Cheek */}
        <ellipse cx="114" cy="96" rx="10" ry="6" fill="#FDA4AF" opacity="0.85" />

        {/* Eye */}
        {isSleeping ? (
          <path
            d="M124 72 Q134 80 144 72"
            fill="none"
            stroke={skin.strokeColor}
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        ) : isCheering ? (
          <path
            d="M124 74 Q134 62 144 74"
            fill="none"
            stroke={skin.strokeColor}
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        ) : (
          <g>
            <circle cx="134" cy="72" r="11" fill="#FFFFFF" stroke={skin.strokeColor} strokeWidth="3" />
            <circle cx="137" cy="71" r="6" fill={skin.strokeColor} />
            <circle cx="139" cy="68" r="2.2" fill="#FFFFFF" />
          </g>
        )}

        {/* Sunglasses Accessory */}
        {has("sunglasses") && (
          <g>
            <rect
              x="114"
              y="60"
              width="34"
              height="20"
              rx="6"
              fill="#1E293B"
              stroke="#F59E0B"
              strokeWidth="3"
            />
            <line x1="114" y1="68" x2="86" y2="74" stroke="#F59E0B" strokeWidth="3" />
            <line x1="120" y1="66" x2="128" y2="74" stroke="#94A3B8" strokeWidth="2" />
          </g>
        )}

        {/* Mecha Visor (U10 reward) */}
        {has("mecha_visor") && (
          <g>
            <rect
              x="110"
              y="58"
              width="44"
              height="22"
              rx="11"
              fill="#06B6D4"
              fillOpacity="0.8"
              stroke="#0E7490"
              strokeWidth="3"
            />
            <line x1="118" y1="65" x2="144" y2="65" stroke="#ECFEFF" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}

        {/* Mouth */}
        {isTalking ? (
          <motion.ellipse
            cx="154"
            cy="95"
            rx="9"
            ry="7"
            fill="#FB7185"
            stroke={skin.strokeColor}
            strokeWidth="3.5"
            animate={{ ry: [4, 9, 4] }}
            transition={{ duration: 0.35, repeat: Infinity }}
          />
        ) : isCheering ? (
          <path
            d="M140 90 Q156 106 168 88 Z"
            fill="#FB7185"
            stroke={skin.strokeColor}
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        ) : isThinking ? (
          <circle cx="154" cy="96" r="4.5" fill={skin.strokeColor} />
        ) : isSleeping ? (
          <path
            d="M148 96 Q156 100 162 96"
            fill="none"
            stroke={skin.strokeColor}
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M138 92 Q154 104 168 90"
            fill="none"
            stroke={skin.strokeColor}
            strokeWidth="4"
            strokeLinecap="round"
          />
        )}

        {/* Hats */}
        {has("sailor_cap") && (
          <g>
            <path d="M102 42 Q132 16 160 42 Z" fill="#FFFFFF" stroke="#1D4ED8" strokeWidth="3" />
            <rect x="98" y="38" width="66" height="9" rx="4" fill="#2563EB" stroke="#1E3A8A" strokeWidth="2.5" />
            <circle cx="131" cy="30" r="4" fill="#FACC15" />
          </g>
        )}

        {has("party_hat") && (
          <g>
            <path d="M112 40 L132 6 L152 40 Z" fill="#EC4899" stroke="#9D174D" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="132" cy="6" r="5" fill="#FACC15" />
            <circle cx="127" cy="24" r="3" fill="#FDE047" />
            <circle cx="138" cy="31" r="3" fill="#38BDF8" />
          </g>
        )}

        {has("crown") && (
          <path
            d="M104 38 L108 18 L122 30 L132 14 L142 30 L156 18 L158 38 Z"
            fill="#FBBF24"
            stroke="#B45309"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        )}

        {has("wizard_hat") && (
          <g>
            <ellipse
              cx="132"
              cy="40"
              rx="34"
              ry="7"
              fill="#6366F1"
              stroke="#312E81"
              strokeWidth="3"
            />
            <path
              d="M110 38 L134 4 L152 38 Z"
              fill="#6366F1"
              stroke="#312E81"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <circle cx="133" cy="24" r="4" fill="#FDE047" />
          </g>
        )}

        {/* Mood FX */}
        {isThinking && (
          <g fill="#F59E0B">
            <circle cx="188" cy="48" r="5" />
            <circle cx="198" cy="34" r="7" />
          </g>
        )}
        {isSleeping && (
          <text x="176" y="48" fontSize="18" fontWeight="bold" fill="#64748B">
            Zzz
          </text>
        )}
        {isCheering && (
          <g fill="#FBBF24">
            <path d="M40 50 l4 8 8 2-6 6 2 8-8-4-8 4 2-8-6-6 8-2z" />
            <path d="M188 52 l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
          </g>
        )}
      </svg>
    </motion.div>
  );
}
