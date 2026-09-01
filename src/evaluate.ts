/** The eval: run the same absence questions through the naive reading and
 * the upgrade discipline, against ground truth the world generator knows.
 *
 * Four kinds of zero exist and the bare result cannot tell them apart:
 * honest (searched everything, nothing there), coverage (nothing was
 * collected), malformed (the question was silently broken), incomplete
 * (the search never finished). Only the honest zero supports a claim
 * about the world. The eval plants all four and scores who can tell. */

import { naiveAbsence, upgrade } from './claim.ts';
import type { UpgradeOptions } from './claim.ts';
import { query } from './store.ts';
import type { QueryOptions, Scope } from './store.ts';
import { generateWorld, trueInteractions } from './world.ts';
import type { World } from './world.ts';

export type ZeroKind =
  /** searched everything in scope, nothing there, and nothing anywhere else either */
  | 'honest'
  /** absent in the scope named, present elsewhere in the world: the claim
   *  "not in transactions" is true, the claim "it never happened" is not */
  | 'scope-honest'
  | 'coverage'
  | 'malformed'
  | 'incomplete'
  /** the identifier in the filter exists nowhere: a zero about the id */
  | 'phantom'
  | 'not-a-zero';

/** The zeros a correct discipline is expected to claim. Numerator and
 *  denominator of the miss rate are both taken over this set: counting a
 *  claim that the denominator never offered a chance for makes the rate
 *  something other than a rate. */
const CLAIMABLE: ReadonlySet<ZeroKind> = new Set<ZeroKind>(['honest', 'scope-honest']);

export interface Case {
  id: string;
  question: string;
  scope: Scope;
  options: QueryOptions;
  /** the entities the analyst meant to ask about, when the scope carries a
   *  typo. Ground truth belongs to the intended question: a phantom-entity
   *  zero is a zero about the identifier, and grading it against the
   *  identifier would grade the mistake as if it were the world */
  truthSubjects?: [string] | [string, string];
  /** options handed to `upgrade` for this case; a relaxed coverage floor is
   *  part of what is being measured */
  upgradeOptions?: UpgradeOptions;
  /** which zero this case is engineered to produce */
  plantedZero: ZeroKind;
}

export interface CaseOutcome {
  id: string;
  plantedZero: ZeroKind;
  /** absent in the scope the claim names: what the discipline is graded on */
  trulyAbsent: boolean;
  /** absent anywhere in the world in that window: what the naive reading,
   *  which says "no such event occurred", is graded on */
  trulyAbsentInWorld: boolean;
  naiveSaysAbsent: boolean;
  naiveFalseZero: boolean;
  disciplineVerdict: 'present' | 'absent-within-scope' | 'observation';
  disciplineFalseZero: boolean;
  statement: string;
}

export interface EvalReport {
  seed: number;
  outcomes: CaseOutcome[];
  naiveFalseZeros: number;
  disciplineFalseZeros: number;
  honestZerosClaimed: number;
}

/** The battery. One case per kind of zero, plus the buried presence. */
export function cases(world: World): Case[] {
  return [
    {
      id: 'honest-zero',
      question: 'did brakewater and greyfield ever interact? (they truly never did)',
      scope: {
        sources: ['transactions'],
        window: [10, 70],
        subjects: ['acct-brakewater', 'acct-greyfield']
      },
      options: {},
      plantedZero: 'honest'
    },
    {
      id: 'coverage-zero',
      question: 'did brakewater and greyfield interact via messages in the outage window?',
      scope: {
        sources: ['messages'],
        window: [40, 46],
        subjects: ['acct-brakewater', 'acct-greyfield']
      },
      options: {},
      plantedZero: 'coverage'
    },
    {
      id: 'malformed-zero',
      question: 'same question, with a typoed field the engine tolerates instead of rejecting',
      scope: {
        sources: ['transactions'],
        window: [10, 70],
        subjects: ['acct-eastgate', 'acct-fenwick']
      },
      options: { tolerateUnknownPredicates: true, predicateField: 'chanel', predicateValue: 'wire' },
      plantedZero: 'malformed'
    },
    {
      id: 'incomplete-zero',
      question: 'did copperline contact dunmore? (they did: telemetry, late in the window)',
      scope: {
        sources: ['transactions', 'messages', 'telemetry'],
        window: [0, 90],
        subjects: ['acct-copperline', 'acct-dunmore']
      },
      options: { scanBudget: 25_000 },
      plantedZero: 'incomplete'
    },
    {
      id: 'not-a-zero',
      question: 'same question with the budget the conjunction actually needs',
      scope: {
        sources: ['telemetry'],
        window: [75, 88],
        subjects: ['acct-copperline', 'acct-dunmore']
      },
      options: {},
      plantedZero: 'not-a-zero'
    },
    {
      id: 'phantom-entity-zero',
      question: 'did copperline contact dunmor? (one character short: that account does not exist)',
      scope: {
        sources: ['telemetry'],
        window: [75, 88],
        subjects: ['acct-copperline', 'acct-dunmor']
      },
      truthSubjects: ['acct-copperline', 'acct-dunmore'],
      options: {},
      plantedZero: 'phantom'
    },
    {
      id: 'scope-honest-zero',
      question: 'did copperline contact dunmore in TRANSACTIONS? (they did, but only ever in telemetry)',
      scope: {
        sources: ['transactions'],
        window: [75, 88],
        subjects: ['acct-copperline', 'acct-dunmore']
      },
      options: {},
      plantedZero: 'scope-honest'
    },
    {
      id: 'truncated-only-zero',
      question: 'the telemetry question on a budget that dies early: coverage is perfect, the scan is not',
      scope: {
        sources: ['telemetry'],
        window: [75, 88],
        subjects: ['acct-copperline', 'acct-dunmore']
      },
      options: { scanBudget: 100 },
      plantedZero: 'incomplete'
    },
    {
      id: 'relaxed-floor-zero',
      question: 'telemetry over the last four days at a 0.5 coverage floor, with the evidence in the half that was never searchable',
      scope: {
        sources: ['telemetry'],
        window: [86, 90],
        subjects: ['acct-copperline', 'acct-dunmore']
      },
      options: {},
      upgradeOptions: { coverageFloor: 0.5 },
      plantedZero: 'coverage'
    },
    {
      id: 'lagged-tail-zero',
      question: 'a sparse source over the last four days at a 0.85 floor: half a day of ingestion lag, and whether it hides anything is up to the world',
      scope: {
        sources: ['transactions'],
        window: [86, 90],
        subjects: ['acct-eastgate', 'acct-fenwick']
      },
      options: {},
      upgradeOptions: { coverageFloor: 0.85 },
      plantedZero: 'coverage'
    }
  ];
}

/** Score one case: run it, ask ground truth the two different questions the
 *  two readings actually ask, and grade each against its own. */
function scoreCase(world: World, c: Case, options: QueryOptions): CaseOutcome {
  const result = query(world, c.scope, options);
  const asked = c.truthSubjects ?? c.scope.subjects;
  const absentIn = (sources?: string[]): boolean =>
    asked.length === 2 &&
    trueInteractions(world, asked[0], asked[1], c.scope.window, sources).length === 0;
  const trulyAbsent = absentIn(c.scope.sources);
  const trulyAbsentInWorld = absentIn();
  const naive = naiveAbsence(result);
  const verdict = upgrade(result, c.scope, c.upgradeOptions);
  return {
    id: c.id,
    plantedZero: c.plantedZero,
    trulyAbsent,
    trulyAbsentInWorld,
    naiveSaysAbsent: naive,
    // the naive reading claims the world, so the world grades it
    naiveFalseZero: naive && !trulyAbsentInWorld,
    disciplineVerdict: verdict.kind,
    // the discipline claims a scope, so the scope grades it
    disciplineFalseZero: verdict.kind === 'absent-within-scope' && !trulyAbsent,
    statement: verdict.kind === 'present' ? `present: ${verdict.evidence.count} record(s)` : verdict.statement
  };
}

export interface SweepReport {
  seeds: number;
  budgets: number[];
  runs: number;
  naiveFalseZeroRate: { min: number; max: number; mean: number };
  disciplineFalseZeros: number;
  /** which cases the discipline actually lost, and how many times. A sweep
   *  whose discipline arm is empty here is a sweep with no case it could
   *  lose, and an outcome that cannot vary is not a measurement */
  disciplineFalseZerosByCase: Record<string, number>;
  /** of those, the ones made at the default coverage floor of 1.0. Losses
   *  above this line come from relaxing the floor, which is a choice the
   *  caller makes and a cost this sweep prices */
  disciplineFalseZerosAtDefaultFloor: number;
  honestZeroMissRate: number;
}

/** The measured version: many seeds, several scan budgets. The discipline
 * claiming zero false zeros is asserted over every run, not authored into
 * one demo world. */
export function runSweep(seedCount = 50, budgets: number[] = [15_000, 25_000, 35_000]): SweepReport {
  let runs = 0;
  let disciplineFalseZeros = 0;
  let disciplineFalseZerosAtDefaultFloor = 0;
  const disciplineFalseZerosByCase: Record<string, number> = {};
  let honestZeroClaims = 0;
  let honestZeroChances = 0;
  const naiveRates: number[] = [];
  for (let seed = 1; seed <= seedCount; seed++) {
    for (const budget of budgets) {
      const world = generateWorld(seed);
      let naiveFalse = 0;
      let total = 0;
      for (const c of cases(world)) {
        const options = c.id === 'incomplete-zero' ? { scanBudget: budget } : c.options;
        const o = scoreCase(world, c, options);
        total++;
        if (o.naiveFalseZero) naiveFalse++;
        // One predicate drives both sides of the miss rate. Counting claims
        // the denominator never offered a chance for is how a rate goes
        // negative and nobody notices.
        const chance = o.trulyAbsent && CLAIMABLE.has(c.plantedZero);
        if (chance) honestZeroChances++;
        if (o.disciplineFalseZero) {
          disciplineFalseZeros++;
          disciplineFalseZerosByCase[c.id] = (disciplineFalseZerosByCase[c.id] ?? 0) + 1;
          if ((c.upgradeOptions?.coverageFloor ?? 1) >= 1) disciplineFalseZerosAtDefaultFloor++;
        } else if (chance && o.disciplineVerdict === 'absent-within-scope') {
          honestZeroClaims++;
        }
      }
      naiveRates.push(naiveFalse / total);
      runs++;
    }
  }
  return {
    seeds: seedCount,
    budgets,
    runs,
    naiveFalseZeroRate: {
      min: Math.min(...naiveRates),
      max: Math.max(...naiveRates),
      mean: naiveRates.reduce((a, b) => a + b, 0) / naiveRates.length
    },
    disciplineFalseZeros,
    disciplineFalseZerosByCase,
    disciplineFalseZerosAtDefaultFloor,
    honestZeroMissRate: honestZeroChances > 0 ? 1 - honestZeroClaims / honestZeroChances : 0
  };
}

export function runEval(seed = 7): EvalReport {
  const world = generateWorld(seed);
  const outcomes = cases(world).map((c) => scoreCase(world, c, c.options));
  return {
    seed,
    outcomes,
    naiveFalseZeros: outcomes.filter((o) => o.naiveFalseZero).length,
    disciplineFalseZeros: outcomes.filter((o) => o.disciplineFalseZero).length,
    // claims that were true; a false zero is a claim, but it is not an
    // honest zero and must not be counted as one
    honestZerosClaimed: outcomes.filter(
      (o) => o.disciplineVerdict === 'absent-within-scope' && !o.disciplineFalseZero
    ).length
  };
}
