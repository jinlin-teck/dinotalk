"use client";

import { SCENE_PALETTES } from "./visual-keys";

interface SceneArtworkProps {
  sceneKey: string;
  className?: string;
}

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
