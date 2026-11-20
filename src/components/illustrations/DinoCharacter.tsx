"use client";

import { motion } from "framer-motion";
import type { EmotionMood } from "@/data/curriculum/types";

interface DinoCharacterProps {
  mood?: EmotionMood;
  equippedAccessories?: string[];
  size?: number;
  className?: string;
}

export function DinoCharacter({
  mood = "idle",
  equippedAccessories = [],
  size = 160,
  className = "",
}: DinoCharacterProps) {
  const isCheering = mood === "cheering" || mood === "excited";
  const isTalking = mood === "talking";
  const isThinking = mood === "thinking";
  const isSleeping = mood === "sleeping";

  const hasCrown = equippedAccessories.includes("crown");
  const hasWizard = equippedAccessories.includes("wizard_hat");
  const hasScarf = equippedAccessories.includes("scarf");
  const hasSunglasses = equippedAccessories.includes("sunglasses");

  return (
    <motion.div
      className={`inline-flex items-center justify-center select-none ${className}`}
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
        <ellipse cx="110" cy="198" rx="56" ry="10" fill="#D1FAE5" />

        {/* Back spikes */}
        <path
          d="M66 76 L50 64 L68 58 Z M76 54 L66 36 L86 44 Z M100 40 L98 20 L114 36 Z"
          fill="#F59E0B"
          stroke="#065F46"
          strokeWidth="4"
          strokeLinejoin="round"
        />

        {/* Tail */}
        <path
          d="M72 152 Q30 156 26 130 Q42 134 62 128 Z"
          fill="#34D399"
          stroke="#065F46"
          strokeWidth="5"
          strokeLinejoin="round"
        />

        {/* Body */}
        <ellipse
          cx="110"
          cy="144"
          rx="48"
          ry="44"
          fill="#34D399"
          stroke="#065F46"
          strokeWidth="5"
        />

        {/* Cream Belly */}
        <ellipse cx="118" cy="148" rx="30" ry="30" fill="#FEF3C7" />
        <path
          d="M98 136 H138 M96 150 H140 M102 164 H134"
          stroke="#FDE68A"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Feet */}
        <ellipse
          cx="88"
          cy="186"
          rx="16"
          ry="10"
          fill="#10B981"
          stroke="#065F46"
          strokeWidth="4"
        />
        <ellipse
          cx="134"
          cy="186"
          rx="16"
          ry="10"
          fill="#10B981"
          stroke="#065F46"
          strokeWidth="4"
        />

        {/* Little Arms */}
        <motion.path
          d="M148 132 Q174 122 170 140 Q162 146 146 144"
          fill="#34D399"
          stroke="#065F46"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={isCheering ? { rotate: [-12, 16, -12] } : { rotate: [0, 5, 0] }}
          style={{ originX: "148px", originY: "136px" }}
          transition={{ duration: isCheering ? 0.45 : 2, repeat: Infinity }}
        />

        {/* Scarf Accessory */}
        {hasScarf && (
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

        {/* Head */}
        <path
          d="M66 90 C62 52 94 34 128 38 C164 42 184 68 178 96 C174 116 144 120 116 118 C86 116 68 106 66 90 Z"
          fill="#34D399"
          stroke="#065F46"
          strokeWidth="5"
          strokeLinejoin="round"
        />

        {/* Rosy Cheek */}
        <ellipse cx="114" cy="96" rx="10" ry="6" fill="#FDA4AF" opacity="0.85" />

        {/* Eye */}
        {isSleeping ? (
          <path
            d="M124 72 Q134 80 144 72"
            fill="none"
            stroke="#065F46"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        ) : isCheering ? (
          <path
            d="M124 74 Q134 62 144 74"
            fill="none"
            stroke="#065F46"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        ) : (
          <g>
            <circle cx="134" cy="72" r="11" fill="#FFFFFF" stroke="#065F46" strokeWidth="3" />
            <circle cx="137" cy="71" r="6" fill="#065F46" />
            <circle cx="139" cy="68" r="2.2" fill="#FFFFFF" />
          </g>
        )}

        {/* Sunglasses Accessory */}
        {hasSunglasses && (
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

        {/* Mouth */}
        {isTalking ? (
          <motion.ellipse
            cx="154"
            cy="95"
            rx="9"
            ry="7"
            fill="#FB7185"
            stroke="#065F46"
            strokeWidth="3.5"
            animate={{ ry: [4, 9, 4] }}
            transition={{ duration: 0.35, repeat: Infinity }}
          />
        ) : isCheering ? (
          <path
            d="M140 90 Q156 106 168 88 Z"
            fill="#FB7185"
            stroke="#065F46"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        ) : isThinking ? (
          <circle cx="154" cy="96" r="4.5" fill="#065F46" />
        ) : isSleeping ? (
          <path
            d="M148 96 Q156 100 162 96"
            fill="none"
            stroke="#065F46"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M138 92 Q154 104 168 90"
            fill="none"
            stroke="#065F46"
            strokeWidth="4"
            strokeLinecap="round"
          />
        )}

        {/* Crown Accessory */}
        {hasCrown && (
          <path
            d="M104 38 L108 18 L122 30 L132 14 L142 30 L156 18 L158 38 Z"
            fill="#FBBF24"
            stroke="#B45309"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        )}

        {/* Wizard Hat Accessory */}
        {hasWizard && (
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
