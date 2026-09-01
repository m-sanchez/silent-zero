# silent-zero

![TypeScript](https://img.shields.io/badge/TypeScript-erasable_syntax-3178C6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/node-%3E%3D22.18-5FA04E?logo=nodedotjs&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-0-B45309)
[![CI](https://github.com/m-sanchez/silent-zero/actions/workflows/test.yml/badge.svg)](https://github.com/m-sanchez/silent-zero/actions/workflows/test.yml)
![License](https://img.shields.io/badge/license-MIT-6E6E6E)
[![npm](https://img.shields.io/npm/v/@m-sanchez/silent-zero?color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/@m-sanchez/silent-zero)

> **In plain English:** proving something is NOT in a huge dataset is harder than finding it; this shows how to trust a "nothing found" answer instead of assuming the search just missed it.

Unknown is not zero. An eval for proving absence in very large data: five
kinds of zero, one checklist that tells them apart.

[The article](https://miguelsanchez.co.uk/writing/the-silent-zero-proving-absence/) ·
[More tools](https://github.com/m-sanchez) ·
[Working rules](https://miguelsanchez.co.uk/ethics)

*Provenance: a fresh, dependency-free implementation of standard methods,
written to test the systems the other tools came from. First published
2026-08-31.*

The most dangerous result a large data platform can return is zero rows.
The system reports "I found no matching records", an observation about a
query; the reader hears "no such event occurred", a claim about the world.
This repo makes that gap executable: a seeded synthetic world with ground
truth attached, a budgeted store that fails the way real engines fail, and
the upgrade checklist that separates the one zero worth citing from the
three that lie.

## The five zeros

```
honest zero      searched everything, nothing there   the only one worth citing
coverage zero    nothing was collected there          a gap in collection, not a fact
malformed zero   the question was silently broken     ran perfectly, asked the wrong thing
incomplete zero  the search never finished            the emptiness of a search abandoned
phantom zero     the id in the filter is not real     a zero about the id, not the world
```

The phantom zero is the one production hits most: a transposed character in
an account id, a stale alias, the wrong tenant. The query parses, the scan
completes, coverage is 100%, and every row fails the join — so the emptiest,
most confident answer in the set is the one about an entity that does not
exist. One number on the screen, five meanings, and nothing in the bare
result to tell them apart. `npm run demo` plants all five and grades two
readers, each against the claim it actually makes: the naive reading says
"no such event occurred", so the world grades it; the discipline says
"absent within this scope", so the scope grades it.

```
case                 truth            naive reading         upgrade discipline
honest-zero          absent           absent                absent-within-scope
coverage-zero        absent           absent                observation
malformed-zero       present          absent  << FALSE ZERO observation
incomplete-zero      present          absent  << FALSE ZERO observation
not-a-zero           present          present               present
phantom-entity-zero  present          absent  << FALSE ZERO observation
scope-honest-zero    absent in scope  absent  << FALSE ZERO absent-within-scope
truncated-only-zero  present          absent  << FALSE ZERO observation
relaxed-floor-zero   present          absent  << FALSE ZERO absent-within-scope  << FALSE ZERO
lagged-tail-zero     absent in scope  absent  << FALSE ZERO absent-within-scope

naive false zeros: 7
discipline false zeros: 1
honest zeros claimed, scoped: 3
```

`absent in scope` is the distinction the two readers exist to argue about:
the pair met, but not in the source the question named, so "not in
transactions" is true and "it never happened" is false. `truncated-only-zero`
fails exactly one requirement, `search.completed`, which is what isolating a
failure mode looks like. And `relaxed-floor-zero` is the discipline losing:
told it could claim at half coverage, it claimed, and the record was in the
half nobody searched.

The naive reading (zero rows means it never happened) is exactly what a
language model does with an empty retrieval, phrased fluently either way.
The battery is adversarial by construction, so these rates describe the
battery, not your data — what the sweep buys is that the discipline's arm
can now lose, which is the only thing that makes its number evidence.
Swept over 50 seeded worlds and three scan budgets (150 runs of 10 cases):
the naive reading's false-zero rate runs 0.50 to 0.70 (mean 0.59). The
discipline produced **zero** false zeros at the default coverage floor of
1.0, and **156** once the floor was relaxed — 150 of 150 runs of
`relaxed-floor-zero`, which is designed to lose, and 6 of 150 runs of
`lagged-tail-zero`, where whether half a day of ingestion lag hides
anything is up to the seed. It claimed 100% of the true absences it had a
fair chance at, scope attached. `npm run demo` reproduces all of it.

## The upgrade checklist

```ts
import { query, upgrade, generateWorld } from '@m-sanchez/silent-zero';

const verdict = upgrade(query(world, scope, { scanBudget: 25_000 }), scope);
// { kind: 'observation',
//   failed: [{ name: 'search.completed', detail: 'scan cut off at t=74.1 ...' }],
//   statement: 'no matching evidence found; absence NOT established ...' }
```

`upgrade` promotes "no matching records" to "absence supported within
scope" only when every requirement holds: the query parsed with nothing
silently tolerated — no predicate on a field that exists nowhere, no
unknown source, and no subject identifier the world has never heard of —
the search completed with no cap or truncation, and every source in scope
was searchable for the whole window, ingestion lag and outages included. Any requirement unmet and the result stays an
observation with the failing condition named, because "we did not finish
looking" and "there was nothing to find" must never share a sentence.

## Coverage floors, and what relaxing one costs

The default floor is 1.0: every source in scope must be searchable for the
whole window or there is no upgrade. On real data that default refuses
almost everything — two days of telemetry ingestion lag alone put 100%
coverage of a recent window out of reach — so the floor is adjustable, and
the price of adjusting it is printed on the claim:

```ts
upgrade(result, scope, { coverageFloor: 0.7 }).statement;
// 'no qualifying record exists in telemetry over days 80 to 90
//  (2556 rows examined, window covered telemetry 80%; floor 0.70)'
```

The words "fully covered" appear only when every source measured 1.0. Below
that the claim carries the coverage it earned and the floor that let it
through: a tool that rounds 80% up to "fully covered" is committing the
exact error it was built to catch. `compareWindows` takes the same options,
so the two public APIs cannot reach different verdicts on one result.

A relaxed floor is a real risk and not a formality, which is why the sweep
prices it: 150 of 150 runs lost where the hole was placed on the evidence,
6 of 150 where the hole was half a day of ordinary ingestion lag. The floor
is not a nuisance parameter. It is the guarantee.

## Real engines

`Execution` is this repo's record, not anyone's wire format, so `src/adapt.ts`
ships the two mappings that matter and documents the shape closely enough to
write your own for Splunk or Snowflake in ten lines. Both take the response
object your client already parsed: no client, no network, no dependency.

```ts
import { fromElasticsearch, upgrade } from '@m-sanchez/silent-zero';

// terminated_early: true, _shards: { total: 12, successful: 11, failed: 1 }
const execution = fromElasticsearch(response, scope, {
  knownSources: catalogue.indices,
  knownSubjects: catalogue.accountIds
});
upgrade({ rows: [], execution }, scope);
// { kind: 'observation', failed: [
//   { name: 'search.completed',
//     detail: 'scan did not finish after 0 rows, and the engine did not
//              say where it stopped; the emptiness of a search abandoned' },
//   { name: 'coverage.app-logs',
//     detail: 'only 92% of the window searchable: a gap in collection,
//              in ingestion, or in the search itself' } ] }
```

| what the engine reports | what it means to the checklist |
| :-- | :-- |
| ES `terminated_early`, `timed_out` | `completed: false` |
| ES `hits.total.relation: 'gte'` | `completed: false`; a lower bound is not a census |
| ES dropped aggregation buckets | `completed: false` |
| ES `_shards.failed` | coverage below 1: a shard that errored is a slice nobody searched |
| ES `_shards.skipped` | coverage only if you pass `skippedShardsSearched: false` |
| BQ `errorResult`, non-fatal `errors`, `jobComplete: false` | `completed: false` |
| BQ bytes billed at `maximumBytesBilled` | `completed: false`; what stops at a ceiling did not finish |
| BQ `cacheHit` | coverage only up to the instant the answer was computed |
| BQ partitions read against `partitionsRequested` | coverage below 1 |

Two rules the adapters keep and yours should: nothing is guessed, and where
the engine is silent the adapter withholds coverage rather than assuming it.
`truncatedAt` stays null in both, because neither engine says *where* it
stopped, and inventing a cut-off would be a fabrication in the one place
this library has to be exact.

A cache hit is the subtle one. It is a real zero from a real search, just
not from this moment: the window after the answer was computed was never
looked at, so coverage is cut at that instant rather than reported as whole.

And no engine can tell you whether the identifiers in your filter are real.
Pass `knownSources` and `knownSubjects` from your catalogue and the phantom
zero is caught here too; leave them out and `query.valid` has nothing to
check, which is a hole in your evidence rather than in this code.

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

## Install

```bash
npm install @m-sanchez/silent-zero
```

Also installable from a pinned git tag:
`github:m-sanchez/silent-zero#v3.0.0`. CI proves the packed tarball imports
cleanly. Zero runtime dependencies.

## Develop

```bash
npm ci            # dev-only: typescript
npm test
npm run demo      # the table and the sweep, reproduced
npm run typecheck
```

Node 22.18+ (erasable-syntax TypeScript; node runs the sources directly).
All data is synthetic and seeded; every number above is reproducible.

## The tests are the point

| Test | Claim |
| :-- | :-- |
| planted absence and planted presence hold in the world | ground truth is constructed, not assumed |
| honest zero upgrades, and the claim carries its scope | absence is assertable only inside a defined scope |
| truncated search never upgrades | an execution ceiling cannot manufacture a negative fact |
| outage window fails coverage, not absence | a gap in collection is a fact about the system |
| tolerated unknown predicate fails query.valid | a query that ran perfectly can still ask the wrong thing |
| a typoed subject id never reaches an absence claim | a zero about an identifier is not a zero about the world |
| ingestion lag blocks the freshest slice | "the past week" quietly excludes where the action is |
| a relaxed floor reports the coverage it measured | a claim carries its units or it is not a claim |
| compareWindows honours the same floor as upgrade | one result cannot have two verdicts |
| ground truth can be asked of a scope | an oracle that cannot express the claim cannot score it |
| eval: naive 7 false zeros, discipline 1 | the checklist is the difference, and where it fails is published |
| capped window cannot serve as a baseline | both denominators, or no comparison |
| a zero baseline is not-comparable | "up from nothing" is not a trend |
| a degraded hit is present, caveats attached | the discipline applies to hits too |
| the sweep loses the relaxed-floor case | a discipline that cannot lose is not being measured |
| the sweep: 0 discipline false zeros at floor 1.0 | measured, not authored |

Every externally checkable claim in this README is mapped to the test that
enforces it in [CLAIMS.md](CLAIMS.md).
