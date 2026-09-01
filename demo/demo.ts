/** npm run demo: the five zeros, side by side.
 * The naive reading and the upgrade discipline answer the same questions
 * over the same synthetic world; ground truth grades each against the claim
 * it actually makes — the world for the naive reading, the scope named for
 * the discipline. */

import { runEval } from '../src/evaluate.ts';

const report = runEval(7);

console.log(`silent-zero eval (seed ${report.seed})\n`);
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '.' : s.padEnd(n));
console.log(
  pad('case', 21) + pad('truth', 17) + pad('naive reading', 22) + 'upgrade discipline'
);
for (const o of report.outcomes) {
  const truth = o.trulyAbsentInWorld ? 'absent' : o.trulyAbsent ? 'absent in scope' : 'present';
  const naive = o.naiveSaysAbsent
    ? o.naiveFalseZero
      ? 'absent  << FALSE ZERO'
      : 'absent'
    : 'present';
  const discipline = o.disciplineVerdict + (o.disciplineFalseZero ? '  << FALSE ZERO' : '');
  console.log(pad(o.id, 21) + pad(truth, 17) + pad(naive, 22) + discipline);
  console.log('    ' + o.statement);
}
console.log(
  `\nnaive false zeros: ${report.naiveFalseZeros}` +
    `\ndiscipline false zeros: ${report.disciplineFalseZeros}` +
    `\nhonest zeros claimed, scoped: ${report.honestZerosClaimed}`
);

// The sweep: measured over many worlds and budgets, not authored into one.
import { runSweep } from '../src/evaluate.ts';
const sweep = runSweep();
const lost = Object.entries(sweep.disciplineFalseZerosByCase)
  .map(([id, n]) => `${id} ${n}`)
  .join(', ');
console.log(
  `\nsweep: ${sweep.seeds} seeds x budgets [${sweep.budgets.join(', ')}] x ${report.outcomes.length} cases = ${sweep.runs} runs` +
    `\nnaive false-zero rate: min ${sweep.naiveFalseZeroRate.min.toFixed(2)}, mean ${sweep.naiveFalseZeroRate.mean.toFixed(2)}, max ${sweep.naiveFalseZeroRate.max.toFixed(2)}` +
    `\ndiscipline false zeros at the default coverage floor: ${sweep.disciplineFalseZerosAtDefaultFloor}` +
    `\ndiscipline false zeros in total: ${sweep.disciplineFalseZeros} (${lost})` +
    `\nhonest zeros claimed when truly absent: ${((1 - sweep.honestZeroMissRate) * 100).toFixed(0)}%`
);
