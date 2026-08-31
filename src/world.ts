/** A seeded synthetic world of event records, with ground truth attached.
 *
 * The world is what actually happened; the store (store.ts) is what a
 * budgeted query engine lets you see of it. Every generator here is
 * deterministic in its seed, so the eval's numbers are reproducible and
 * the tests can pin them. */

export interface EventRecord {
  /** epoch days, fractional */
  t: number;
  source: string;
  from: string;
  to: string;
}

export interface SourceProfile {
  name: string;
  /** average records per subject per day; density prices a query */
  density: number;
  /** days of ingestion lag: the freshest slice is not yet searchable */
  ingestionLagDays: number;
  /** windows where collection was down: [start, end) in epoch days */
  outages: Array<[number, number]>;
}

export interface World {
  seed: number;
  events: EventRecord[];
  sources: SourceProfile[];
  subjects: string[];
  /** end of world time, epoch days */
  now: number;
}

/** Small deterministic PRNG (SplitMix-style) so worlds are reproducible. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z ^= z >>> 16;
    z = Math.imul(z, 0x21f0aaad);
    z ^= z >>> 15;
    z = Math.imul(z, 0x735a2d97);
    z ^= z >>> 15;
    return (z >>> 0) / 0x100000000;
  };
}

export const SUBJECTS = [
  'acct-brakewater',
  'acct-copperline',
  'acct-dunmore',
  'acct-eastgate',
  'acct-fenwick',
  'acct-greyfield'
];

export const SOURCES: SourceProfile[] = [
  { name: 'transactions', density: 2, ingestionLagDays: 0.5, outages: [] },
  { name: 'messages', density: 8, ingestionLagDays: 1, outages: [[40, 46]] },
  { name: 'telemetry', density: 60, ingestionLagDays: 2, outages: [] }
];

/** Generate 90 days of events. Two facts are planted for the eval:
 *  - brakewater and greyfield never interact anywhere (a true absence)
 *  - copperline contacts dunmore ONLY in telemetry, late in the window
 *    (present, but living in the densest and laggiest source) */
export function generateWorld(seed: number): World {
  const rand = seededRandom(seed);
  const now = 90;
  const events: EventRecord[] = [];
  for (const source of SOURCES) {
    for (const from of SUBJECTS) {
      const perDay = source.density;
      for (let day = 0; day < now; day++) {
        const n = Math.floor(perDay * (0.5 + rand()));
        for (let i = 0; i < n; i++) {
          let to = SUBJECTS[Math.floor(rand() * SUBJECTS.length)];
          // Plant the true absence: these two never touch, either direction.
          if (
            (from === 'acct-brakewater' && to === 'acct-greyfield') ||
            (from === 'acct-greyfield' && to === 'acct-brakewater')
          ) {
            to = 'acct-eastgate';
          }
          // Reserve the copperline/dunmore pair entirely for the planted
          // telemetry contacts below, so "only via telemetry, late" is exact.
          if (
            (from === 'acct-copperline' && to === 'acct-dunmore') ||
            (from === 'acct-dunmore' && to === 'acct-copperline')
          ) {
            to = 'acct-fenwick'; // from is copperline or dunmore here, never fenwick
          }
          if (to === from) continue;
          events.push({ t: day + rand(), source: source.name, from, to });
        }
      }
    }
  }
  // The buried presence, explicitly: three telemetry contacts in the last
  // ten days, inside typical ingestion lag and deep in the densest source.
  for (const t of [81.3, 84.7, 88.9]) {
    events.push({ t, source: 'telemetry', from: 'acct-copperline', to: 'acct-dunmore' });
  }
  events.sort((a, b) => a.t - b.t);
  return { seed, events, sources: SOURCES, subjects: SUBJECTS, now };
}

/** Ground truth: did the pair interact in the window, in the whole world? */
export function trueInteractions(
  world: World,
  a: string,
  b: string,
  window: [number, number]
): EventRecord[] {
  return world.events.filter(
    (e) =>
      e.t >= window[0] &&
      e.t < window[1] &&
      ((e.from === a && e.to === b) || (e.from === b && e.to === a))
  );
}
