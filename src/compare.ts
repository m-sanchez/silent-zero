/** Baseline comparability: the quantitative cousin of the absence problem.
 *
 * "Activity fell by 80%" divides one window's count by another's, and is
 * only as true as both denominators are complete. A truncated week does
 * not look wrong next to a complete one; it looks like a drop. Two windows
 * may be compared only when both were observed under conditions complete
 * enough for the claim; a period that failed its coverage checks cannot
 * silently serve as anyone's baseline. */

import { requirements } from './claim.ts';
import type { QueryResult, Scope } from './store.ts';

export type Comparison =
  | {
      kind: 'comparable';
      counts: [number, number];
      /** counts[1] relative to counts[0]; -0.8 reads as an 80% drop */
      change: number;
    }
  | {
      kind: 'not-comparable';
      /** which window failed, and why */
      failing: Array<{ window: 0 | 1; name: string; detail: string }>;
      statement: string;
    };

export function compareWindows(
  a: { result: QueryResult; scope: Scope },
  b: { result: QueryResult; scope: Scope }
): Comparison {
  const failing: Array<{ window: 0 | 1; name: string; detail: string }> = [];
  ([a, b] as const).forEach((side, i) => {
    for (const r of requirements(side.result, side.scope)) {
      if (!r.ok) failing.push({ window: i as 0 | 1, name: r.name, detail: r.detail });
    }
  });
  if (failing.length > 0) {
    return {
      kind: 'not-comparable',
      failing,
      statement: `windows are not comparable: ${failing
        .map((f) => `window ${f.window}: ${f.name}`)
        .join('; ')}. A capped week next to a complete one is not a trend, it is an artifact of the budget.`
    };
  }
  const counts: [number, number] = [a.result.rows.length, b.result.rows.length];
  if (counts[0] === 0) {
    // The repo about zero denominators does not ship a divide-by-zero as
    // a comparison. A zero baseline is not a small baseline.
    return {
      kind: 'not-comparable',
      failing: [{ window: 0, name: 'baseline.nonzero', detail: 'the baseline window has zero qualifying rows' }],
      statement:
        'windows are not comparable: the baseline is zero, so there is no denominator to compare against. "Up from nothing" is not a trend.'
    };
  }
  const change = counts[1] / counts[0] - 1;
  return { kind: 'comparable', counts, change };
}
