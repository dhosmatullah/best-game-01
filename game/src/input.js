// Keyboard and mouse state, translated into the game's own language: which keys are held,
// where the pointer sits in field coordinates, and which one-shot presses happened since the
// last frame. main.js polls this; nothing here knows anything about the game itself.

/** Create the input tracker bound to a canvas; call `attach()` once, then read it per frame. */
export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set(); // one-shot codes, drained by takePressed()
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  function toField(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  return {
    mouse,
    attach() {
      window.addEventListener('keydown', (event) => {
        if (!event.repeat) pressed.add(event.code);
        held.add(event.code);
        if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
      });
      window.addEventListener('keyup', (event) => held.delete(event.code));
      window.addEventListener('blur', () => held.clear());
      canvas.addEventListener('mousemove', (event) => Object.assign(mouse, toField(event)));
      canvas.addEventListener('mousedown', (event) => {
        Object.assign(mouse, toField(event));
        mouse.down = true;
        mouse.clicked = true;
      });
      window.addEventListener('mouseup', () => {
        mouse.down = false;
      });
      canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    },
    /** True while the key with this KeyboardEvent.code is held down. */
    isHeld(code) {
      return held.has(code);
    },
    /** The set of one-shot presses since the last call; calling this drains the set. */
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
    /** True once per physical click; reading it consumes the click. */
    takeClick() {
      const was = mouse.clicked;
      mouse.clicked = false;
      return was;
    },
    /** The movement axis the player is asking for: {x, y} each in -1..1, from WASD or arrows. */
    moveAxis() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
  };
}
