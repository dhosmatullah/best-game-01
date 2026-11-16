// Wispward's tuning constants: the field, the wisp you steer, its sparks, the swarm it faces
// and the pace at which the night deepens. Everything the simulation needs to agree on lives
// here, so world.js, render.js and shots.js never hard-code a number the others rely on.

/** The play field, in game units; the canvas is exactly this size and CSS letterboxes it. */
export const FIELD = { width: 1280, height: 800 };

/** The fixed simulation step, in seconds: the world advances in these slices and no other. */
export const STEP = 1 / 120;

/** The wisp (the player): a small lantern-spirit that must not let the swarm reach it. */
export const PLAYER = {
  radius: 14,
  speed: 268,
  maxHp: 5,
  fireCooldown: 0.21, // seconds between sparks at the base fire rate
  bulletSpeed: 650,
  bulletLife: 0.85,
  bulletRadius: 4,
  bulletDamage: 1,
  magnetRadius: 52, // ember shards inside this drift toward the wisp
  collectRadius: 20, // and are gathered inside this
  invulnerableSeconds: 1.25, // grace after a hit, so one mistake is not a death spiral
};

/** The four kinds of night creature. Health and speed are scaled a little by the wave number. */
export const ENEMIES = {
  moth: { radius: 13, hp: 2, speed: 94, score: 10, xp: 1, cost: 1 },
  dart: { radius: 10, hp: 1, speed: 172, score: 15, xp: 1, cost: 1 },
  spitter: { radius: 15, hp: 4, speed: 64, score: 25, xp: 2, cost: 2, range: 265, orbCooldown: 2.4 },
  beetle: { radius: 23, hp: 12, speed: 45, score: 40, xp: 3, cost: 3 },
};

/** Enemy orbs, spat by spitters: slow enough to dodge, and worth points if shot down. */
export const ORB = { radius: 6, speed: 178, life: 4.5, score: 5 };

/** How a run escalates: each wave spends a bigger budget, faster, on a meaner mix. */
export const WAVES = {
  baseBudget: 5, // spawn budget of wave 1; each later wave adds budgetPerWave
  budgetPerWave: 3,
  spawnStart: 1.05, // seconds between spawns on wave 1
  spawnFloor: 0.34,
  spawnDecay: 0.07,
  breatherSeconds: 2.4, // quiet beat between the last kill of a wave and the next banner
  announceSeconds: 1.7, // how long the "WAVE N" banner hangs before the swarm arrives
  hpGrowth: 0.09, // extra enemy health per wave from wave 4 on
  speedGrowth: 0.02, // extra enemy speed per wave, capped by speedGrowthCap
  speedGrowthCap: 0.4,
};

/** Ember shards needed to grow from one level to the next: need = base + (level - 1) * per. */
export const LEVEL = { base: 5, per: 4 };

/** The growth choices offered on a level-up; world.js applies them, render.js describes them. */
export const UPGRADES = [
  { id: 'rapid', name: 'Rapid Sparks', blurb: 'Fire 18% faster.', max: 4 },
  { id: 'twin', name: 'Twin Wisps', blurb: '+1 spark per shot, fanned out.', max: 3 },
  { id: 'heavy', name: 'Heavy Sparks', blurb: 'Sparks deal +1 damage.', max: 3 },
  { id: 'pierce', name: 'Piercing Light', blurb: 'Sparks pass through +1 foe.', max: 2 },
  { id: 'swift', name: 'Swift Glow', blurb: 'Move 11% faster.', max: 3 },
  { id: 'magnet', name: 'Ember Magnet', blurb: 'Shards drift in from 55% farther away.', max: 3 },
  { id: 'heart', name: 'Lantern Heart', blurb: '+1 max health, and mend 2 now.', max: 99 },
];

/** The palette the whole night is painted in: deep indigo dark, warm amber light. */
export const COLORS = {
  night: '#070b1d',
  nightFar: '#0d1434',
  ground: '#0a0f28',
  wisp: '#ffd98a',
  wispCore: '#fff6e0',
  spark: '#ffc46b',
  shard: '#ffb347',
  moth: '#dda458',
  dart: '#7fd4c1',
  spitter: '#b98ae0',
  beetle: '#8a6fd6',
  orb: '#ff6bd5',
  hurt: '#ff5d5d',
  text: '#f3ead8',
  dim: '#9aa3c7',
};

/** Font stack: system faces only, so the game loads nothing over the network. */
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'wispward.best';
