import { test } from 'node:test';
import assert from 'node:assert/strict';
import { naiveAbsence, requirements, upgrade } from '../src/claim.ts';
import { compareWindows } from '../src/compare.ts';
import { runEval, runSweep } from '../src/evaluate.ts';
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
