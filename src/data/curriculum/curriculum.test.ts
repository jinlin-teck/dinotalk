import { describe, expect, it } from "vitest";
import { CURRICULUM_LEVELS, L0_UNITS, getAllPhonics, getAllVocab } from "./index";

describe("L0-L2 Curriculum Integrity", () => {
  it("defines L0 active + L1/L2 upcoming roadmap", () => {
    expect(CURRICULUM_LEVELS.map((l) => l.id)).toEqual(["L0", "L1", "L2"]);
    expect(CURRICULUM_LEVELS[0].status).toBe("active");
    expect(CURRICULUM_LEVELS[1].status).toBe("upcoming");
    expect(CURRICULUM_LEVELS[2].status).toBe("upcoming");
  });

  it("delivers 10 sequential L0 units with full vocab, sentences, phonics, and 3-goal roleplays", () => {
    expect(L0_UNITS).toHaveLength(10);
    L0_UNITS.forEach((unit, i) => {
      expect(unit.order).toBe(i + 1);
      expect(unit.vocab.length).toBeGreaterThanOrEqual(6);
      expect(unit.sentences.length).toBeGreaterThanOrEqual(3);
      expect(unit.phonics.length).toBeGreaterThanOrEqual(2);
      expect(unit.roleplay.goals).toHaveLength(3);
      expect(unit.roleplay.openingSuggestions.length).toBeGreaterThanOrEqual(2);
      unit.roleplay.goals.forEach((g) => {
        expect(g.keywords.length).toBeGreaterThan(0);
        expect(unit.roleplay.goalReplies[g.id]).toBeDefined();
      });
    });
  });

  it("covers all 26 A-Z letters across U1-U9 and CVC blending in U10", () => {
    const letters = new Set<string>();
    for (const unit of L0_UNITS.slice(0, 9)) {
      for (const item of unit.phonics) {
        letters.add(item.letter);
      }
    }
    expect(letters.size).toBe(26);
    for (let code = 65; code <= 90; code++) {
      expect(letters.has(String.fromCharCode(code))).toBe(true);
    }

    const u10 = L0_UNITS[9];
    expect(u10.phonics.every((p) => p.isCvc)).toBe(true);
    expect(u10.phonics.length).toBeGreaterThanOrEqual(6);
  });

  it("has globally unique vocab IDs and phonics IDs", () => {
    const vocab = getAllVocab();
    const phonics = getAllPhonics();
    expect(vocab.length).toBeGreaterThanOrEqual(75);
    expect(new Set(vocab.map((v) => v.id)).size).toBe(vocab.length);
    expect(new Set(phonics.map((p) => p.id)).size).toBe(phonics.length);
  });
});
