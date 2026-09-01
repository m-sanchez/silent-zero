# Claims

Every externally checkable claim this package makes about its own
behaviour — in `README.md` and in the `description` field of
`package.json` — and the test that enforces it. A claim with no enforcing
test is a claim on trust, which is the thing this repo exists to argue
against, so the rule here is simple: if it is falsifiable and it is
published, it is in this table.

Tests live in `test/silent-zero.test.ts`; the name after `::` is the
`node:test` name, so `npm test` prints it verbatim. Prose that argues,
motivates or explains carries no row: it is not falsifiable, and padding
this table with it would be the same overstatement in a different font.

## Headline and taxonomy

| Claim | Where | Enforced by |
| :-- | :-- | :-- |
| Five kinds of zero exist, and one checklist tells them apart | `package.json` description, README "The five zeros" | the five rows below, plus `test/silent-zero.test.ts::the eval table is exactly the one the README publishes` |
| honest zero: searched everything, nothing there — the only one worth citing | README "The five zeros" | `test/silent-zero.test.ts::an honest zero upgrades to absence, and the claim carries its scope` |
| coverage zero: nothing was collected there | README "The five zeros" | `test/silent-zero.test.ts::an outage window is a coverage zero, not an absence` |
| malformed zero: the question was silently broken; it ran perfectly and asked the wrong thing | README "The five zeros" | `test/silent-zero.test.ts::a tolerated unknown predicate is a malformed zero and fails query.valid` |
| incomplete zero: the search never finished | README "The five zeros" | `test/silent-zero.test.ts::a truncated search never upgrades: incomplete zero stays an observation` |
| phantom zero: the id in the filter is not real, and the zero is about the id | README "The five zeros" | `test/silent-zero.test.ts::a typoed subject id is a phantom-entity zero, not an absence` |
| For a phantom id the query parses, the scan completes and coverage is 100% — only the identity fails | README "The five zeros" | `test/silent-zero.test.ts::the phantom zero fails query.valid and nothing else` |
| A validating engine rejects an unknown field rather than running it | README "The five zeros" (malformed row) | `test/silent-zero.test.ts::a validating engine rejects the unknown field instead of running` |

## The world and the store

| Claim | Where | Enforced by |
| :-- | :-- | :-- |
| The world is seeded, and every number here is reproducible | README intro, "Develop" | `test/silent-zero.test.ts::the world is deterministic in its seed` |
| Ground truth is planted, not assumed: one pair never interacts | README intro | `test/silent-zero.test.ts::the planted absence holds: brakewater and greyfield never interact` |
| Ground truth is planted, not assumed: one pair meets only in telemetry, late | README intro | `test/silent-zero.test.ts::the planted presence holds: copperline reached dunmore via telemetry only` |
| The store fails the way real engines fail: a budget truncates the scan | README intro | `test/silent-zero.test.ts::a truncated search never upgrades: incomplete zero stays an observation` |
| Ingestion lag quietly excludes the freshest slice of a window | README "The tests are the point" | `test/silent-zero.test.ts::ingestion lag trims the freshest slice and blocks the upgrade` |

## The eval table and the sweep

| Claim | Where | Enforced by |
| :-- | :-- | :-- |
| Every row of the published eval table (10 cases: truth, naive reading, discipline verdict) | README table under "The five zeros" | `test/silent-zero.test.ts::the eval table is exactly the one the README publishes` |
| naive false zeros 7, discipline false zeros 1, honest zeros claimed 3 at seed 7 | README table footer | `test/silent-zero.test.ts::the eval: the naive reading fails broadly, the discipline only on a relaxed floor` |
| The one case the discipline loses is `relaxed-floor-zero` | README "relaxed-floor-zero is the discipline losing" | `test/silent-zero.test.ts::the eval: the naive reading fails broadly, the discipline only on a relaxed floor` |
| A false zero is never counted as an honest zero claimed | README table footer (3, not 4) | `test/silent-zero.test.ts::a false zero is not counted as an honest zero claimed` |
| `truncated-only-zero` fails exactly one requirement, `search.completed`, unlike the over-determined `incomplete-zero` | README after the table | `test/silent-zero.test.ts::truncated-only-zero isolates search.completed; incomplete-zero does not` |
| `absent in scope`: a claim about one source can be true while "it never happened" is false | README after the table | `test/silent-zero.test.ts::a scope-restricted absence is scored against its scope, not against the world` |
| Each reading is graded against the claim it makes — the world for the naive reading, the scope for the discipline | README after the table | `test/silent-zero.test.ts::ground truth can be asked of a scope, not only of the whole world` |
| 150 runs of 10 cases; naive false-zero rate 0.50 to 0.70, mean 0.59; 156 discipline false zeros, 150 in `relaxed-floor-zero` and 6 in `lagged-tail-zero` | README sweep paragraph, "Coverage floors" | `test/silent-zero.test.ts::the published sweep numbers reproduce exactly` |
| Zero discipline false zeros at the default coverage floor of 1.0 | README sweep paragraph | `test/silent-zero.test.ts::the sweep is measured: at the default floor the discipline loses nothing` and `::the published sweep numbers reproduce exactly` |
| The discipline's arm can lose, so the number is a measurement | README sweep paragraph | `test/silent-zero.test.ts::the sweep can fail: a relaxed floor buys claims and costs false zeros` |
| 100% of the true absences it had a fair chance at were claimed | README sweep paragraph | `test/silent-zero.test.ts::honestZeroMissRate is a rate: numerator and denominator count the same chances` and `::the published sweep numbers reproduce exactly` |

## The upgrade checklist

| Claim | Where | Enforced by |
| :-- | :-- | :-- |
| The quoted `upgrade` example output, `t=73.6` included | README "The upgrade checklist" code block | `test/silent-zero.test.ts::the checklist example in the README is the output the README quotes` |
| No unknown predicate is silently tolerated | README checklist prose | `test/silent-zero.test.ts::a tolerated unknown predicate is a malformed zero and fails query.valid` |
| No subject identifier the world has never heard of is silently tolerated | README checklist prose | `test/silent-zero.test.ts::a typoed subject id is a phantom-entity zero, not an absence` |
| The search must have completed with no cap or truncation | README checklist prose | `test/silent-zero.test.ts::a truncated search never upgrades: incomplete zero stays an observation` |
| Every source must be searchable for the whole window, outages and lag included | README checklist prose | `test/silent-zero.test.ts::an outage window is a coverage zero, not an absence`, `::ingestion lag trims the freshest slice and blocks the upgrade` |
| Any requirement unmet, the result stays an observation with the failing condition named | README checklist prose | every observation test above; `test/silent-zero.test.ts::an Elasticsearch zero from a terminated search is an observation, not an absence` pins the named list |
| The discipline applies to hits too: a hit from a degraded read carries its caveats | README "The tests are the point" | `test/silent-zero.test.ts::a hit from a degraded read is present, with the caveats attached` |

## Coverage floors

| Claim | Where | Enforced by |
| :-- | :-- | :-- |
| The default floor is 1.0 and refuses a window with ingestion lag in it | README "Coverage floors" | `test/silent-zero.test.ts::ingestion lag trims the freshest slice and blocks the upgrade` |
| The quoted relaxed-floor statement, word for word | README "Coverage floors" code block | `test/silent-zero.test.ts::the coverage-floor example in the README is the statement the README quotes` |
| "fully covered" appears only when every source measured 1.0 | README "Coverage floors" | `test/silent-zero.test.ts::a relaxed coverage floor reports the coverage it measured, not "fully covered"`, and the 100% case in `::an honest zero upgrades to absence, and the claim carries its scope` |
| A claim made below the floor carries the coverage it earned and the floor that let it through | README "Coverage floors" | `test/silent-zero.test.ts::a relaxed coverage floor reports the coverage it measured, not "fully covered"`, `::a passing coverage requirement says how much of the window it searched` |
| `compareWindows` takes the same options, so the two public APIs cannot disagree on one result | README "Coverage floors" | `test/silent-zero.test.ts::compareWindows honours the same coverage floor as upgrade` |
| Relaxing the floor cost 150 of 150 runs on a placed hole and 6 of 150 on ordinary lag | README "Coverage floors" | `test/silent-zero.test.ts::the published sweep numbers reproduce exactly` |

## Real engines

| Claim | Where | Enforced by |
| :-- | :-- | :-- |
| The quoted adapter output, both detail strings word for word | README "Real engines" code block | `test/silent-zero.test.ts::the adapter example in the README is the output the README quotes` |
| ES `terminated_early` / `timed_out` mean `completed: false` | README mapping table | `test/silent-zero.test.ts::every row of the Elasticsearch mapping table holds`, `::an Elasticsearch zero from a terminated search is an observation, not an absence` |
| ES `hits.total.relation: 'gte'` means `completed: false` | README mapping table | `test/silent-zero.test.ts::an Elasticsearch total of "gte" is a lower bound, and a lower bound is not a census` |
| ES dropped aggregation buckets mean `completed: false` | README mapping table | `test/silent-zero.test.ts::every row of the Elasticsearch mapping table holds` |
| ES `_shards.failed` drops coverage below 1 | README mapping table | `test/silent-zero.test.ts::an Elasticsearch zero from a terminated search is an observation, not an absence` |
| ES `_shards.skipped` costs coverage only under `skippedShardsSearched: false` | README mapping table | `test/silent-zero.test.ts::every row of the Elasticsearch mapping table holds` |
| BQ `jobComplete: false`, `errorResult`, or non-fatal `errors` mean `completed: false` | README mapping table | `test/silent-zero.test.ts::every row of the BigQuery mapping table holds` |
| BQ bytes billed at `maximumBytesBilled` mean `completed: false` | README mapping table | `test/silent-zero.test.ts::a BigQuery job that hit its billing ceiling never finished` |
| BQ `cacheHit` covers the window only to the instant the answer was computed | README mapping table, "A cache hit is the subtle one" | `test/silent-zero.test.ts::a BigQuery cache hit cannot cover the part of the window it never saw`, `::every row of the BigQuery mapping table holds` |
| BQ partitions read against `partitionsRequested` drop coverage below 1 | README mapping table | `test/silent-zero.test.ts::every row of the BigQuery mapping table holds` |
| `truncatedAt` stays null in both adapters: nothing is invented | README "Two rules the adapters keep" | `test/silent-zero.test.ts::every row of the Elasticsearch mapping table holds`, `::every row of the BigQuery mapping table holds` |
| Where the engine is silent the adapter withholds coverage rather than assuming it | README "Two rules the adapters keep" | `test/silent-zero.test.ts::every row of the BigQuery mapping table holds` (an undateable cache hit covers nothing) |
| `knownSources` / `knownSubjects` catch the phantom zero on real data | README "Real engines" | `test/silent-zero.test.ts::an adapter given a catalogue catches the phantom entity too`, `::every row of the Elasticsearch mapping table holds` |
| A clean engine zero does upgrade: the adapters are not a refusal machine | README "Real engines" (implied by the whole section) | `test/silent-zero.test.ts::a clean Elasticsearch zero upgrades and reports what it searched` |
| An engine that cannot say where it stopped still gets a readable failure | README adapter example output | `test/silent-zero.test.ts::an engine that cannot say where it stopped still gets a readable failure` |
| A record reporting matches while carrying no rows cannot become an absence | adapter safety, `census.consistent` | `test/silent-zero.test.ts::a record that reports matches but carries no rows cannot become an absence` |

## Baselines

| Claim | Where | Enforced by |
| :-- | :-- | :-- |
| `compareWindows` refuses unless both windows pass the same coverage checks | README "Baselines are denominators too" | `test/silent-zero.test.ts::a capped window cannot serve as a baseline` |
| The quoted `not-comparable` statement about an artifact of the budget | README "Baselines" code block | `test/silent-zero.test.ts::a capped window cannot serve as a baseline` |
| A zero baseline is not-comparable: no divide-by-zero ships as a trend | README "The tests are the point" | `test/silent-zero.test.ts::a zero baseline is not-comparable: no divide-by-zero ships as a trend` |

## Packaging

| Claim | Where | Enforced by |
| :-- | :-- | :-- |
| Zero runtime dependencies | README badge, intro, "Install" | `test/silent-zero.test.ts::zero runtime dependencies, as the README says on the tin` |
| The packed tarball imports cleanly | README "Install" | `.github/workflows/test.yml`, the "install proof" step: `npm pack`, install into a scratch project, import the published entry point |
| Node runs the TypeScript sources directly (erasable syntax, no build step to test) | README "Develop" | `npm test` itself: `node --test "test/*.test.ts"` runs the `.ts` sources, over Node 22, 24 and 26 in `.github/workflows/test.yml` |
| It typechecks and builds | README "Develop" | `npm run typecheck`, `npm run build`, both run in `.github/workflows/test.yml` |

## Not claims

Two things in the README are deliberately *not* in the table above,
because pretending they were measurements would be the error this package
is about.

- **The false-zero rates describe the battery, not your data.** The battery
  plants each failure mode on purpose, so its rates are a property of the
  battery. The README says so in the same paragraph that publishes them.
- **`query.valid` can only check identifiers you can enumerate.** Through
  `query()` the world knows its own subjects. Through an adapter, the check
  is worth exactly what the `knownSources` / `knownSubjects` you pass are
  worth; with neither supplied it passes silently, and the README says so.
