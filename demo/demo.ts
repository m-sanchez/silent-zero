/** npm run demo: the four zeros, side by side.
 * The naive reading and the upgrade discipline answer the same questions
 * over the same synthetic world; ground truth grades them. */

import { runEval } from '../src/evaluate.ts';

const report = runEval(7);

console.log(`silent-zero eval (seed ${report.seed})\n`);
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '.' : s.padEnd(n));
console.log(
  pad('case', 18) + pad('truth', 9) + pad('naive reading', 22) + 'upgrade discipline'
);
for (const o of report.outcomes) {
  const truth = o.trulyAbsent ? 'absent' : 'present';
  const naive = o.naiveSaysAbsent
    ? o.naiveFalseZero
      ? 'absent  << FALSE ZERO'
      : 'absent'
    : 'present';
  console.log(pad(o.id, 18) + pad(truth, 9) + pad(naive, 22) + o.disciplineVerdict);
  console.log(' '.repeat(27) + o.statement);
}
console.log(
  `\nnaive false zeros: ${report.naiveFalseZeros}` +
    `\ndiscipline false zeros: ${report.disciplineFalseZeros}` +
    `\nhonest zeros claimed, scoped: ${report.honestZerosClaimed}`
);
