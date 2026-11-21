import { describe, expect, it } from "vitest";
import {
  SRS_INTERVAL_DAYS,
  calculateNextReview,
  isDueForReview,
  isMasteryItemWeak,
  sortReviewQueue,
} from "./srs";

describe("SRS spaced repetition scheduler", () => {
  const fixedNow = new Date("2026-11-20T08:00:00.000Z");

  it("advances mastery levels with expected intervals", () => {
    expect(SRS_INTERVAL_DAYS).toEqual([0, 1, 2, 4, 7, 14]);

    const r1 = calculateNextReview(0, true, fixedNow);
    expect(r1.masteryLevel).toBe(1);
    expect(r1.intervalDays).toBe(1);

    const r5 = calculateNextReview(4, true, fixedNow);
    expect(r5.masteryLevel).toBe(5);
    expect(r5.intervalDays).toBe(14);

    // Caps at level 5
    const rMax = calculateNextReview(5, true, fixedNow);
    expect(rMax.masteryLevel).toBe(5);
    expect(rMax.intervalDays).toBe(14);
  });

  it("softly steps down by 1 on wrong answer without resetting to zero from high level", () => {
    const rDown = calculateNextReview(4, false, fixedNow);
    expect(rDown.masteryLevel).toBe(3);
    expect(rDown.intervalDays).toBe(0);
    expect(rDown.nextReviewAt).toBe(fixedNow.toISOString());

    const rZero = calculateNextReview(0, false, fixedNow);
    expect(rZero.masteryLevel).toBe(0);
  });

  it("determines due status and sorts lowest mastery & earliest due first", () => {
    expect(isDueForReview("2026-11-20T07:59:59.000Z", fixedNow)).toBe(true);
    expect(isDueForReview("2026-11-21T08:00:00.000Z", fixedNow)).toBe(false);
    expect(isDueForReview(null, fixedNow)).toBe(true);

    const sorted = sortReviewQueue([
      { id: "c", masteryLevel: 3, nextReviewAt: "2026-11-19T00:00:00.000Z" },
      { id: "b", masteryLevel: 1, nextReviewAt: "2026-11-20T01:00:00.000Z" },
      { id: "a", masteryLevel: 1, nextReviewAt: "2026-11-18T00:00:00.000Z" },
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("graduates items with a past mistake out of weak status once masteryLevel >= 3 and not due", () => {
    const future = "2026-11-27T08:00:00.000Z";
    const past = "2026-11-19T08:00:00.000Z";

    // Low mastery or wrong at Lv.2 is weak
    expect(isMasteryItemWeak({ masteryLevel: 1, wrongCount: 0, nextReviewAt: future }, fixedNow)).toBe(true);
    expect(isMasteryItemWeak({ masteryLevel: 2, wrongCount: 1, nextReviewAt: future }, fixedNow)).toBe(true);

    // Mastered to Lv.3..5 and not due is no longer weak even if wrongCount > 0 historically
    expect(isMasteryItemWeak({ masteryLevel: 3, wrongCount: 1, nextReviewAt: future }, fixedNow)).toBe(false);
    expect(isMasteryItemWeak({ masteryLevel: 5, wrongCount: 2, nextReviewAt: future }, fixedNow)).toBe(false);

    // Due items still need attention
    expect(isMasteryItemWeak({ masteryLevel: 4, wrongCount: 0, nextReviewAt: past }, fixedNow)).toBe(true);
  });
});
