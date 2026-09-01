/** The upgrade: from "no matching records" to "absence supported within
 * scope". The gap between those statements is a checklist, and it belongs
 * in code rather than in an analyst's head. Any requirement unmet, and the
 * result STAYS an observation, with the failing condition named; "we did
 * not finish looking" and "there was nothing to find" never share a
 * sentence. */

import type { QueryResult, Scope } from './store.ts';

export interface Requirement {
  name: string;
  ok: boolean;
  detail: string;
}

export type AbsenceVerdict =
  | {
      kind: 'present';
      evidence: { count: number; firstAt: number };
      /** requirement failures still worth knowing about: a hit from a
       * truncated or half-covered read is a hit, but not the whole story */
      caveats: string[];
    }
  | {
      kind: 'absent-within-scope';
      /** the claim carries its scope the way a measurement carries units */
      scope: Scope;
      census: { scanned: number; windowCovered: Record<string, number> };
      statement: string;
    }
  | {
      kind: 'observation';
      failed: Requirement[];
      statement: string;
    };

export interface UpgradeOptions {
  /** minimum searchable fraction of the window, per source, for coverage
   *  to count as complete */
  coverageFloor?: number;
}

/** Check every requirement; return them all, passed and failed. */
export function requirements(result: QueryResult, scope: Scope, opts: UpgradeOptions = {}): Requirement[] {
  const floor = opts.coverageFloor ?? 1;
  const ex = result.execution;
  const out: Requirement[] = [];

  out.push({
    name: 'query.valid',
    ok:
      ex.unknownPredicates.length === 0 &&
      ex.unknownSources.length === 0 &&
      ex.unknownSubjects.length === 0,
    detail:
      ex.unknownPredicates.length > 0
        ? `predicate on a field that exists nowhere: ${ex.unknownPredicates.join(', ')}; the query ran perfectly and asked the wrong thing`
        : ex.unknownSources.length > 0
          ? `unknown source: ${ex.unknownSources.join(', ')}`
          : ex.unknownSubjects.length > 0
            ? `subject that exists nowhere: ${ex.unknownSubjects.join(', ')}; every row failed the join, so the zero is about the identifier and not about the world`
            : 'the question parsed, every predicate resolved, and every subject exists'
  });

  out.push({
    name: 'search.completed',
    ok: ex.completed,
    detail: ex.completed
      ? `scan finished (${ex.scanned} rows examined)`
      : `scan cut off at t=${ex.truncatedAt?.toFixed(1)} after ${ex.scanned} rows; the emptiness of a search abandoned`
  });

  for (const source of scope.sources) {
    const covered = ex.windowCovered[source] ?? 0;
    out.push({
      name: `coverage.${source}`,
      ok: covered >= floor,
      detail:
        covered >= floor
          ? `window fully searchable`
          : `only ${(covered * 100).toFixed(0)}% of the window searchable (outage or ingestion lag)`
    });
  }

  // No per-subject coverage row: in this simulator both sides of a
  // relationship claim read the same sources over the same window, so a
  // separate check would be a permanently-green light. With per-subject
  // collection, the both-sides rule needs its own requirement; see the
  // article.
  return out;
}

/** Upgrade an observation into an absence claim, or refuse to. */
export function upgrade(result: QueryResult, scope: Scope, opts: UpgradeOptions = {}): AbsenceVerdict {
  if (result.rows.length > 0) {
    // The discipline applies to hits too: a row found by a truncated or
    // malformed read is still a row, but the claim carries its caveats.
    const caveats = requirements(result, scope, opts)
      .filter((r) => !r.ok)
      .map((r) => `${r.name}: ${r.detail}`);
    return {
      kind: 'present',
      evidence: { count: result.rows.length, firstAt: result.rows[0].t },
      caveats
    };
  }
  const checks = requirements(result, scope, opts);
  const failed = checks.filter((r) => !r.ok);
  if (failed.length > 0) {
    return {
      kind: 'observation',
      failed,
      statement: `no matching evidence found; absence NOT established (${failed
        .map((f) => f.name)
        .join(', ')} unmet)`
    };
  }
  const windowText = `days ${scope.window[0]} to ${scope.window[1]}`;
  return {
    kind: 'absent-within-scope',
    scope,
    census: { scanned: result.execution.scanned, windowCovered: result.execution.windowCovered },
    statement: `no qualifying record exists in ${scope.sources.join(', ')} over ${windowText} (${result.execution.scanned} rows examined, window fully covered)`
  };
}

/** The naive reading every fluent system defaults to: zero rows means it
 * never happened. Kept here so the eval can measure exactly how often
 * that substitution lies. */
export function naiveAbsence(result: QueryResult): boolean {
  return result.rows.length === 0;
}
