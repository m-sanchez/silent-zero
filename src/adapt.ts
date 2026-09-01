/** Adapters: a real engine's execution record, mapped onto this one.
 *
 * `Execution` (store.ts) is this repo's own invention, and until something
 * produces one from a real query the taxonomy is a diagram. These take the
 * response object your client already parsed — no client, no network, no
 * dependency — and map what an engine actually reports onto what the
 * checklist actually asks. Two rules hold throughout: nothing is guessed,
 * and where the engine is silent the adapter withholds coverage rather than
 * assuming it. An adapter that assumed would be manufacturing exactly the
 * confidence this library exists to withhold.
 *
 * What no engine can tell you is whether the identifiers in your filter are
 * real. Pass `knownSources` / `knownSubjects` from your catalogue and the
 * phantom-entity zero is caught here too; leave them out and `query.valid`
 * has nothing to check, which is a hole in your evidence and not in this
 * code. */

import type { Execution, Scope } from './store.ts';

export interface AdaptOptions {
  /** rows the engine examined. Neither Elasticsearch nor BigQuery reports
   *  such a figure — they report matches and bytes — so the census falls
   *  back to the match count: a floor on the work done, never an
   *  overstatement of it. Pass the real number if your engine has one. */
  rowsExamined?: number;
  /** every source name your catalogue knows. Without it an adapter cannot
   *  tell an index from a typo. */
  knownSources?: string[];
  /** every subject identifier your catalogue knows, or a predicate over
   *  them. This is the only place an adapter can catch a phantom entity. */
  knownSubjects?: string[] | ((id: string) => boolean);
  /** predicate fields the engine tolerated instead of rejecting: an
   *  unmapped Elasticsearch field, a lenient JSON path, a column that
   *  quietly resolved to NULL for every row. */
  unknownPredicates?: string[];
}

const DAY_MS = 86_400_000;

const unknownAgainst = (
  values: readonly string[],
  known: string[] | ((id: string) => boolean) | undefined
): string[] => {
  if (known === undefined) return [];
  const has = typeof known === 'function' ? known : (id: string) => known.includes(id);
  return values.filter((v) => !has(v));
};

const toNumber = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

// --------------------------------------------------------------- Elasticsearch

export interface ElasticsearchResponse {
  timed_out?: boolean;
  terminated_early?: boolean;
  _shards?: { total?: number; successful?: number; skipped?: number; failed?: number };
  hits?: { total?: number | { value?: number; relation?: string }; hits?: unknown[] };
  aggregations?: Record<string, unknown>;
}

export interface ElasticsearchOptions extends AdaptOptions {
  /** count can_match-skipped shards as searched. Elasticsearch skips a shard
   *  when that shard's own range metadata proves it cannot match, so the
   *  default is true; set false when you do not trust the pre-filter. */
  skippedShardsSearched?: boolean;
}

/** A terms aggregation that dropped buckets answered a different question
 *  from the one asked, wherever in the tree it happened. */
const bucketsDropped = (node: unknown, depth = 0): boolean => {
  if (depth > 8 || node === null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((n) => bucketsDropped(n, depth + 1));
  const o = node as Record<string, unknown>;
  const other = o['sum_other_doc_count'];
  const error = o['doc_count_error_upper_bound'];
  if (typeof other === 'number' && other > 0) return true;
  if (typeof error === 'number' && error > 0) return true;
  return Object.values(o).some((n) => bucketsDropped(n, depth + 1));
};

/** Build an `Execution` from a parsed Elasticsearch search response.
 *
 * - `timed_out`, `terminated_early` -> `completed: false`
 * - `hits.total.relation === 'gte'` -> `completed: false`; a lower bound is
 *   not a census, and a question answered with a bound cannot settle a zero
 * - dropped aggregation buckets -> `completed: false`
 * - `_shards.failed` -> `windowCovered` below 1: a shard that errored is a
 *   slice of the index nobody searched
 * - `_shards.skipped` -> coverage only when you pass
 *   `skippedShardsSearched: false`
 * - `hits.total.value` -> `matched`, and `scanned` unless you pass
 *   `rowsExamined`
 *
 * `truncatedAt` stays null: Elasticsearch reports that a search stopped,
 * never where it stopped, and inventing a cut-off point would be a
 * fabrication in the one place this library has to be exact. */
export function fromElasticsearch(
  response: ElasticsearchResponse,
  scope: Scope,
  opts: ElasticsearchOptions = {}
): Execution {
  const hits = response.hits ?? {};
  const total = typeof hits.total === 'number' ? { value: hits.total, relation: 'eq' } : (hits.total ?? {});
  const matched = total.value ?? hits.hits?.length ?? 0;

  const shards = response._shards ?? {};
  const shardTotal = shards.total ?? 0;
  const unsearchedShards =
    (shards.failed ?? 0) + (opts.skippedShardsSearched === false ? (shards.skipped ?? 0) : 0);
  const shardCoverage = shardTotal > 0 ? clamp01((shardTotal - unsearchedShards) / shardTotal) : 1;

  const unknownSources = unknownAgainst(scope.sources, opts.knownSources);
  const windowCovered: Record<string, number> = {};
  for (const source of scope.sources) {
    // An index nobody could resolve was searched over none of the window.
    windowCovered[source] = unknownSources.includes(source) ? 0 : shardCoverage;
  }

  return {
    completed:
      response.timed_out !== true &&
      response.terminated_early !== true &&
      total.relation !== 'gte' &&
      !bucketsDropped(response.aggregations),
    scanned: opts.rowsExamined ?? matched,
    matched,
    truncatedAt: null,
    windowCovered,
    unknownPredicates: opts.unknownPredicates ?? [],
    unknownSources,
    unknownSubjects: unknownAgainst(scope.subjects, opts.knownSubjects)
  };
}

// -------------------------------------------------------------------- BigQuery

export interface BigQueryJob {
  jobComplete?: boolean;
  status?: {
    state?: string;
    errorResult?: { reason?: string; message?: string } | null;
    errors?: Array<{ reason?: string; message?: string }>;
  };
  configuration?: { query?: { maximumBytesBilled?: string | number } };
  statistics?: {
    /** milliseconds since the epoch, as BigQuery reports it */
    endTime?: string | number;
    query?: {
      cacheHit?: boolean;
      totalBytesProcessed?: string | number;
      totalBytesBilled?: string | number;
      totalPartitionsProcessed?: string | number;
    };
  };
  totalRows?: string | number;
}

export interface BigQueryOptions extends AdaptOptions {
  /** when the answer was computed, in epoch days. Defaults to
   *  `statistics.endTime`. A cached answer knows nothing about the part of
   *  the window that came after it. */
  computedAt?: number;
  /** partitions the question needed. BigQuery reports how many it read;
   *  only you know how many it should have. */
  partitionsRequested?: number;
}

/** Build an `Execution` from a parsed BigQuery job resource.
 *
 * - `jobComplete: false`, `status.errorResult`, or any non-fatal
 *   `status.errors` -> `completed: false`
 * - bytes billed at `maximumBytesBilled` -> `completed: false`: the ceiling
 *   was reached, and what stops at a ceiling did not finish
 * - `query.cacheHit` -> coverage only up to the instant the answer was
 *   computed. A cache hit is a real zero from a real search, just not from
 *   this moment; the rest of the window was never looked at
 * - partitions read against `partitionsRequested` -> coverage below 1
 * - `totalRows` -> `matched`, and `scanned` unless you pass `rowsExamined`
 *
 * Scope windows are in epoch days, so `endTime` is converted. With no
 * timestamp at all there is no way to price the staleness of a cache hit,
 * and the adapter claims no coverage rather than guessing at it. */
export function fromBigQuery(job: BigQueryJob, scope: Scope, opts: BigQueryOptions = {}): Execution {
  const q = job.statistics?.query ?? {};
  const matched = toNumber(job.totalRows) ?? 0;

  const ceiling = toNumber(job.configuration?.query?.maximumBytesBilled);
  const billed = toNumber(q.totalBytesBilled) ?? toNumber(q.totalBytesProcessed);
  const hitCeiling = ceiling !== null && billed !== null && billed >= ceiling;
  const errored = job.status?.errorResult != null || (job.status?.errors?.length ?? 0) > 0;

  const [start, end] = scope.window;
  const span = end - start;
  const endMs = toNumber(job.statistics?.endTime);
  const computedAt = opts.computedAt ?? (endMs === null ? null : endMs / DAY_MS);
  const freshness =
    q.cacheHit !== true
      ? 1
      : computedAt === null || span <= 0
        ? 0
        : clamp01((computedAt - start) / span);

  const partitionsRead = toNumber(q.totalPartitionsProcessed);
  const partitionCoverage =
    opts.partitionsRequested !== undefined && opts.partitionsRequested > 0 && partitionsRead !== null
      ? clamp01(partitionsRead / opts.partitionsRequested)
      : 1;

  const unknownSources = unknownAgainst(scope.sources, opts.knownSources);
  const windowCovered: Record<string, number> = {};
  for (const source of scope.sources) {
    windowCovered[source] = unknownSources.includes(source) ? 0 : freshness * partitionCoverage;
  }

  return {
    completed: job.jobComplete !== false && !errored && !hitCeiling,
    scanned: opts.rowsExamined ?? matched,
    matched,
    truncatedAt: null,
    windowCovered,
    unknownPredicates: opts.unknownPredicates ?? [],
    unknownSources,
    unknownSubjects: unknownAgainst(scope.subjects, opts.knownSubjects)
  };
}
