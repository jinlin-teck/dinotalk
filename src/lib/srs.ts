export const SRS_INTERVAL_DAYS = [0, 1, 2, 4, 7, 14] as const;

export interface SrsResult {
  masteryLevel: number;
  intervalDays: number;
  nextReviewAt: string;
}

/**
 * Gentle spaced-repetition schedule tailored for 7-year-old beginners:
 * - Correct answer advances mastery level by 1 (up to 5: 14 days).
 * - Wrong answer softens by at most 1 level (never resets straight to 0 from high levels)
 *   and schedules an immediate same-day gentle reinforcement.
 */
export function calculateNextReview(
  currentLevel: number,
  isCorrect: boolean,
  now: Date = new Date()
): SrsResult {
  const clamped = Math.max(0, Math.min(5, Math.floor(currentLevel)));
  const nextLevel = isCorrect
    ? Math.min(5, clamped + 1)
    : Math.max(0, clamped - 1);

  const intervalDays = isCorrect ? SRS_INTERVAL_DAYS[nextLevel] : 0;
  const nextDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    masteryLevel: nextLevel,
    intervalDays,
    nextReviewAt: nextDate.toISOString(),
  };
}

export function isDueForReview(
  nextReviewAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!nextReviewAt) return true;
  const ts = Date.parse(nextReviewAt);
  if (Number.isNaN(ts)) return true;
  return ts <= now.getTime();
}

/**
 * Determines whether a learned item currently needs focused reinforcement.
 * Items that were missed once in the past graduate out of weak status once
 * the child builds masteryLevel >= 3 and the item is not due for review.
 */
export function isMasteryItemWeak(
  item: {
    masteryLevel: number;
    wrongCount: number;
    nextReviewAt?: string | null;
  },
  now: Date = new Date()
): boolean {
  if (item.masteryLevel <= 1) return true;
  if (item.nextReviewAt && isDueForReview(item.nextReviewAt, now)) return true;
  if (item.masteryLevel <= 2 && item.wrongCount > 0) return true;
  return false;
}

export function sortReviewQueue<
  T extends { nextReviewAt: string | null; masteryLevel: number }
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.masteryLevel !== b.masteryLevel) {
      return a.masteryLevel - b.masteryLevel;
    }
    const ta = a.nextReviewAt ? Date.parse(a.nextReviewAt) : 0;
    const tb = b.nextReviewAt ? Date.parse(b.nextReviewAt) : 0;
    return ta - tb;
  });
}
