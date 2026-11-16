// A tiny seeded random generator (mulberry32). The world draws every random number from one
// of these, so a run — and a screenshot staged from it — is exactly reproducible from its seed.

/** Create a generator from a numeric seed; each call returns a float in [0, 1). */
export function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max) from the generator. */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** One element of `items`, chosen by the generator. */
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}
