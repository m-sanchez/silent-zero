/** The eval: run the same absence questions through the naive reading and
 * the upgrade discipline, against ground truth the world generator knows.
 *
 * Four kinds of zero exist and the bare result cannot tell them apart:
 * honest (searched everything, nothing there), coverage (nothing was
 * collected), malformed (the question was silently broken), incomplete
 * (the search never finished). Only the honest zero supports a claim
 * about the world. The eval plants all four and scores who can tell. */

import { naiveAbsence, upgrade } from './claim.ts';
import { query } from './store.ts';
import type { QueryOptions, Scope } from './store.ts';
import { generateWorld, trueInteractions } from './world.ts';
import type { World } from './world.ts';

export type ZeroKind = 'honest' | 'coverage' | 'malformed' | 'incomplete' | 'not-a-zero';

export interface Case {
  id: string;
  question: string;
  scope: Scope;
  options: QueryOptions;
  /** which zero this case is engineered to produce */
  plantedZero: ZeroKind;
}

export interface CaseOutcome {
  id: string;
  plantedZero: ZeroKind;
  trulyAbsent: boolean;
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
    }
  ];
}

export function runEval(seed = 7): EvalReport {
  const world = generateWorld(seed);
  const outcomes: CaseOutcome[] = [];
  for (const c of cases(world)) {
    const result = query(world, c.scope, c.options);
    const truly =
      c.scope.subjects.length === 2 &&
      trueInteractions(world, c.scope.subjects[0], c.scope.subjects[1], c.scope.window).length === 0;
    const naive = naiveAbsence(result);
    const verdict = upgrade(result, c.scope);
    outcomes.push({
      id: c.id,
      plantedZero: c.plantedZero,
      trulyAbsent: truly,
      naiveSaysAbsent: naive,
      naiveFalseZero: naive && !truly,
      disciplineVerdict: verdict.kind,
      disciplineFalseZero: verdict.kind === 'absent-within-scope' && !truly,
      statement: verdict.kind === 'present' ? `present: ${verdict.evidence.count} record(s)` : verdict.statement
    });
  }
  return {
    seed,
    outcomes,
    naiveFalseZeros: outcomes.filter((o) => o.naiveFalseZero).length,
    disciplineFalseZeros: outcomes.filter((o) => o.disciplineFalseZero).length,
    honestZerosClaimed: outcomes.filter((o) => o.disciplineVerdict === 'absent-within-scope').length
  };
}
