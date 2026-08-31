# silent-zero

![TypeScript](https://img.shields.io/badge/TypeScript-erasable_syntax-3178C6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/node-%3E%3D22.6-5FA04E?logo=nodedotjs&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-0-B45309)
![Tests](https://img.shields.io/badge/tests-11_passing-2F6F44)
![License](https://img.shields.io/badge/license-MIT-6E6E6E)

Unknown is not zero. An eval for proving absence in very large data: four
kinds of zero, one checklist that tells them apart.

[The article](https://miguelsanchez.co.uk/writing/the-silent-zero-proving-absence/) ·
[More tools](https://github.com/m-sanchez) ·
[Working rules](https://miguelsanchez.co.uk/ethics)

The most dangerous result a large data platform can return is zero rows.
The system reports "I found no matching records", an observation about a
query; the reader hears "no such event occurred", a claim about the world.
This repo makes that gap executable: a seeded synthetic world with ground
truth attached, a budgeted store that fails the way real engines fail, and
the upgrade checklist that separates the one zero worth citing from the
three that lie.

## The four zeros

```
honest zero      searched everything, nothing there   the only one worth citing
coverage zero    nothing was collected there          a gap in collection, not a fact
malformed zero   the question was silently broken     ran perfectly, asked the wrong thing
incomplete zero  the search never finished            the emptiness of a search abandoned
```

One number on the screen, four meanings, and nothing in the bare result to
tell them apart. `npm run demo` plants all four and grades two readers:

```
case              truth    naive reading         upgrade discipline
honest-zero       absent   absent                absent-within-scope
coverage-zero     absent   absent                observation
malformed-zero    present  absent  << FALSE ZERO observation
incomplete-zero   present  absent  << FALSE ZERO observation
not-a-zero        present  present               present

naive false zeros: 2
discipline false zeros: 0
honest zeros claimed, scoped: 1
```

The naive reading (zero rows means it never happened) is exactly what a
language model does with an empty retrieval, phrased fluently either way.
The discipline never produces a false zero, and it still claims the one
absence that is actually true, scope attached.

## The upgrade checklist

```ts
import { query, upgrade, generateWorld } from 'silent-zero';

const verdict = upgrade(query(world, scope, { scanBudget: 25_000 }), scope);
// { kind: 'observation',
//   failed: [{ name: 'search.completed', detail: 'scan cut off at t=74.1 ...' }],
//   statement: 'no matching evidence found; absence NOT established ...' }
```

`upgrade` promotes "no matching records" to "absence supported within
scope" only when every requirement holds: the query parsed with nothing
silently tolerated, the search completed with no cap or truncation, and
every source in scope was searchable for the whole window, ingestion lag
and outages included. Any requirement unmet and the result stays an
observation with the failing condition named, because "we did not finish
looking" and "there was nothing to find" must never share a sentence.

## Baselines are denominators too

Absence is the sharpest case of a wider family: claims that borrow their
truth from a complete denominator. "Activity fell 80%" where last week's
query completed and this week's hit the row cap does not look wrong; it
looks like a drop. `compareWindows` refuses the comparison unless both
windows pass the same coverage checks:

```ts
compareWindows(complete, capped);
// { kind: 'not-comparable', failing: [...],
//   statement: '... A capped week next to a complete one is not a trend,
//               it is an artifact of the budget.' }
```

## Run

```bash
npm install       # dev-only: typescript
npm test          # node's built-in runner, via --experimental-strip-types
npm run demo      # the table above, from the seeded world
npm run typecheck
```

Node 22.6+ (erasable-syntax TypeScript, node runs it directly). Zero
runtime dependencies. All data is synthetic and seeded; every number above
is reproducible.

## The tests are the point

| Test | Claim |
| :-- | :-- |
| planted absence and planted presence hold in the world | ground truth is constructed, not assumed |
| honest zero upgrades, and the claim carries its scope | absence is assertable only inside a defined scope |
| truncated search never upgrades | an execution ceiling cannot manufacture a negative fact |
| outage window fails coverage, not absence | a gap in collection is a fact about the system |
| tolerated unknown predicate fails query.valid | a query that ran perfectly can still ask the wrong thing |
| ingestion lag blocks the freshest slice | "the past week" quietly excludes where the action is |
| eval: naive 2 false zeros, discipline 0 | the checklist is the difference, measured |
| capped window cannot serve as a baseline | both denominators, or no comparison |
