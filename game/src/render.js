// Drawing only: the world's state and the current screen in, pixels out. Wispward is painted
// as a pool of warm light in a dark indigo grove — the wisp glows, the swarm's eyes and wings
// catch the light at its edge, and everything the player must read (hearts, wave, score, the
// ember bar) sits in calm corners. Screens are drawn over the world: title, pause, the growth
// choice, and the end of the run.
import { COLORS, ENEMIES, FIELD, FONT, UPGRADES } from './config.js';
import { createRng } from './random.js';
import { xpNeedFor } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_OVER = 'over';

const CARD = { width: 308, height: 196, gap: 26, top: 318 };

/** The rectangle of growth-choice card `index` of `count`, shared with main.js for clicks. */
export function upgradeCardRect(index, count) {
  const total = count * CARD.width + (count - 1) * CARD.gap;
  return {
    x: (FIELD.width - total) / 2 + index * (CARD.width + CARD.gap),
    y: CARD.top,
    width: CARD.width,
    height: CARD.height,
  };
}

// Static ground detail, scattered once from a fixed seed: pebbles, grass tufts, faint spores.
const SPECKLES = (() => {
  const rng = createRng(20261);
  const dots = [];
  for (let i = 0; i < 130; i += 1) {
    dots.push({ x: rng() * FIELD.width, y: rng() * FIELD.height, r: 1 + rng() * 2.4, a: 0.05 + rng() * 0.1 });
  }
  return dots;
})();

// Ambient fireflies that drift over the grove on every screen, from the world's clock.
const FIREFLIES = (() => {
  const rng = createRng(777);
  const flies = [];
  for (let i = 0; i < 22; i += 1) {
    flies.push({ x: rng() * FIELD.width, y: rng() * FIELD.height, phase: rng() * Math.PI * 2, speed: 0.3 + rng() * 0.7 });
  }
  return flies;
})();

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const fonts = new Map();
  let bgGradient = null;
  let glowSprite = null;
  let tick = 0; // frames painted: animates screen furniture even when the world itself is frozen

  function font(size, weight = 400) {
    const key = `${weight}:${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align = 'center', weight = 400) {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y);
  }

  function makeGlowSprite() {
    const size = 256;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const g = off.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,205,120,0.55)');
    grad.addColorStop(0.35, 'rgba(255,170,80,0.18)');
    grad.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return off;
  }

  function drawGlow(x, y, radius) {
    ctx.drawImage(glowSprite, x - radius, y - radius, radius * 2, radius * 2);
  }

  // A soft halo in a creature's own colour, so the swarm stays readable out in the dark.
  const haloSprites = new Map();
  function haloFor(color) {
    if (!haloSprites.has(color)) {
      const size = 128;
      const off = document.createElement('canvas');
      off.width = size;
      off.height = size;
      const g = off.getContext('2d');
      const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, color + '2e');
      grad.addColorStop(1, color + '00');
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      haloSprites.set(color, off);
    }
    return haloSprites.get(color);
  }

  function drawHalo(x, y, radius, color) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(haloFor(color), x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  function drawBackground(state) {
    if (!bgGradient) {
      bgGradient = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 120, FIELD.width / 2, FIELD.height / 2, 780);
      bgGradient.addColorStop(0, COLORS.nightFar);
      bgGradient.addColorStop(1, COLORS.night);
    }
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = '#ffffff';
    for (const dot of SPECKLES) {
      ctx.globalAlpha = dot.a;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Fireflies: slow sine drift, a soft pulse of light each.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const fly of FIREFLIES) {
      const x = fly.x + Math.sin(state.time * fly.speed + fly.phase) * 34;
      const y = fly.y + Math.cos(state.time * fly.speed * 0.8 + fly.phase * 1.7) * 26;
      const pulse = 0.35 + 0.3 * Math.sin(state.time * 1.7 + fly.phase * 3);
      ctx.globalAlpha = Math.max(0.08, pulse);
      ctx.fillStyle = '#ffdf9e';
      ctx.beginPath();
      ctx.arc(x, y, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawShards(state) {
    for (const shard of state.shards) {
      const spin = state.time * 3.2 + shard.phase;
      ctx.save();
      ctx.translate(shard.x, shard.y);
      ctx.rotate(spin);
      ctx.fillStyle = COLORS.shard;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(4.6, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-4.6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COLORS.wispCore;
      ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
      ctx.restore();
    }
  }

  function drawBullets(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const bullet of state.bullets) {
      ctx.strokeStyle = COLORS.spark;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bullet.x - bullet.vx * 0.022, bullet.y - bullet.vy * 0.022);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
      ctx.fillStyle = COLORS.wispCore;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawOrbs(state) {
    for (const orb of state.orbs) {
      const pulse = 1 + Math.sin(state.time * 10 + orb.x) * 0.15;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,107,213,0.25)';
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, 11 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = COLORS.orb;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.wispCore;
      ctx.beginPath();
      ctx.arc(orb.x - 1.6, orb.y - 1.6, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMoth(enemy, flap) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.angle + Math.PI / 2);
    ctx.fillStyle = COLORS.moth;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * (0.5 + flap * 0.45));
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(side * 10, -3, 11, 6, side * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#5d3d1e';
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.5, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.shard;
    ctx.beginPath();
    ctx.arc(-2.6, -6, 1.5, 0, Math.PI * 2);
    ctx.arc(2.6, -6, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDart(enemy, flap) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.angle);
    ctx.fillStyle = COLORS.dart;
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(-9, -7.5);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-9, 7.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(127,212,193,0.5)';
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-16 - flap * 3, -3.4);
    ctx.lineTo(-16 - flap * 3, 3.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.wispCore;
    ctx.beginPath();
    ctx.arc(4, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSpitter(enemy) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.angle);
    ctx.fillStyle = COLORS.spitter;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a63b8';
    ctx.beginPath();
    ctx.arc(-3, 0, enemy.radius * 0.62, 0, Math.PI * 2);
    ctx.fill();
    // The mouth glows as an orb gathers: a fair warning, readable across the field.
    const charging = enemy.orbTimer < 0.55;
    ctx.fillStyle = charging ? COLORS.orb : '#3d2456';
    ctx.beginPath();
    ctx.arc(enemy.radius * 0.78, 0, charging ? 5.4 : 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.wispCore;
    ctx.beginPath();
    ctx.arc(-4, -5, 2, 0, Math.PI * 2);
    ctx.arc(-4, 5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBeetle(enemy, time) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.angle);
    ctx.strokeStyle = '#4c3a78';
    ctx.lineWidth = 3;
    for (const side of [-1, 1]) {
      for (let leg = -1; leg <= 1; leg += 1) {
        const sway = Math.sin(time * 6 + enemy.phase + leg) * 3;
        ctx.beginPath();
        ctx.moveTo(leg * 9, side * 14);
        ctx.lineTo(leg * 11 + sway, side * 24);
        ctx.stroke();
      }
    }
    ctx.fillStyle = COLORS.beetle;
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6d54ad';
    ctx.beginPath();
    ctx.ellipse(2, 0, 17, 13.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,12,44,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(16, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(2, 0, 9, -0.9, 0.9);
    ctx.stroke();
    // A cracked shell once it is half broken: the player can see the end coming.
    if (enemy.hp <= enemy.maxHp / 2) {
      ctx.strokeStyle = 'rgba(255,240,210,0.8)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-6, -10);
      ctx.lineTo(-1, -2);
      ctx.lineTo(-7, 5);
      ctx.moveTo(6, -11);
      ctx.lineTo(3, -3);
      ctx.lineTo(9, 4);
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.shard;
    ctx.beginPath();
    ctx.arc(15, -6, 2, 0, Math.PI * 2);
    ctx.arc(15, 6, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemies(state) {
    for (const enemy of state.enemies) {
      drawHalo(enemy.x, enemy.y, enemy.radius * 2.5, COLORS[enemy.kind]);
      const flap = Math.sin(state.time * 16 + enemy.phase);
      if (enemy.kind === 'moth') drawMoth(enemy, flap);
      else if (enemy.kind === 'dart') drawDart(enemy, flap);
      else if (enemy.kind === 'spitter') drawSpitter(enemy);
      else drawBeetle(enemy, state.time);
      if (enemy.flashT > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.75, enemy.flashT * 8);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // A sliver of health over the tougher creatures, so big fights read fairly.
      if (enemy.maxHp >= ENEMIES.spitter.hp && enemy.hp < enemy.maxHp) {
        const w = enemy.radius * 2;
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 10, w, 4);
        ctx.fillStyle = '#ffb347';
        ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 10, w * (enemy.hp / enemy.maxHp), 4);
      }
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.dead) return;
    // The fading trail of light the wisp leaves behind it.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    player.trail.forEach((point, i) => {
      const f = i / player.trail.length;
      ctx.globalAlpha = f * 0.16;
      ctx.fillStyle = COLORS.wisp;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4 + f * 8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    ctx.globalAlpha = 1;
    drawGlow(player.x, player.y, 92);
    const blink = player.invuln > 0 && Math.floor(state.time * 14) % 2 === 0;
    ctx.save();
    if (blink) ctx.globalAlpha = 0.35;
    ctx.fillStyle = COLORS.wisp;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 12.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.wispCore;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 7, 0, Math.PI * 2);
    ctx.fill();
    // Two attendant sparks in slow orbit.
    for (let i = 0; i < 2; i += 1) {
      const a = state.time * 2.6 + i * Math.PI;
      ctx.fillStyle = COLORS.shard;
      ctx.beginPath();
      ctx.arc(player.x + Math.cos(a) * 19, player.y + Math.sin(a) * 19, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawTexts(state) {
    for (const t of state.texts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
      text(t.text, t.x, t.y, 17, t.color, 'center', 700);
      ctx.restore();
    }
  }

  /** Darkness gathers at the field's edge; the wisp's light holds a clearing around it. */
  function drawNight(state) {
    const focus = state.attract
      ? { x: FIELD.width / 2, y: FIELD.height / 2 }
      : state.player;
    const grad = ctx.createRadialGradient(focus.x, focus.y, 120, focus.x, focus.y, 465);
    grad.addColorStop(0, 'rgba(3,5,16,0)');
    grad.addColorStop(1, 'rgba(3,5,16,0.66)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,45,45,${(state.flash * 0.16).toFixed(3)})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (!state.attract && state.player.hp === 1 && !state.player.dead) {
      const pulse = 0.05 + 0.04 * Math.sin(state.time * 5);
      ctx.fillStyle = `rgba(255,45,45,${pulse.toFixed(3)})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  function heartPath(x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.9);
    ctx.bezierCurveTo(x - size * 1.15, y + size * 0.1, x - size * 0.55, y - size * 0.95, x, y - size * 0.3);
    ctx.bezierCurveTo(x + size * 0.55, y - size * 0.95, x + size * 1.15, y + size * 0.1, x, y + size * 0.9);
    ctx.closePath();
  }

  function drawHud(state, best, showBanner = true) {
    const player = state.player;
    for (let i = 0; i < player.maxHp; i += 1) {
      const x = 34 + i * 30;
      heartPath(x, 36, 11);
      if (i < player.hp) {
        ctx.fillStyle = COLORS.hurt;
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(243,234,216,0.4)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }
    text(`LEVEL ${state.level}`, 34, 66, 15, COLORS.dim, 'left', 700);
    text(`WAVE ${Math.max(1, state.wave)}`, FIELD.width / 2, 34, 27, COLORS.text, 'center', 800);
    const foes = state.budgetLeft + state.enemies.length;
    if (state.wavePhase === 'active' && foes > 0) {
      text(`${foes} in the dark`, FIELD.width / 2, 62, 14, COLORS.dim, 'center', 400);
    } else if (state.wavePhase === 'breather') {
      text('a breath of quiet…', FIELD.width / 2, 62, 14, COLORS.dim, 'center', 400);
    }
    text(String(state.score).padStart(6, '0'), FIELD.width - 30, 32, 26, COLORS.text, 'right', 800);
    text(`BEST ${best}`, FIELD.width - 30, 60, 14, COLORS.dim, 'right', 400);
    // The ember bar along the bottom: how close the next growth is.
    const frac = Math.min(1, state.xp / state.xpNeed);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(0, FIELD.height - 9, FIELD.width, 9);
    ctx.fillStyle = COLORS.shard;
    ctx.fillRect(0, FIELD.height - 9, FIELD.width * frac, 9);
    text('WASD / arrows — move · mouse — aim · hold click — fire · P — pause · M — sound', FIELD.width / 2, FIELD.height - 26, 13.5, 'rgba(154,163,199,0.75)', 'center', 400);
    if (state.banner && showBanner) {
      const b = state.banner;
      const fade = b.t < 0.25 ? b.t / 0.25 : b.t > b.ttl - 0.4 ? Math.max(0, (b.ttl - b.t) / 0.4) : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      text(b.text, FIELD.width / 2, 170, 54, COLORS.wisp, 'center', 800);
      ctx.restore();
    }
  }

  function panel(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(9,13,32,0.92)';
    ctx.strokeStyle = 'rgba(255,179,71,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 18);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawTitle(state, best) {
    drawGlow(FIELD.width / 2, 300, 330);
    text('W I S P W A R D', FIELD.width / 2, 268, 96, COLORS.wisp, 'center', 800);
    text('Keep the light. Outlast the swarm.', FIELD.width / 2, 336, 24, COLORS.text, 'center', 400);
    text('The night sends moths, darts, spitters and beetles to snuff out your lantern.', FIELD.width / 2, 396, 18, COLORS.dim);
    text('Burn them down with sparks, gather their embers, and grow stronger between waves.', FIELD.width / 2, 424, 18, COLORS.dim);
    text('MOVE  WASD / arrow keys        AIM  mouse        FIRE  hold click or Space', FIELD.width / 2, 478, 17.5, COLORS.text, 'center', 700);
    text('Gather embers to level up and choose a gift. Five hearts is all the dark allows.', FIELD.width / 2, 508, 16, COLORS.dim);
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.2);
    ctx.save();
    ctx.globalAlpha = pulse;
    text('—  PRESS ENTER OR CLICK TO BEGIN  —', FIELD.width / 2, 576, 23, COLORS.shard, 'center', 800);
    ctx.restore();
    if (best > 0) text(`BEST ${best}`, FIELD.width / 2, 622, 16, COLORS.dim, 'center', 700);
  }

  function wrapBlurb(blurb) {
    const words = blurb.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).trim().length > 24 && line) {
        lines.push(line);
        line = word;
      } else {
        line = (line + ' ' + word).trim();
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }

  function drawUpgrade(state, hover) {
    ctx.fillStyle = 'rgba(3,5,14,0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    text('THE WISP GROWS', FIELD.width / 2, 218, 46, COLORS.wisp, 'center', 800);
    text(`Level ${state.level} — choose one gift  (keys 1 · 2 · 3, or click)`, FIELD.width / 2, 262, 19, COLORS.dim);
    const choices = state.pendingUpgrade.choices;
    choices.forEach((id, i) => {
      const def = UPGRADES.find((u) => u.id === id);
      const rect = upgradeCardRect(i, choices.length);
      const owned = state.upgrades[id] ?? 0;
      ctx.save();
      ctx.fillStyle = i === hover ? 'rgba(38,32,66,0.97)' : 'rgba(13,18,44,0.95)';
      ctx.strokeStyle = i === hover ? COLORS.shard : 'rgba(255,179,71,0.35)';
      ctx.lineWidth = i === hover ? 2.4 : 1.4;
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y - (i === hover ? 5 : 0), rect.width, rect.height, 14);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      const cx = rect.x + rect.width / 2;
      text(`[ ${i + 1} ]`, cx, rect.y + 30, 15, COLORS.dim, 'center', 700);
      text(def.name, cx, rect.y + 66, 24.5, COLORS.text, 'center', 800);
      wrapBlurb(def.blurb).forEach((line, li) => {
        text(line, cx, rect.y + 104 + li * 24, 16.5, COLORS.dim);
      });
      const pips = owned === 0 ? 'new gift' : `taken ${owned}×`;
      text(pips, cx, rect.y + rect.height - 24, 14.5, COLORS.shard, 'center', 700);
    });
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function drawOver(state, best, isNewBest) {
    ctx.fillStyle = 'rgba(3,5,14,0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    panel(FIELD.width / 2 - 330, 168, 660, 430);
    text('THE LIGHT FADES', FIELD.width / 2, 238, 52, COLORS.wisp, 'center', 800);
    text('SCORE', FIELD.width / 2, 300, 15, COLORS.dim, 'center', 700);
    text(String(state.score), FIELD.width / 2, 344, 56, COLORS.text, 'center', 800);
    if (isNewBest) text('★ NEW BEST ★', FIELD.width / 2, 388, 17, COLORS.shard, 'center', 800);
    const rows = [
      ['Wave reached', String(Math.max(1, state.wave))],
      ['Time in the light', formatTime(state.time)],
      ['Foes burned', String(state.kills)],
      ['Best score', String(best)],
    ];
    rows.forEach(([label, value], i) => {
      const y = 428 + i * 34;
      text(label, FIELD.width / 2 - 22, y, 17, COLORS.dim, 'right');
      text(value, FIELD.width / 2 + 22, y, 17.5, COLORS.text, 'left', 700);
    });
    const pulse = 0.65 + 0.35 * Math.sin(tick * 0.09);
    ctx.save();
    ctx.globalAlpha = pulse;
    text('—  ENTER OR CLICK: TRY AGAIN  —', FIELD.width / 2, 566, 20, COLORS.shard, 'center', 800);
    ctx.restore();
  }

  function drawPaused(state) {
    ctx.fillStyle = 'rgba(3,5,14,0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    text('PAUSED', FIELD.width / 2, 360, 54, COLORS.text, 'center', 800);
    text('P or Esc — resume · M — sound on/off', FIELD.width / 2, 420, 19, COLORS.dim);
  }

  /**
   * Paint one frame. `view` is {screen, best, isNewBest, hoverUpgrade, shakeX, shakeY}: the
   * screen to draw over the world, and the pointer's growth-card hover for the choice screen.
   */
  function draw(state, view) {
    tick += 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, FIELD.width, FIELD.height);
    ctx.save();
    ctx.translate(view.shakeX || 0, view.shakeY || 0);
    drawBackground(state);
    drawShards(state);
    drawEnemies(state);
    drawOrbs(state);
    drawBullets(state);
    drawPlayer(state);
    drawParticles(state);
    drawNight(state);
    drawTexts(state);
    ctx.restore();
    if (view.screen === SCREEN_TITLE) {
      drawTitle(state, view.best);
      return;
    }
    drawHud(state, view.best, view.screen !== SCREEN_UPGRADE);
    if (view.screen === SCREEN_PAUSED) drawPaused(state);
    else if (view.screen === SCREEN_UPGRADE) drawUpgrade(state, view.hoverUpgrade ?? -1);
    else if (view.screen === SCREEN_OVER) drawOver(state, view.best, view.isNewBest);
  }

  if (!glowSprite) glowSprite = makeGlowSprite();
  return { draw };
}
