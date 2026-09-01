import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { naiveAbsence, requirements, upgrade } from '../src/claim.ts';
import { fromBigQuery, fromElasticsearch } from '../src/adapt.ts';
import { compareWindows } from '../src/compare.ts';
import { cases, runEval, runSweep } from '../src/evaluate.ts';
import { query } from '../src/store.ts';
import { generateWorld, trueInteractions } from '../src/world.ts';

const world = generateWorld(7);

test('the world is deterministic in its seed', () => {
  const again = generateWorld(7);
  assert.equal(world.events.length, again.events.length);
  assert.deepEqual(world.events[100], again.events[100]);
  assert.notEqual(generateWorld(8).events.length, world.events.length);
});

test('the planted absence holds: brakewater and greyfield never interact', () => {
  assert.equal(trueInteractions(world, 'acct-brakewater', 'acct-greyfield', [0, 90]).length, 0);
});

test('the planted presence holds: copperline reached dunmore via telemetry only', () => {
  const all = trueInteractions(world, 'acct-copperline', 'acct-dunmore', [0, 90]);
  assert.ok(all.length >= 3);
  assert.ok(all.every((e) => e.source === 'telemetry'));
});

test('an honest zero upgrades to absence, and the claim carries its scope', () => {
  const scope = {
    sources: ['transactions'],
    window: [10, 70] as [number, number],
    subjects: ['acct-brakewater', 'acct-greyfield'] as [string, string]
  };
  const verdict = upgrade(query(world, scope), scope);
  assert.equal(verdict.kind, 'absent-within-scope');
  assert.match((verdict as { statement: string }).statement, /rows examined, window fully covered/);
});

test('a truncated search never upgrades: incomplete zero stays an observation', () => {
  const scope = {
    sources: ['transactions', 'messages', 'telemetry'],
    window: [0, 90] as [number, number],
    subjects: ['acct-copperline', 'acct-dunmore'] as [string, string]
  };
  const result = query(world, scope, { scanBudget: 25_000 });
  assert.equal(result.rows.length, 0, 'the budget dies before the telemetry tail');
  assert.ok(naiveAbsence(result), 'the naive reading calls this absent');
  const verdict = upgrade(result, scope);
  assert.equal(verdict.kind, 'observation');
  assert.match((verdict as { statement: string }).statement, /NOT established/);
  const failed = (verdict as { failed: Array<{ name: string }> }).failed.map((f) => f.name);
  assert.ok(failed.includes('search.completed'));
});

test('an outage window is a coverage zero, not an absence', () => {
  const scope = {
    sources: ['messages'],
    window: [40, 46] as [number, number],
    subjects: ['acct-brakewater', 'acct-greyfield'] as [string, string]
  };
  const verdict = upgrade(query(world, scope), scope);
  assert.equal(verdict.kind, 'observation');
  const failed = (verdict as { failed: Array<{ name: string }> }).failed.map((f) => f.name);
  assert.ok(failed.includes('coverage.messages'));
});

test('a tolerated unknown predicate is a malformed zero and fails query.valid', () => {
  const scope = {
    sources: ['transactions'],
    window: [10, 70] as [number, number],
    subjects: ['acct-brakewater', 'acct-greyfield'] as [string, string]
  };
  const result = query(world, scope, {
    tolerateUnknownPredicates: true,
    predicateField: 'chanel',
    predicateValue: 'wire'
  });
  const verdict = upgrade(result, scope);
  assert.equal(verdict.kind, 'observation');
  assert.match((verdict as { statement: string }).statement, /query.valid/);
});

test('a validating engine rejects the unknown field instead of running', () => {
  const scope = {
    sources: ['transactions'],
    window: [10, 70] as [number, number],
    subjects: ['acct-brakewater'] as [string]
  };
  assert.throws(() => query(world, scope, { predicateField: 'chanel' }), /unknown field/);
});

test('ingestion lag trims the freshest slice and blocks the upgrade', () => {
  const scope = {
    sources: ['telemetry'],
    window: [80, 90] as [number, number],
    subjects: ['acct-brakewater', 'acct-greyfield'] as [string, string]
  };
  const result = query(world, scope);
  assert.ok((result.execution.windowCovered['telemetry'] ?? 1) < 1);
  assert.equal(upgrade(result, scope).kind, 'observation');
});

test('the eval: the naive reading fails broadly, the discipline only on a relaxed floor', () => {
  const report = runEval(7);
  assert.equal(report.naiveFalseZeros, 7, 'seven planted presences read as absences');
  assert.equal(report.disciplineFalseZeros, 1);
  assert.deepEqual(
    report.outcomes.filter((o) => o.disciplineFalseZero).map((o) => o.id),
    ['relaxed-floor-zero'],
    'the one claim it gets wrong is the one it was told it could make at half coverage'
  );
  assert.equal(report.honestZerosClaimed, 3, 'three true absences claimed, scope attached');
  const buried = report.outcomes.find((o) => o.id === 'not-a-zero')!;
  assert.equal(buried.disciplineVerdict, 'present');
});

test('a capped window cannot serve as a baseline', () => {
  const scopeA = {
    sources: ['transactions'],
    window: [10, 20] as [number, number],
    subjects: ['acct-eastgate'] as [string]
  };
  const scopeB = { ...scopeA, window: [20, 30] as [number, number] };
  const complete = { result: query(world, scopeA), scope: scopeA };
  const capped = { result: query(world, scopeB, { scanBudget: 10 }), scope: scopeB };
  const comparison = compareWindows(complete, capped);
  assert.equal(comparison.kind, 'not-comparable');
  assert.match((comparison as { statement: string }).statement, /artifact of the budget/);

  const alsoComplete = { result: query(world, scopeB), scope: scopeB };
  const fair = compareWindows(complete, alsoComplete);
  assert.equal(fair.kind, 'comparable');
});

test('a zero baseline is not-comparable: no divide-by-zero ships as a trend', () => {
  const scopeEmpty = {
    sources: ['transactions'],
    window: [10, 20] as [number, number],
    subjects: ['acct-brakewater', 'acct-greyfield'] as [string, string]
  };
  const scopeBusy = { ...scopeEmpty, subjects: ['acct-eastgate'] as [string] };
  const comparison = compareWindows(
    { result: query(world, scopeEmpty), scope: scopeEmpty },
    { result: query(world, scopeBusy), scope: scopeBusy }
  );
  assert.equal(comparison.kind, 'not-comparable');
  assert.match((comparison as { statement: string }).statement, /no denominator/);
});

test('a hit from a degraded read is present, with the caveats attached', () => {
  const scope = {
    sources: ['transactions', 'messages', 'telemetry'],
    window: [0, 90] as [number, number],
    subjects: ['acct-eastgate'] as [string]
  };
  const verdict = upgrade(query(world, scope, { scanBudget: 5_000 }), scope);
  assert.equal(verdict.kind, 'present');
  const present = verdict as Extract<typeof verdict, { kind: 'present' }>;
  assert.ok(present.caveats.some((c) => c.startsWith('search.completed')));
});

test('the sweep is measured: at the default floor the discipline loses nothing', () => {
  const sweep = runSweep(8, [15_000, 30_000]);
  assert.equal(sweep.runs, 16);
  assert.equal(sweep.disciplineFalseZerosAtDefaultFloor, 0, 'across every seed and every budget');
  assert.ok(sweep.naiveFalseZeroRate.mean > 0.5, 'the naive reading keeps failing');
  assert.equal(sweep.honestZeroMissRate, 0, 'and true absences are still claimed');
});

test('a typoed subject id is a phantom-entity zero, not an absence', () => {
  const scope = {
    sources: ['transactions'],
    window: [10, 70] as [number, number],
    // 'brakewater' with the e dropped: parses, scans, matches nothing
    subjects: ['acct-brakwater', 'acct-greyfield'] as [string, string]
  };
  const result = query(world, scope);
  const verdict = upgrade(result, scope);
  assert.equal(verdict.kind, 'observation', 'a phantom entity must never reach an absence claim');
  const failed = (verdict as { failed: Array<{ name: string }> }).failed.map((f) => f.name);
  assert.ok(failed.includes('query.valid'));
  assert.deepEqual(result.execution.unknownSubjects, ['acct-brakwater']);
});

test('a relaxed coverage floor reports the coverage it measured, not "fully covered"', () => {
  const scope = {
    sources: ['telemetry'],
    window: [80, 90] as [number, number],
    subjects: ['acct-brakewater', 'acct-greyfield'] as [string, string]
  };
  const result = query(world, scope);
  assert.equal(result.execution.windowCovered['telemetry'], 0.8, 'ingestion lag eats the last two days');
  const verdict = upgrade(result, scope, { coverageFloor: 0.7 });
  assert.equal(verdict.kind, 'absent-within-scope');
  const statement = (verdict as { statement: string }).statement;
  assert.doesNotMatch(statement, /fully covered/, '80% of a window is not a covered window');
  assert.match(statement, /telemetry 80%/, 'the claim carries the coverage it actually had');
  assert.match(statement, /floor 0\.70/, 'and the floor that let it through');
});

test('compareWindows honours the same coverage floor as upgrade', () => {
  const scopeA = {
    sources: ['telemetry'],
    window: [60, 70] as [number, number],
    subjects: ['acct-eastgate'] as [string]
  };
  const scopeB = { ...scopeA, window: [80, 90] as [number, number] };
  const a = { result: query(world, scopeA), scope: scopeA };
  const b = { result: query(world, scopeB), scope: scopeB };
  assert.equal(compareWindows(a, b).kind, 'not-comparable', 'at the default floor the lagged window is out');
  const relaxed = compareWindows(a, b, { coverageFloor: 0.7 });
  assert.equal(relaxed.kind, 'comparable', 'the two public APIs cannot disagree about the same floor');
});

test('a passing coverage requirement says how much of the window it searched', () => {
  const scope = {
    sources: ['telemetry'],
    window: [80, 90] as [number, number],
    subjects: ['acct-brakewater', 'acct-greyfield'] as [string, string]
  };
  const checks = requirements(query(world, scope), scope, { coverageFloor: 0.7 });
  const coverage = checks.find((r) => r.name === 'coverage.telemetry')!;
  assert.equal(coverage.ok, true, 'a 0.7 floor lets 80% through');
  assert.doesNotMatch(coverage.detail, /fully searchable/, 'but it was not fully searchable');
  assert.match(coverage.detail, /80% of the window searchable/);
});

test('ground truth can be asked of a scope, not only of the whole world', () => {
  const window = [75, 88] as [number, number];
  const inWorld = trueInteractions(world, 'acct-copperline', 'acct-dunmore', window);
  assert.equal(inWorld.length, 2, 'the world says present: two telemetry contacts');
  const inTransactions = trueInteractions(world, 'acct-copperline', 'acct-dunmore', window, [
    'transactions'
  ]);
  assert.equal(inTransactions.length, 0, 'transactions says absent, and that claim is true');
});

test('a scope-restricted absence is scored against its scope, not against the world', () => {
  const report = runEval(7);
  const scoped = report.outcomes.find((o) => o.id === 'scope-honest-zero')!;
  assert.equal(scoped.disciplineVerdict, 'absent-within-scope');
  assert.equal(scoped.disciplineFalseZero, false, 'the claim is true of the scope it names');
  assert.equal(scoped.naiveFalseZero, true, '"no such event occurred" is false of the world');
});

test('the sweep can fail: a relaxed floor buys claims and costs false zeros', () => {
  const sweep = runSweep(4, [15_000]);
  assert.ok(sweep.disciplineFalseZeros > 0, 'a discipline that cannot lose is not being measured');
  assert.deepEqual(Object.keys(sweep.disciplineFalseZerosByCase), ['relaxed-floor-zero']);
  assert.equal(sweep.disciplineFalseZerosAtDefaultFloor, 0, 'at floor 1.0 it still loses nothing');
});

test('honestZeroMissRate is a rate: numerator and denominator count the same chances', () => {
  const sweep = runSweep(4, [15_000]);
  assert.ok(
    sweep.honestZeroMissRate >= 0 && sweep.honestZeroMissRate <= 1,
    `a miss rate outside [0,1] is a mismatched fraction, got ${sweep.honestZeroMissRate}`
  );
});

test('a false zero is not counted as an honest zero claimed', () => {
  const report = runEval(7);
  const upgrades = report.outcomes.filter((o) => o.disciplineVerdict === 'absent-within-scope');
  assert.equal(upgrades.length, 4, 'four claims were made');
  assert.equal(report.disciplineFalseZeros, 1, 'one of them was wrong');
  assert.equal(report.honestZerosClaimed, 3, 'so three honest zeros were claimed, not four');
});

/** An Execution built by hand, the way an adapter over a real engine builds
 *  one. Only the fields under test differ from a clean run. */
const execution = (over: Partial<import('../src/store.ts').Execution> = {}) => ({
  completed: true,
  scanned: 0,
  matched: 0,
  truncatedAt: null,
  windowCovered: { logs: 1 },
  unknownPredicates: [],
  unknownSources: [],
  unknownSubjects: [],
  ...over
});
const realScope = {
  sources: ['logs'],
  window: [0, 7] as [number, number],
  subjects: ['acct-1'] as [string]
};

test('an engine that cannot say where it stopped still gets a readable failure', () => {
  const result = { rows: [], execution: execution({ completed: false, scanned: 4_000 }) };
  const verdict = upgrade(result, realScope);
  assert.equal(verdict.kind, 'observation');
  const detail = (verdict as { failed: Array<{ name: string; detail: string }> }).failed.find(
    (f) => f.name === 'search.completed'
  )!.detail;
  assert.doesNotMatch(detail, /undefined/, 'a report that reads "t=undefined" is not a report');
  assert.match(detail, /4000 rows/);
});

test('a record that reports matches but carries no rows cannot become an absence', () => {
  const result = { rows: [], execution: execution({ matched: 3, scanned: 900 }) };
  const verdict = upgrade(result, realScope);
  assert.equal(verdict.kind, 'observation', 'three matches and no rows is not a searched-and-empty');
  const failed = (verdict as { failed: Array<{ name: string }> }).failed.map((f) => f.name);
  assert.ok(failed.includes('census.consistent'));
});

/** epoch days, the unit this library's windows are in */
const DAY_MS = 86_400_000;
const esScope = {
  sources: ['app-logs'],
  window: [20_330, 20_337] as [number, number],
  subjects: ['acct-1'] as [string]
};

test('an Elasticsearch zero from a terminated search is an observation, not an absence', () => {
  const response = {
    took: 4210,
    timed_out: false,
    terminated_early: true,
    _shards: { total: 12, successful: 11, skipped: 0, failed: 1 },
    hits: { total: { value: 0, relation: 'eq' as const }, hits: [] }
  };
  const ex = fromElasticsearch(response, esScope);
  assert.equal(ex.completed, false, 'terminated_early is a search that stopped early');
  assert.ok(ex.windowCovered['app-logs']! < 1, 'a failed shard is a slice nobody searched');
  const verdict = upgrade({ rows: [], execution: ex }, esScope);
  assert.equal(verdict.kind, 'observation');
  const failed = (verdict as { failed: Array<{ name: string }> }).failed.map((f) => f.name);
  assert.deepEqual(failed, ['search.completed', 'coverage.app-logs']);
});

test('an Elasticsearch total of "gte" is a lower bound, and a lower bound is not a census', () => {
  const response = {
    timed_out: false,
    _shards: { total: 4, successful: 4, skipped: 0, failed: 0 },
    hits: { total: { value: 10_000, relation: 'gte' as const }, hits: [] }
  };
  assert.equal(fromElasticsearch(response, esScope).completed, false);
});

test('a clean Elasticsearch zero upgrades and reports what it searched', () => {
  const response = {
    timed_out: false,
    terminated_early: false,
    _shards: { total: 12, successful: 12, skipped: 0, failed: 0 },
    hits: { total: { value: 0, relation: 'eq' as const }, hits: [] }
  };
  const ex = fromElasticsearch(response, esScope, { knownSources: ['app-logs'], knownSubjects: ['acct-1'] });
  const verdict = upgrade({ rows: [], execution: ex }, esScope);
  assert.equal(verdict.kind, 'absent-within-scope');
  assert.match((verdict as { statement: string }).statement, /window fully covered: app-logs 100%/);
});

test('an adapter given a catalogue catches the phantom entity too', () => {
  const response = {
    timed_out: false,
    _shards: { total: 4, successful: 4, skipped: 0, failed: 0 },
    hits: { total: { value: 0, relation: 'eq' as const }, hits: [] }
  };
  const scope = { ...esScope, subjects: ['acct-typo'] as [string] };
  const ex = fromElasticsearch(response, scope, { knownSubjects: ['acct-1', 'acct-2'] });
  assert.deepEqual(ex.unknownSubjects, ['acct-typo']);
  assert.equal(upgrade({ rows: [], execution: ex }, scope).kind, 'observation');
});

test('a BigQuery cache hit cannot cover the part of the window it never saw', () => {
  const scope = {
    sources: ['events'],
    window: [20_330, 20_337] as [number, number],
    subjects: ['acct-1'] as [string]
  };
  const job = {
    jobComplete: true,
    status: { state: 'DONE' },
    statistics: {
      endTime: String(20_334 * DAY_MS),
      query: { cacheHit: true, totalBytesProcessed: '0' }
    },
    totalRows: '0'
  };
  const ex = fromBigQuery(job, scope);
  assert.equal(ex.windowCovered['events'], 4 / 7, 'the cached answer knows nothing after it was computed');
  assert.equal(upgrade({ rows: [], execution: ex }, scope).kind, 'observation');
});

test('a BigQuery job that hit its billing ceiling never finished', () => {
  const scope = {
    sources: ['events'],
    window: [20_330, 20_337] as [number, number],
    subjects: ['acct-1'] as [string]
  };
  const job = {
    jobComplete: true,
    status: { state: 'DONE' },
    configuration: { query: { maximumBytesBilled: '1000000000' } },
    statistics: {
      endTime: String(20_337 * DAY_MS),
      query: { cacheHit: false, totalBytesProcessed: '999999999', totalBytesBilled: '1000000000' }
    },
    totalRows: '0'
  };
  assert.equal(fromBigQuery(job, scope).completed, false);
});

test('the phantom zero fails query.valid and nothing else', () => {
  const scope = {
    sources: ['transactions'],
    window: [10, 70] as [number, number],
    subjects: ['acct-brakwater', 'acct-greyfield'] as [string, string]
  };
  const failed = requirements(query(world, scope), scope).filter((r) => !r.ok);
  assert.deepEqual(
    failed.map((f) => f.name),
    ['query.valid'],
    'the query parsed, the scan finished and the window was whole: only the id was fiction'
  );
});

test('truncated-only-zero isolates search.completed; incomplete-zero does not', () => {
  const battery = cases(world);
  const isolated = battery.find((c) => c.id === 'truncated-only-zero')!;
  const failed = requirements(
    query(world, isolated.scope, isolated.options),
    isolated.scope,
    isolated.upgradeOptions
  ).filter((r) => !r.ok);
  assert.deepEqual(failed.map((f) => f.name), ['search.completed']);

  const overDetermined = battery.find((c) => c.id === 'incomplete-zero')!;
  const alsoFailed = requirements(
    query(world, overDetermined.scope, overDetermined.options),
    overDetermined.scope
  ).filter((r) => !r.ok);
  assert.ok(alsoFailed.length > 1, 'the original incomplete case fails several at once');
});

test('the eval table is exactly the one the README publishes', () => {
  const rows = runEval(7).outcomes.map((o) =>
    [
      o.id,
      o.trulyAbsentInWorld ? 'absent' : o.trulyAbsent ? 'absent in scope' : 'present',
      o.naiveSaysAbsent ? (o.naiveFalseZero ? 'absent  << FALSE ZERO' : 'absent') : 'present',
      o.disciplineVerdict + (o.disciplineFalseZero ? '  << FALSE ZERO' : '')
    ].join(' | ')
  );
  assert.deepEqual(rows, [
    'honest-zero | absent | absent | absent-within-scope',
    'coverage-zero | absent | absent | observation',
    'malformed-zero | present | absent  << FALSE ZERO | observation',
    'incomplete-zero | present | absent  << FALSE ZERO | observation',
    'not-a-zero | present | present | present',
    'phantom-entity-zero | present | absent  << FALSE ZERO | observation',
    'scope-honest-zero | absent in scope | absent  << FALSE ZERO | absent-within-scope',
    'truncated-only-zero | present | absent  << FALSE ZERO | observation',
    'relaxed-floor-zero | present | absent  << FALSE ZERO | absent-within-scope  << FALSE ZERO',
    'lagged-tail-zero | absent in scope | absent  << FALSE ZERO | absent-within-scope'
  ]);
});

test('the published sweep numbers reproduce exactly', () => {
  const sweep = runSweep();
  assert.equal(sweep.runs, 150);
  assert.equal(sweep.naiveFalseZeroRate.min.toFixed(2), '0.50');
  assert.equal(sweep.naiveFalseZeroRate.mean.toFixed(2), '0.59');
  assert.equal(sweep.naiveFalseZeroRate.max.toFixed(2), '0.70');
  assert.equal(sweep.disciplineFalseZerosAtDefaultFloor, 0);
  assert.equal(sweep.disciplineFalseZeros, 156);
  assert.deepEqual(sweep.disciplineFalseZerosByCase, {
    'relaxed-floor-zero': 150,
    'lagged-tail-zero': 6
  });
  assert.equal(sweep.honestZeroMissRate, 0);
});

test('the checklist example in the README is the output the README quotes', () => {
  const scope = {
    sources: ['transactions', 'messages', 'telemetry'],
    window: [0, 90] as [number, number],
    subjects: ['acct-copperline', 'acct-dunmore'] as [string, string]
  };
  const verdict = upgrade(query(world, scope, { scanBudget: 25_000 }), scope);
  assert.equal(verdict.kind, 'observation');
  const failed = verdict as { failed: Array<{ name: string; detail: string }>; statement: string };
  assert.equal(failed.failed[0]!.name, 'search.completed');
  assert.equal(
    failed.failed[0]!.detail,
    'scan cut off at t=73.6 after 25000 rows; the emptiness of a search abandoned'
  );
  assert.ok(failed.statement.startsWith('no matching evidence found; absence NOT established'));
});

test('the coverage-floor example in the README is the statement the README quotes', () => {
  const scope = {
    sources: ['telemetry'],
    window: [80, 90] as [number, number],
    subjects: ['acct-brakewater', 'acct-greyfield'] as [string, string]
  };
  const verdict = upgrade(query(world, scope), scope, { coverageFloor: 0.7 });
  assert.equal(
    (verdict as { statement: string }).statement,
    'no qualifying record exists in telemetry over days 80 to 90 (2556 rows examined, window covered telemetry 80%; floor 0.70)'
  );
});

test('the adapter example in the README is the output the README quotes', () => {
  const response = {
    took: 4210,
    timed_out: false,
    terminated_early: true,
    _shards: { total: 12, successful: 11, skipped: 0, failed: 1 },
    hits: { total: { value: 0, relation: 'eq' as const }, hits: [] }
  };
  const ex = fromElasticsearch(response, esScope, {
    knownSources: ['app-logs'],
    knownSubjects: ['acct-1']
  });
  const verdict = upgrade({ rows: [], execution: ex }, esScope);
  const failed = (verdict as { failed: Array<{ name: string; detail: string }> }).failed;
  assert.deepEqual(
    failed.map((f) => f.detail),
    [
      'scan did not finish after 0 rows, and the engine did not say where it stopped; the emptiness of a search abandoned',
      'only 92% of the window searchable: a gap in collection, in ingestion, or in the search itself'
    ]
  );
});

test('every row of the Elasticsearch mapping table holds', () => {
  const clean = {
    timed_out: false,
    terminated_early: false,
    _shards: { total: 4, successful: 4, skipped: 0, failed: 0 },
    hits: { total: { value: 0, relation: 'eq' as const }, hits: [] }
  };
  assert.equal(fromElasticsearch(clean, esScope).completed, true, 'the control');
  assert.equal(fromElasticsearch({ ...clean, timed_out: true }, esScope).completed, false);
  assert.equal(fromElasticsearch({ ...clean, terminated_early: true }, esScope).completed, false);
  assert.equal(
    fromElasticsearch(
      { ...clean, aggregations: { by_account: { buckets: [{ key: 'a', doc_count: 3 }], sum_other_doc_count: 12 } } },
      esScope
    ).completed,
    false,
    'buckets the engine dropped answered a different question'
  );
  const skipping = { ...clean, _shards: { total: 4, successful: 4, skipped: 1, failed: 0 } };
  assert.equal(fromElasticsearch(skipping, esScope).windowCovered['app-logs'], 1, 'can_match is trusted by default');
  assert.equal(
    fromElasticsearch(skipping, esScope, { skippedShardsSearched: false }).windowCovered['app-logs'],
    0.75,
    'and distrusted on request'
  );
  assert.deepEqual(
    fromElasticsearch(clean, esScope, { knownSources: ['other-index'] }).unknownSources,
    ['app-logs']
  );
  assert.equal(
    fromElasticsearch(clean, esScope, { knownSources: ['other-index'] }).windowCovered['app-logs'],
    0,
    'an index nobody could resolve was searched over none of the window'
  );
  assert.equal(fromElasticsearch(clean, esScope).truncatedAt, null, 'never invented');
  assert.equal(fromElasticsearch(clean, esScope, { rowsExamined: 900_000 }).scanned, 900_000);
});

test('every row of the BigQuery mapping table holds', () => {
  const scope = {
    sources: ['events'],
    window: [20_330, 20_337] as [number, number],
    subjects: ['acct-1'] as [string]
  };
  const clean = {
    jobComplete: true,
    status: { state: 'DONE' },
    statistics: {
      endTime: String(20_337 * DAY_MS),
      query: { cacheHit: false, totalBytesProcessed: '4200000' }
    },
    totalRows: '0'
  };
  assert.equal(fromBigQuery(clean, scope).completed, true, 'the control');
  assert.equal(fromBigQuery(clean, scope).windowCovered['events'], 1);
  assert.equal(fromBigQuery({ ...clean, jobComplete: false }, scope).completed, false);
  assert.equal(
    fromBigQuery({ ...clean, status: { state: 'DONE', errorResult: { reason: 'quotaExceeded' } } }, scope).completed,
    false
  );
  assert.equal(
    fromBigQuery({ ...clean, status: { state: 'DONE', errors: [{ reason: 'backendError' }] } }, scope).completed,
    false,
    'a non-fatal error is still something that went wrong under the answer'
  );
  assert.equal(
    fromBigQuery(
      { ...clean, statistics: { ...clean.statistics, query: { cacheHit: true, totalBytesProcessed: '0' } } },
      scope,
      { computedAt: 20_333 }
    ).windowCovered['events'],
    3 / 7,
    'a cached answer covers the window only up to when it was computed'
  );
  assert.equal(
    fromBigQuery({ ...clean, statistics: { query: { cacheHit: true } } }, scope).windowCovered['events'],
    0,
    'and an undateable cache hit covers nothing rather than guessing'
  );
  assert.equal(
    fromBigQuery(
      { ...clean, statistics: { ...clean.statistics, query: { totalPartitionsProcessed: '6' } } },
      scope,
      { partitionsRequested: 8 }
    ).windowCovered['events'],
    0.75
  );
  assert.equal(fromBigQuery(clean, scope).truncatedAt, null, 'never invented');
});

test('zero runtime dependencies, as the README says on the tin', () => {
  const pkg = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  ) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.deepEqual(pkg.peerDependencies ?? {}, {});
});
