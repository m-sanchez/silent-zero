import { test } from 'node:test';
import assert from 'node:assert/strict';
import { naiveAbsence, upgrade } from '../src/claim.ts';
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

test('the eval: the naive reading produces false zeros, the discipline none', () => {
  const report = runEval(7);
  assert.ok(report.naiveFalseZeros >= 2, 'incomplete and malformed zeros fool the naive reading');
  assert.equal(report.disciplineFalseZeros, 0);
  assert.equal(report.honestZerosClaimed, 1, 'exactly the planted true absence is claimed');
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

test('the sweep is measured: zero discipline false zeros across seeds and budgets', () => {
  const sweep = runSweep(8, [15_000, 30_000]);
  assert.equal(sweep.runs, 16);
  assert.equal(sweep.disciplineFalseZeros, 0);
  assert.ok(sweep.naiveFalseZeroRate.mean > 0, 'the naive reading keeps failing');
  assert.equal(sweep.honestZeroMissRate, 0, 'true absences are still claimed');
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
