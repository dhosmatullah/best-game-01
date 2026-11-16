// Wispward's rules and state, with no drawing and no browser in it: the wisp, its sparks, the
// four kinds of night creature, their orbs, the ember shards they drop, waves, levels and the
// growth choices between them. step() advances one fixed step under a control object (move
// axis, aim point, fire) and records what happened in state.events for the caller to hear.
// Every random draw comes from the seeded generator handed in, so a run is reproducible.
import { ENEMIES, FIELD, LEVEL, ORB, PLAYER, UPGRADES, WAVES } from './config.js';
import { pick, range } from './random.js';

export const EVENT_SHOOT = 'shoot';
export const EVENT_HIT = 'hit';
export const EVENT_KILL = 'kill';
export const EVENT_SPLIT = 'split';
export const EVENT_HURT = 'hurt';
export const EVENT_SHARD = 'shard';
export const EVENT_LEVELUP = 'levelup';
export const EVENT_WAVE = 'wave';
export const EVENT_ORBDOWN = 'orbdown';
export const EVENT_OVER = 'over';

/** Ember shards needed to leave `level` behind. */
export function xpNeedFor(level) {
  return LEVEL.base + (level - 1) * LEVEL.per;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createWorld(rng) {
  const state = {
    time: 0,
    score: 0,
    kills: 0,
    wave: 0,
    level: 1,
    xp: 0,
    xpNeed: xpNeedFor(1),
    player: null,
    bullets: [],
    enemies: [],
    orbs: [],
    shards: [],
    particles: [],
    texts: [],
    upgrades: {},
    pendingUpgrade: null,
    wavePhase: 'announce',
    phaseTimer: 0,
    spawnTimer: 0,
    budgetLeft: 0,
    banner: null,
    shake: 0,
    flash: 0,
    over: false,
    attract: false,
    events: [],
  };

  function freshPlayer() {
    return {
      x: FIELD.width / 2,
      y: FIELD.height / 2,
      radius: PLAYER.radius,
      hp: PLAYER.maxHp,
      maxHp: PLAYER.maxHp,
      invuln: 0,
      fireTimer: 0,
      dead: false,
      trail: [],
    };
  }

  // What the wisp's upgrades make of its base stats.
  const fireInterval = () => PLAYER.fireCooldown * Math.pow(0.82, state.upgrades.rapid ?? 0);
  const projectileCount = () => 1 + (state.upgrades.twin ?? 0);
  const bulletDamage = () => PLAYER.bulletDamage + (state.upgrades.heavy ?? 0);
  const bulletPierce = () => state.upgrades.pierce ?? 0;
  const moveSpeed = () => PLAYER.speed * Math.pow(1.11, state.upgrades.swift ?? 0);
  const magnetRadius = () => PLAYER.magnetRadius * Math.pow(1.55, state.upgrades.magnet ?? 0);

  function burst(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const angle = rng() * Math.PI * 2;
      const v = range(rng, speed * 0.25, speed);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: range(rng, life * 0.4, life),
        maxLife: life,
        size: range(rng, size * 0.5, size),
        color,
      });
    }
  }

  function floatText(x, y, text, color) {
    state.texts.push({ x, y, text, color, life: 0.9, maxLife: 0.9 });
  }

  function dropShards(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = rng() * Math.PI * 2;
      const v = range(rng, 30, 130);
      state.shards.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, phase: rng() * Math.PI * 2 });
    }
  }

  /** Start a fresh run: wave 1 is announced, the wisp is whole, the field is empty. */
  function startRun() {
    state.time = 0;
    state.score = 0;
    state.kills = 0;
    state.level = 1;
    state.xp = 0;
    state.xpNeed = xpNeedFor(1);
    state.player = freshPlayer();
    state.bullets.length = 0;
    state.enemies.length = 0;
    state.orbs.length = 0;
    state.shards.length = 0;
    state.particles.length = 0;
    state.texts.length = 0;
    state.upgrades = {};
    state.pendingUpgrade = null;
    state.over = false;
    state.attract = false;
    state.shake = 0;
    state.flash = 0;
    beginWave(1);
  }

  /** The title screen's backdrop: a few creatures wandering the dark, no wisp to hunt. */
  function startAttract() {
    startRun();
    state.attract = true;
    state.player.dead = true;
    state.wavePhase = 'active';
    state.budgetLeft = 0;
    state.banner = null;
    for (let i = 0; i < 7; i += 1) {
      const kind = i % 3 === 2 ? 'dart' : 'moth';
      const enemy = makeEnemy(kind, range(rng, 120, FIELD.width - 120), range(rng, 120, FIELD.height - 120));
      enemy.wander = rng() * Math.PI * 2;
      state.enemies.push(enemy);
    }
  }

  function beginWave(wave) {
    state.wave = wave;
    state.wavePhase = 'announce';
    state.phaseTimer = WAVES.announceSeconds;
    state.budgetLeft = WAVES.baseBudget + WAVES.budgetPerWave * (wave - 1);
    state.banner = { text: `WAVE ${wave}`, t: 0, ttl: WAVES.announceSeconds + 0.7 };
    state.events.push(EVENT_WAVE);
  }

  function spawnInterval() {
    return Math.max(WAVES.spawnFloor, WAVES.spawnStart - WAVES.spawnDecay * (state.wave - 1));
  }

  function makeEnemy(kind, x, y) {
    const base = ENEMIES[kind];
    const hpMul = 1 + Math.max(0, state.wave - 3) * WAVES.hpGrowth;
    const speedMul = 1 + Math.min(WAVES.speedGrowthCap, Math.max(0, state.wave - 1) * WAVES.speedGrowth);
    return {
      kind, x, y,
      hp: Math.max(base.hp, Math.floor(base.hp * hpMul)),
      maxHp: Math.max(base.hp, Math.floor(base.hp * hpMul)),
      radius: base.radius,
      speed: base.speed * speedMul * range(rng, 0.9, 1.1),
      angle: 0,
      phase: rng() * Math.PI * 2,
      orbTimer: range(rng, 1, ENEMIES.spitter.orbCooldown),
      flashT: 0,
      wander: 0,
    };
  }

  /** Which creature the night sends next, from the kinds this wave has unlocked. */
  function chooseKind() {
    const wave = state.wave;
    const roll = rng();
    if (wave >= 4 && roll < 0.12) return 'beetle';
    if (wave >= 3 && roll < 0.27) return 'spitter';
    if (wave >= 2 && roll < 0.52) return 'dart';
    return 'moth';
  }

  /** A point on a field edge, kept well away from the wisp so nothing spawns on top of it. */
  function spawnPoint() {
    const player = state.player;
    for (let tries = 0; tries < 8; tries += 1) {
      const edge = Math.floor(rng() * 4);
      const x = edge === 0 ? 26 : edge === 1 ? FIELD.width - 26 : range(rng, 26, FIELD.width - 26);
      const y = edge === 2 ? 26 : edge === 3 ? FIELD.height - 26 : range(rng, 26, FIELD.height - 26);
      if (Math.hypot(x - player.x, y - player.y) > 250) return { x, y };
    }
    return { x: 26, y: 26 };
  }

  function spawnNext() {
    let kind = chooseKind();
    if (ENEMIES[kind].cost > state.budgetLeft) kind = 'moth';
    state.budgetLeft -= ENEMIES[kind].cost;
    const point = spawnPoint();
    state.enemies.push(makeEnemy(kind, point.x, point.y));
  }

  function fireSparks(control) {
    const player = state.player;
    const count = projectileCount();
    const baseAngle = Math.atan2(control.aimY - player.y, control.aimX - player.x);
    for (let i = 0; i < count; i += 1) {
      const angle = baseAngle + (i - (count - 1) / 2) * 0.11;
      state.bullets.push({
        x: player.x + Math.cos(angle) * (PLAYER.radius + 4),
        y: player.y + Math.sin(angle) * (PLAYER.radius + 4),
        vx: Math.cos(angle) * PLAYER.bulletSpeed,
        vy: Math.sin(angle) * PLAYER.bulletSpeed,
        life: PLAYER.bulletLife,
        pierceLeft: bulletPierce(),
        hitSet: new Set(),
      });
    }
    player.fireTimer = fireInterval();
    state.events.push(EVENT_SHOOT);
  }

  function hurtPlayer() {
    const player = state.player;
    player.hp -= 1;
    player.invuln = PLAYER.invulnerableSeconds;
    state.shake = Math.min(14, state.shake + 9);
    state.flash = 1;
    state.events.push(EVENT_HURT);
    burst(player.x, player.y, 16, '#ff5d5d', 240, 0.5, 3.4);
    if (player.hp <= 0) {
      player.dead = true;
      state.over = true;
      state.events.push(EVENT_OVER);
      burst(player.x, player.y, 46, '#ffd98a', 340, 0.9, 4);
      burst(player.x, player.y, 24, '#fff6e0', 200, 1.2, 2.6);
    }
  }

  function killEnemy(enemy) {
    const base = ENEMIES[enemy.kind];
    state.score += base.score;
    state.kills += 1;
    floatText(enemy.x, enemy.y - enemy.radius - 4, `+${base.score}`, '#ffd98a');
    burst(enemy.x, enemy.y, enemy.kind === 'beetle' ? 26 : 12, enemy.kind === 'dart' ? '#7fd4c1' : '#e8a558', 220, 0.55, 3.2);
    dropShards(enemy.x, enemy.y, base.xp);
    state.events.push(EVENT_KILL);
    if (enemy.kind === 'beetle') {
      state.events.push(EVENT_SPLIT);
      for (let i = 0; i < 2; i += 1) {
        const dart = makeEnemy('dart', enemy.x + range(rng, -16, 16), enemy.y + range(rng, -16, 16));
        state.enemies.push(dart);
      }
    }
  }

  function gainXp(amount) {
    state.xp += amount;
    if (state.xp >= state.xpNeed && !state.pendingUpgrade) {
      state.level += 1;
      state.xp -= state.xpNeed;
      state.xpNeed = xpNeedFor(state.level);
      state.pendingUpgrade = { choices: rollChoices() };
      state.events.push(EVENT_LEVELUP);
    }
  }

  function rollChoices() {
    const pool = UPGRADES.filter((u) => (state.upgrades[u.id] ?? 0) < u.max);
    const choices = [];
    while (choices.length < 3 && pool.length > 0) {
      const chosen = pick(rng, pool);
      choices.push(chosen.id);
      pool.splice(pool.indexOf(chosen), 1);
    }
    while (choices.length < 3) choices.push('heart');
    return choices;
  }

  /** Apply the growth the player picked; a queued second level-up (rare) rolls again at once. */
  function chooseUpgrade(index) {
    if (!state.pendingUpgrade) return;
    const id = state.pendingUpgrade.choices[index] ?? state.pendingUpgrade.choices[0];
    state.upgrades[id] = (state.upgrades[id] ?? 0) + 1;
    if (id === 'heart') {
      state.player.maxHp += 1;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 2);
    }
    state.pendingUpgrade = null;
    state.events.push(EVENT_SHARD);
    if (state.xp >= state.xpNeed) gainXp(0);
  }

  function stepPlayer(dt, control) {
    const player = state.player;
    if (player.invuln > 0) player.invuln -= dt;
    if (player.fireTimer > 0) player.fireTimer -= dt;
    const length = Math.hypot(control.mx, control.my);
    if (length > 0 && !player.dead) {
      const speed = moveSpeed();
      player.x += (control.mx / Math.max(1, length)) * speed * dt;
      player.y += (control.my / Math.max(1, length)) * speed * dt;
      player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x));
      player.y = Math.min(FIELD.height - player.radius, Math.max(player.radius, player.y));
    }
    player.trail.push({ x: player.x, y: player.y });
    if (player.trail.length > 12) player.trail.shift();
    if (control.fire && player.fireTimer <= 0 && !player.dead) fireSparks(control);
  }

  function stepEnemies(dt) {
    const player = state.player;
    for (const enemy of state.enemies) {
      if (enemy.flashT > 0) enemy.flashT -= dt;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      let moveX = dx / dist;
      let moveY = dy / dist;
      if (state.attract) {
        enemy.wander += dt * 0.7;
        moveX = Math.cos(enemy.wander + enemy.phase);
        moveY = Math.sin(enemy.wander * 0.8 + enemy.phase);
      } else if (enemy.kind === 'dart') {
        const sway = Math.sin(state.time * 9 + enemy.phase) * 0.75;
        const px = -moveY * sway;
        const py = moveX * sway;
        moveX += px;
        moveY += py;
      } else if (enemy.kind === 'moth') {
        const sway = Math.sin(state.time * 5 + enemy.phase) * 0.3;
        moveX += -moveY * sway;
        moveY += moveX * sway;
      } else if (enemy.kind === 'spitter') {
        const rangeBand = ENEMIES.spitter.range;
        if (dist < rangeBand * 0.62) {
          moveX = -moveX;
          moveY = -moveY;
        } else if (dist < rangeBand) {
          const strafe = Math.sin(state.time * 1.4 + enemy.phase) > 0 ? 1 : -1;
          moveX = -moveY * strafe * 0.8;
          moveY = moveX * strafe * 0.8;
        }
        enemy.orbTimer -= dt;
        if (enemy.orbTimer <= 0 && dist < rangeBand * 1.5 && !player.dead) {
          enemy.orbTimer = ENEMIES.spitter.orbCooldown * range(rng, 0.85, 1.15);
          state.orbs.push({
            x: enemy.x, y: enemy.y,
            vx: (dx / dist) * ORB.speed,
            vy: (dy / dist) * ORB.speed,
            life: ORB.life,
          });
        }
      }
      const len = Math.hypot(moveX, moveY) || 1;
      enemy.x += (moveX / len) * enemy.speed * dt;
      enemy.y += (moveY / len) * enemy.speed * dt;
      enemy.x = Math.min(FIELD.width - enemy.radius, Math.max(enemy.radius, enemy.x));
      enemy.y = Math.min(FIELD.height - enemy.radius, Math.max(enemy.radius, enemy.y));
      enemy.angle = Math.atan2(moveY, moveX);
    }
    // A gentle separation pass, so the swarm reads as creatures, not a single blob.
    const list = state.enemies;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const min = a.radius + b.radius;
        if (dist > 0 && dist < min) {
          const push = ((min - dist) / 2) * 0.6;
          const ux = dx / dist;
          const uy = dy / dist;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
        }
      }
    }
  }

  function stepBullets(dt) {
    const player = state.player;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      let spent = bullet.life <= 0 || bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20;
      if (!spent) {
        for (let j = state.orbs.length - 1; j >= 0; j -= 1) {
          const orb = state.orbs[j];
          if (Math.hypot(orb.x - bullet.x, orb.y - bullet.y) < ORB.radius + PLAYER.bulletRadius + 2) {
            state.orbs.splice(j, 1);
            state.score += ORB.score;
            floatText(orb.x, orb.y - 10, `+${ORB.score}`, '#ff9de2');
            burst(orb.x, orb.y, 7, '#ff6bd5', 160, 0.35, 2.6);
            state.events.push(EVENT_ORBDOWN);
            spent = true;
            break;
          }
        }
      }
      if (!spent) {
        for (const enemy of state.enemies) {
          if (enemy.hp <= 0 || bullet.hitSet.has(enemy)) continue;
          if (Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y) < enemy.radius + PLAYER.bulletRadius) {
            bullet.hitSet.add(enemy);
            enemy.hp -= bulletDamage();
            enemy.flashT = 0.09;
            state.events.push(EVENT_HIT);
            burst(bullet.x, bullet.y, 4, '#ffe9b0', 150, 0.28, 2.2);
            if (bullet.pierceLeft > 0) bullet.pierceLeft -= 1;
            else spent = true;
            break;
          }
        }
      }
      if (spent) state.bullets.splice(i, 1);
    }
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      if (state.enemies[i].hp <= 0) {
        killEnemy(state.enemies[i]);
        state.enemies.splice(i, 1);
      }
    }
    for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
      const orb = state.orbs[i];
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      orb.life -= dt;
      let gone = orb.life <= 0;
      if (!gone && !player.dead && player.invuln <= 0 && Math.hypot(orb.x - player.x, orb.y - player.y) < ORB.radius + PLAYER.radius) {
        hurtPlayer();
        gone = true;
      }
      if (gone) state.orbs.splice(i, 1);
    }
    // Contact: a creature that reaches the wisp wounds it, then is knocked back a little.
    if (!player.dead && player.invuln <= 0) {
      for (const enemy of state.enemies) {
        if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < enemy.radius + PLAYER.radius - 2) {
          hurtPlayer();
          const away = Math.atan2(enemy.y - player.y, enemy.x - player.x);
          enemy.x += Math.cos(away) * 26;
          enemy.y += Math.sin(away) * 26;
          break;
        }
      }
    }
  }

  function stepShards(dt) {
    const player = state.player;
    const magnet = magnetRadius();
    for (let i = state.shards.length - 1; i >= 0; i -= 1) {
      const shard = state.shards[i];
      shard.vx *= 1 - 2.6 * dt;
      shard.vy *= 1 - 2.6 * dt;
      const dist = distance(shard, player);
      if (!player.dead && dist < magnet) {
        const pull = 950 * dt;
        shard.vx += ((player.x - shard.x) / (dist || 1)) * pull;
        shard.vy += ((player.y - shard.y) / (dist || 1)) * pull;
      }
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      if (!player.dead && dist < PLAYER.collectRadius) {
        state.shards.splice(i, 1);
        state.events.push(EVENT_SHARD);
        burst(shard.x, shard.y, 3, '#ffb347', 90, 0.3, 2);
        gainXp(1);
      }
    }
  }

  function stepFx(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.2 * dt;
      p.vy *= 1 - 2.2 * dt;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.texts.length - 1; i >= 0; i -= 1) {
      const t = state.texts[i];
      t.y -= 36 * dt;
      t.life -= dt;
      if (t.life <= 0) state.texts.splice(i, 1);
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2.4);
    if (state.banner) {
      state.banner.t += dt;
      if (state.banner.t > state.banner.ttl) state.banner = null;
    }
  }

  function stepWaves(dt) {
    if (state.wavePhase === 'announce') {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) state.wavePhase = 'active';
      return;
    }
    if (state.wavePhase === 'active') {
      state.spawnTimer -= dt;
      if (state.budgetLeft > 0 && state.spawnTimer <= 0) {
        spawnNext();
        state.spawnTimer = spawnInterval() * range(rng, 0.75, 1.25);
      }
      if (state.budgetLeft <= 0 && state.enemies.length === 0) {
        state.wavePhase = 'breather';
        state.phaseTimer = WAVES.breatherSeconds;
      }
      return;
    }
    // breather
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) beginWave(state.wave + 1);
  }

  /**
   * Advance one fixed step. `control` is {mx, my, aimX, aimY, fire}. While a growth choice is
   * pending or the run is over, the world holds still except for drifting sparks and texts.
   */
  function step(dt, control) {
    state.events.length = 0;
    if (state.over) {
      stepFx(dt);
      return;
    }
    if (state.pendingUpgrade) return;
    state.time += dt;
    if (!state.attract) {
      stepPlayer(dt, control);
      stepWaves(dt);
    }
    stepEnemies(dt);
    stepBullets(dt);
    stepShards(dt);
    stepFx(dt);
  }

  state.player = freshPlayer();
  return { state, startRun, startAttract, chooseUpgrade, step };
}
