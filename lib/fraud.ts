// Fraud score for a conversion, 0–100 (pure, unit-tested). >= HOLD is held
// for manual review: never auto-approved, flagged in the conversion lists.

export const HOLD = 70;

export type Signals = {
  /** Seconds from click to conversion; null if the click record is missing. */
  ctit: number | null;
  /** Click may legitimately be gone (older than raw-click retention). */
  clickExpected: boolean;
  clickBot: boolean;
  clickDuplicate: boolean;
  /** Earlier conversions on this offer from the same IP today. */
  sameIpToday: number;
  /** Publisher's conversion rate today and over the previous 7 days (0–1). */
  pubCrToday: number;
  pubCr7d: number;
  pubClicksToday: number;
  pubConvToday: number;
  /** Label of the click's traffic source if the offer disallows it. */
  disallowedSource?: string | null;
};

export function fraudScore(s: Signals): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const add = (n: number, why: string) => { score += n; reasons.push(why); };

  // An offer rule broken outright: hold for review regardless of other signals.
  if (s.disallowedSource) add(HOLD, `disallowed traffic source: ${s.disallowedSource}`);

  if (s.ctit === null) {
    if (s.clickExpected) add(30, 'no click record');
  } else if (s.ctit < 10) {
    add(60, `converted ${Math.max(0, Math.round(s.ctit))}s after click`);
  } else if (s.ctit < 30) {
    add(25, `converted ${Math.round(s.ctit)}s after click`);
  }
  if (s.clickBot) add(40, 'bot click');
  if (s.clickDuplicate) add(20, 'duplicate click');
  if (s.sameIpToday >= 3) add(30, `${s.sameIpToday + 1} conversions from one IP today`);
  if (s.pubClicksToday >= 20 && s.pubConvToday >= 5 && s.pubCr7d > 0 && s.pubCrToday > 5 * s.pubCr7d) {
    add(30, `conversion rate ${(s.pubCrToday * 100).toFixed(1)}% vs ${(s.pubCr7d * 100).toFixed(1)}% usual`);
  }
  return { score: Math.min(100, score), reasons };
}
