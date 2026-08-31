/** The budgeted store: what a real analytical engine lets you see.
 *
 * Every serious store puts a ceiling on what one query may cost, and the
 * ceiling is correct engineering. The danger is the shape it gives to
 * failure: a query over budget does not fail loudly, it comes back partial
 * or empty, and partial-or-empty is exactly what a true negative looks
 * like. This simulator reproduces the four ways a zero can happen, and
 * stamps an execution record honest enough to tell them apart. */

import type { EventRecord, World } from './world.ts';

export interface Scope {
  sources: string[];
  /** [start, end) in epoch days */
  window: [number, number];
  /** one subject, or a pair for a relationship question */
  subjects: [string] | [string, string];
}

export interface QueryOptions {
  /** rows the engine may scan before the query is cut off */
  scanBudget?: number;
  /** tolerate a predicate on a field that exists nowhere: the engine runs
   *  it anyway and every row fails it, so the query runs perfectly and asks
   *  the wrong thing (the malformed-zero failure mode; a validating engine
   *  refuses instead) */
  tolerateUnknownPredicates?: boolean;
  /** extra predicate on a field name; only 'source'|'from'|'to' exist */
  predicateField?: string;
  predicateValue?: string;
}

export interface Execution {
  completed: boolean;
  scanned: number;
  matched: number;
  truncatedAt: number | null;
  /** per source: fraction of the requested window actually searchable,
   *  after outages and ingestion lag */
  windowCovered: Record<string, number>;
  /** predicates on fields that exist nowhere, run anyway instead of rejected */
  unknownPredicates: string[];
  unknownSources: string[];
}

export interface QueryResult {
  rows: EventRecord[];
  execution: Execution;
}

const FIELDS = new Set(['source', 'from', 'to']);

/** Run a scoped query against the world, under the store's budgets. */
export function query(world: World, scope: Scope, opts: QueryOptions = {}): QueryResult {
  const unknownPredicates: string[] = [];
  let predicate: ((e: EventRecord) => boolean) | null = null;
  if (opts.predicateField != null) {
    if (FIELDS.has(opts.predicateField)) {
      const f = opts.predicateField as keyof EventRecord;
      predicate = (e) => String(e[f]) === opts.predicateValue;
    } else if (opts.tolerateUnknownPredicates) {
      unknownPredicates.push(opts.predicateField);
      predicate = () => false; // no row carries the field, so no row matches
    } else {
      throw new Error(`unknown field in predicate: "${opts.predicateField}"`);
    }
  }

  const unknownSources = scope.sources.filter((s) => !world.sources.some((p) => p.name === s));
  const profiles = world.sources.filter((p) => scope.sources.includes(p.name));

  // What part of the requested window is actually searchable per source.
  const windowCovered: Record<string, number> = {};
  const searchable = new Map<string, Array<[number, number]>>();
  for (const p of profiles) {
    const [ws, weRequested] = scope.window;
    const we = Math.min(weRequested, world.now - p.ingestionLagDays);
    let spans: Array<[number, number]> = we > ws ? [[ws, we]] : [];
    for (const [os, oe] of p.outages) {
      spans = spans.flatMap(([s, e]) => {
        const parts: Array<[number, number]> = [];
        if (os > s) parts.push([s, Math.min(e, os)]);
        if (oe < e) parts.push([Math.max(s, oe), e]);
        return parts.filter(([a, b]) => b > a);
      });
    }
    searchable.set(p.name, spans);
    const total = scope.window[1] - scope.window[0];
    const covered = spans.reduce((sum, [a, b]) => sum + (b - a), 0);
    windowCovered[p.name] = total > 0 ? covered / total : 0;
  }

  const inSubjects = (e: EventRecord): boolean =>
    scope.subjects.length === 1
      ? e.from === scope.subjects[0] || e.to === scope.subjects[0]
      : (e.from === scope.subjects[0] && e.to === scope.subjects[1]) ||
        (e.from === scope.subjects[1] && e.to === scope.subjects[0]);

  // The scan walks time order across everything the scope touches; density
  // prices the question before a single comparison happens.
  const budget = opts.scanBudget ?? Infinity;
  const rows: EventRecord[] = [];
  let scanned = 0;
  let truncatedAt: number | null = null;
  for (const e of world.events) {
    if (!scope.sources.includes(e.source)) continue;
    const spans = searchable.get(e.source) ?? [];
    if (!spans.some(([a, b]) => e.t >= a && e.t < b)) continue;
    if (scanned >= budget) {
      truncatedAt = e.t;
      break;
    }
    scanned++;
    if (!inSubjects(e)) continue;
    if (predicate && !predicate(e)) continue;
    rows.push(e);
  }

  return {
    rows,
    execution: {
      completed: truncatedAt === null,
      scanned,
      matched: rows.length,
      truncatedAt,
      windowCovered,
      unknownPredicates,
      unknownSources
    }
  };
}
