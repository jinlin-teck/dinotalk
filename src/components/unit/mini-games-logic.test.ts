import { describe, expect, it } from "vitest";
import { L0_UNITS } from "@/data/curriculum";
import {
  buildCvcSpellQuestions,
  buildRound1Questions,
  buildRound2Tiles,
  buildRound3Questions,
} from "./mini-games-logic";

function createDeterministicRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("MiniGamesTab question generators", () => {
  it("always includes every target word in Round 1 and Round 3 options across all L0 units (default and shuffled)", () => {
    for (const unit of L0_UNITS) {
      for (const opts of [undefined, { rng: createDeterministicRng(42 + unit.order) }]) {
        const r1 = buildRound1Questions(unit.vocab, opts);
        expect(r1).toHaveLength(3);
        for (const q of r1) {
          const ids = q.options.map((o) => o.id);
          expect(ids).toContain(q.target.id);
          expect(new Set(ids).size).toBe(ids.length);
        }

        const r2 = buildRound2Tiles(unit.vocab, opts);
        expect(r2).toHaveLength(6);
        const pairCounts = new Map<string, number>();
        for (const t of r2) {
          pairCounts.set(t.pairId, (pairCounts.get(t.pairId) ?? 0) + 1);
        }
        expect(pairCounts.size).toBe(3);
        for (const count of pairCounts.values()) {
          expect(count).toBe(2);
        }

        const r3 = buildRound3Questions(unit.vocab, opts);
        expect(r3).toHaveLength(3);
        for (const q of r3) {
          const ids = q.bubbles.map((b) => b.id);
          expect(ids).toContain(q.target.id);
          expect(new Set(ids).size).toBe(ids.length);
          expect(q.bubbles.length).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it("prioritizes weak words and guarantees them inside Unit 2 Round 3 bubbles", () => {
    const unit2 = L0_UNITS.find((u) => u.order === 2);
    expect(unit2).toBeDefined();
    const r3 = buildRound3Questions(unit2!.vocab, {
      rng: createDeterministicRng(7),
      priorityIds: ["u2-purple"],
    });
    const purpleQuestion = r3.find((q) => q.target.word === "purple");
    expect(purpleQuestion).toBeDefined();
    expect(purpleQuestion!.bubbles.some((b) => b.word === "purple")).toBe(true);
  });

  it("generates valid CVC spelling questions for units with CVC phonics items", () => {
    for (const unit of L0_UNITS.slice(1)) {
      const qs = buildCvcSpellQuestions(unit.phonics, createDeterministicRng(99));
      expect(qs.length).toBeGreaterThanOrEqual(1);
      for (const q of qs) {
        expect(q.parts).toHaveLength(3);
        expect(q.choices).toHaveLength(4);
        const letters = q.choices.map((c) => c.letter);
        for (const part of q.parts) {
          expect(letters).toContain(part);
        }
      }
    }
  });
});
