// The screenshot scenes behind ?shot=start|play|upgrade|end. Each one plays the real rules
// forward from a fresh world at the fixed step, steered by an autopilot, so the frame is what
// a real game honestly looks like and the same seed always stages the same frame: a competent
// pilot for the play and upgrade scenes (it kites the swarm, gathers embers and shoots back),
// and a helpless one for the end scene, which stands its ground and is overrun, as a frozen
// beginner is.
import { FIELD, STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';

const IDLE = { mx: 0, my: 0, aimX: FIELD.width, aimY: FIELD.height / 2, fire: false };

function nearestOf(list, from) {
  let best = null;
  let bestDist = Infinity;
  for (const item of list) {
    const d = Math.hypot(item.x - from.x, item.y - from.y);
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return best;
}

/**
 * A control that plays to live. It keeps the wisp in a fighting band around the nearest foe —
 * close enough that its sparks land, far enough to survive — strafing sideways inside the
 * band, stepping in for ember shards when nothing is near, and leading its shots a little.
 */
function competentControl(state) {
  const player = state.player;
  let mx = 0;
  let my = 0;
  const foe = nearestOf(state.enemies, player);
  if (foe) {
    const dx = player.x - foe.x;
    const dy = player.y - foe.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 235) {
      mx += (dx / d) * 2;
      my += (dy / d) * 2;
    } else if (d > 400) {
      mx -= (dx / d) * 1.2;
      my -= (dy / d) * 1.2;
    } else {
      const strafe = Math.sin(state.time * 0.9 + foe.phase) > 0 ? 1 : -1;
      mx += (-dy / d) * strafe * 0.85;
      my += (dx / d) * strafe * 0.85;
    }
    // Anything else that gets very close matters more than the band does.
    for (const enemy of state.enemies) {
      if (enemy === foe) continue;
      const ex = player.x - enemy.x;
      const ey = player.y - enemy.y;
      const ed = Math.hypot(ex, ey);
      if (ed > 0 && ed < 150) {
        mx += (ex / ed) * 1.6;
        my += (ey / ed) * 1.6;
      }
    }
  }
  const shard = nearestOf(state.shards, player);
  if (shard) {
    const sd = Math.hypot(shard.x - player.x, shard.y - player.y);
    const danger = foe ? Math.hypot(foe.x - player.x, foe.y - player.y) : Infinity;
    if (sd < 520 && danger > 190) {
      mx += ((shard.x - player.x) / (sd || 1)) * 1.25;
      my += ((shard.y - player.y) / (sd || 1)) * 1.25;
    }
  }
  // Keep off the walls, where a cornered wisp dies.
  if (player.x < 130) mx += 0.9;
  if (player.x > FIELD.width - 130) mx -= 0.9;
  if (player.y < 130) my += 0.9;
  if (player.y > FIELD.height - 130) my -= 0.9;
  if (!foe) return { mx, my, aimX: player.x + 100, aimY: player.y, fire: false };
  // Lead the target: foes mostly fly at the wisp, so aim where that flight takes them.
  const dist = Math.hypot(foe.x - player.x, foe.y - player.y);
  const flight = Math.min(0.32, dist / 650);
  const aimX = foe.x + ((player.x - foe.x) / (dist || 1)) * foe.speed * flight;
  const aimY = foe.y + ((player.y - foe.y) / (dist || 1)) * foe.speed * flight;
  return { mx, my, aimX, aimY, fire: dist < 620 };
}

/** A control that cannot last: rooted to the spot, shooting bravely at whatever comes. */
function helplessControl(state) {
  const player = state.player;
  const foe = nearestOf(state.enemies, player);
  if (!foe) return { ...IDLE };
  return { mx: 0, my: 0, aimX: foe.x, aimY: foe.y, fire: true };
}

function stepUntil(world, controlFor, seconds, until) {
  const limit = Math.floor(seconds / STEP);
  for (let i = 0; i < limit; i += 1) {
    if (world.state.pendingUpgrade) world.chooseUpgrade(0);
    world.step(STEP, controlFor(world.state));
    if (until(world.state)) return true;
  }
  return false;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best score to
 * show beside it. Unknown names stage the title.
 */
export function stageShot(name, world) {
  const state = world.state;
  if (name === 'play') {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      world.startRun();
      const lively = stepUntil(world, competentControl, 80, (s) =>
        s.time > 13 && s.bullets.length >= 3 && s.enemies.length >= 5 && !s.over);
      if (lively) return { screen: SCREEN_PLAY, best: state.score };
      if (!state.over) break;
    }
    return { screen: SCREEN_PLAY, best: state.score };
  }
  if (name === 'upgrade') {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      world.startRun();
      // Played by hand here (not stepUntil) so the world can be left frozen at the choice.
      const limit = Math.floor(300 / STEP);
      let reached = false;
      for (let i = 0; i < limit; i += 1) {
        world.step(STEP, competentControl(state));
        if (state.pendingUpgrade) {
          reached = true;
          break;
        }
        if (state.over) break;
      }
      if (reached) return { screen: SCREEN_UPGRADE, best: 0 };
      if (!state.over) break;
    }
    return { screen: SCREEN_PLAY, best: state.score };
  }
  if (name === 'end') {
    world.startRun();
    stepUntil(world, helplessControl, 900, (s) => s.over);
    if (state.over) {
      for (let i = 0; i < 40; i += 1) world.step(STEP, IDLE);
      return { screen: SCREEN_OVER, best: state.score };
    }
    return { screen: SCREEN_PLAY, best: state.score };
  }
  world.startAttract();
  for (let i = 0; i < Math.floor(4 / STEP); i += 1) world.step(STEP, IDLE);
  return { screen: SCREEN_TITLE, best: 0 };
}
