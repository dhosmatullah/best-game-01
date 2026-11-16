// Boot and the one loop. Input is read every frame, the world advances in fixed steps
// (several in a slow frame, none in a fast one) and the renderer paints what is there. The
// game moves between five screens — title, play, paused, the growth choice and game over —
// and every sound the world reports is played by the synth in audio.js.
//
// ?seed=N fixes a run's randomness. ?shot=start|play|upgrade|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
import { BEST_KEY, STEP } from './config.js';
import { createRng } from './random.js';
import {
  createWorld,
  EVENT_HIT,
  EVENT_KILL,
  EVENT_LEVELUP,
  EVENT_ORBDOWN,
  EVENT_OVER,
  EVENT_SHARD,
  EVENT_SHOOT,
  EVENT_SPLIT,
  EVENT_WAVE,
  EVENT_HURT,
} from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_UPGRADE,
  upgradeCardRect,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.1;

const EVENT_SOUNDS = {
  [EVENT_SHOOT]: 'shoot',
  [EVENT_HIT]: 'hit',
  [EVENT_KILL]: 'kill',
  [EVENT_SPLIT]: 'split',
  [EVENT_HURT]: 'hurt',
  [EVENT_SHARD]: 'shard',
  [EVENT_LEVELUP]: 'levelup',
  [EVENT_WAVE]: 'wave',
  [EVENT_ORBDOWN]: 'orbdown',
  [EVENT_OVER]: 'over',
};

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const world = createWorld(createRng(seed));
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, {
      screen: scene.screen,
      best: scene.best,
      isNewBest: false,
      hoverUpgrade: scene.screen === SCREEN_UPGRADE ? 0 : -1,
      shakeX: 0,
      shakeY: 0,
    });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const world = createWorld(createRng(seed));
  const input = createInput(canvas);
  const audio = createAudio();
  input.attach();
  world.startAttract();

  let screen = SCREEN_TITLE;
  let best = readBest();
  let isNewBest = false;
  let accumulator = 0;
  let last = performance.now();
  let overAt = -Infinity; // when the world reported the run over; the screen follows a beat later
  let overShownAt = -Infinity;
  let hoverUpgrade = -1;

  // A small handle for automated playtests: the world and the screen, nothing more.
  window.__wispward = { world, get screen() { return screen; } };

  function announce(message) {
    status.textContent = message;
  }

  function startRun() {
    world.startRun();
    isNewBest = false;
    overAt = -Infinity;
    screen = SCREEN_PLAY;
    audio.play('click');
    announce('Playing. Keep the light.');
  }

  function drainEvents() {
    for (const event of world.state.events) {
      const sound = EVENT_SOUNDS[event];
      if (sound) audio.play(sound);
      if (event === EVENT_HURT) {
        announce(world.state.player.hp === 1 ? 'Hit. One heart left.' : `Hit. ${world.state.player.hp} hearts left.`);
      }
    }
  }

  function currentControl() {
    const axis = input.moveAxis();
    return {
      mx: axis.x,
      my: axis.y,
      aimX: input.mouse.x,
      aimY: input.mouse.y,
      fire: input.mouse.down || input.isHeld('Space'),
    };
  }

  function stepOnce() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, aimX: 0, aimY: 0, fire: false });
      return;
    }
    if (screen === SCREEN_OVER) {
      world.step(STEP, { mx: 0, my: 0, aimX: 0, aimY: 0, fire: false });
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    world.step(STEP, currentControl());
    drainEvents();
    if (world.state.pendingUpgrade) {
      screen = SCREEN_UPGRADE;
      announce(`Level ${world.state.level}. Choose a gift: keys 1, 2 or 3.`);
    } else if (world.state.over && overAt === -Infinity) {
      overAt = performance.now();
      if (world.state.score > best) {
        best = world.state.score;
        isNewBest = true;
        saveBest(best);
      }
    }
  }

  function chooseAt(index) {
    world.chooseUpgrade(index);
    drainEvents();
    screen = SCREEN_PLAY;
    announce('The wisp grows. Playing.');
  }

  function cardIndexAt(x, y) {
    const choices = world.state.pendingUpgrade?.choices ?? [];
    for (let i = 0; i < choices.length; i += 1) {
      const rect = upgradeCardRect(i, choices.length);
      if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) return i;
    }
    return -1;
  }

  function handlePresses() {
    const pressed = input.takePressed();
    const clicked = input.takeClick();
    if (pressed.size > 0 || clicked) audio.unlock();
    if (pressed.has('KeyM')) {
      announce(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
    }
    const confirm = pressed.has('Enter') || pressed.has('Space') || clicked;
    if (screen === SCREEN_TITLE && confirm) {
      startRun();
      return;
    }
    if (screen === SCREEN_PLAY && (pressed.has('KeyP') || pressed.has('Escape'))) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    if (screen === SCREEN_PAUSED && (pressed.has('KeyP') || pressed.has('Escape') || pressed.has('Enter'))) {
      screen = SCREEN_PLAY;
      announce('Playing.');
      return;
    }
    if (screen === SCREEN_UPGRADE) {
      if (pressed.has('Digit1')) chooseAt(0);
      else if (pressed.has('Digit2')) chooseAt(1);
      else if (pressed.has('Digit3')) chooseAt(2);
      else if (clicked) {
        const index = cardIndexAt(input.mouse.x, input.mouse.y);
        if (index >= 0) chooseAt(index);
      }
      return;
    }
    if (screen === SCREEN_OVER && confirm && performance.now() - overShownAt > 500) {
      startRun();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handlePresses();
    if (screen === SCREEN_UPGRADE) {
      hoverUpgrade = cardIndexAt(input.mouse.x, input.mouse.y);
    }
    if (screen === SCREEN_PLAY || screen === SCREEN_TITLE || screen === SCREEN_OVER) {
      while (accumulator >= STEP) {
        stepOnce();
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY && screen !== SCREEN_TITLE && screen !== SCREEN_OVER) {
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
    }
    if (screen === SCREEN_PLAY && overAt !== -Infinity && now - overAt > 1000) {
      screen = SCREEN_OVER;
      overShownAt = now;
      announce(`The light fades. Score ${world.state.score}. Best ${best}.`);
    }
    const shake = world.state.shake;
    renderer.draw(world.state, {
      screen,
      best,
      isNewBest,
      hoverUpgrade,
      shakeX: shake > 0 ? (Math.random() * 2 - 1) * shake : 0,
      shakeY: shake > 0 ? (Math.random() * 2 - 1) * shake : 0,
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Wispward. Press Enter or click to begin.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
