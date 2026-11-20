import { describe, expect, it } from "vitest";
import { normalizeSpeechText, scorePronunciation } from "./pronunciation-scorer";

describe("PronunciationScorer for 7yo beginners", () => {
  it("normalizes contractions and punctuation cleanly", () => {
    expect(normalizeSpeechText("I'm seven!")).toBe("i am seven");
    expect(normalizeSpeechText("It's a panda?")).toBe("it is a panda");
  });

  it("gives 3 stars on exact or near-exact matches", () => {
    const res = scorePronunciation("Hello, Dino!", "hello dino");
    expect(res.stars).toBe(3);
    expect(res.passed).toBe(true);
    expect(res.score).toBe(100);
  });

  it("forgives common STT homophones for beginner words", () => {
    const oneRes = scorePronunciation("won", "one");
    expect(oneRes.passed).toBe(true);
    expect(oneRes.stars).toBe(3);

    const fourRes = scorePronunciation("for", "four");
    expect(fourRes.passed).toBe(true);
    expect(fourRes.stars).toBe(3);
  });

  it("handles empty speech and multi-word sentences encouragingly", () => {
    const emptyRes = scorePronunciation("", "apple");
    expect(emptyRes.passed).toBe(false);
    expect(emptyRes.stars).toBe(1);

    const sentenceRes = scorePronunciation("apple please", "An apple, please!");
    expect(sentenceRes.passed).toBe(true);
    expect(sentenceRes.stars).toBeGreaterThanOrEqual(2);
  });
});
