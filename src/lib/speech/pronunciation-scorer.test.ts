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

  it("normalizes Arabic numerals (0-20) and forgives common child ASR homophones", () => {
    expect(normalizeSpeechText("I am 7!")).toBe("i am seven");
    expect(scorePronunciation("7", "seven")).toMatchObject({
      score: 100,
      stars: 3,
      passed: true,
    });
    expect(scorePronunciation("10", "ten")).toMatchObject({
      score: 100,
      stars: 3,
      passed: true,
    });
    expect(scorePronunciation("tree", "three").passed).toBe(true);
    expect(scorePronunciation("know", "no").passed).toBe(true);
  });

  it("does not give full score on substring containment, empty targets, or distinct CVC words", () => {
    const breadVsRed = scorePronunciation("bread", "red");
    expect(breadVsRed.score).toBeLessThan(100);

    const emptyTarget = scorePronunciation("hello", "");
    expect(emptyTarget.passed).toBe(false);
    expect(emptyTarget.score).toBe(0);

    const catVsHat = scorePronunciation("cat", "hat");
    expect(catVsHat.score).toBeLessThan(80);
  });
});
