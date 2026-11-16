// All of Wispward's sound is synthesized with WebAudio — no audio files. Short oscillator and
// noise voices make the effects (a spark's snap, a moth's pop, the wisp's hurt cry), and a tiny
// lookahead sequencer loops a slow A-minor bass-and-sparkle tune under the game. The context is
// created lazily on the first user gesture, as browsers require; until then play() is silent.

const BASS_ROOTS = [110, 87.31, 130.81, 98]; // A2, F2, C3, G2 — one bar each, looping
const ARP_SCALE = [220, 261.63, 329.63, 392, 440, 523.25, 659.25]; // A minor, for the sparkle
const STEP_SECONDS = 0.215; // sequencer step: an eighth note at about 140 bpm

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let muted = false;
  let step = 0;
  let nextStepAt = 0;

  /** Create the context and start the music; safe to call on every gesture (it runs once). */
  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    ctx = new AudioCtor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.14;
    musicBus.connect(master);
    nextStepAt = ctx.currentTime + 0.1;
    window.setInterval(scheduleMusic, 90);
  }

  /** One oscillator voice with an exponential decay envelope. */
  function tone({ freq, freqEnd = null, type = 'sine', dur = 0.15, vol = 0.3, delay = 0, bus = null }) {
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), start + dur);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(gain).connect(bus ?? master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  /** One burst of filtered white noise (pops, bursts, the crunch of a beetle splitting). */
  function noise({ dur = 0.15, vol = 0.25, freq = 1200, delay = 0 }) {
    const start = ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
  }

  /** The sequencer: schedules the steps that fall inside the next lookahead window. */
  function scheduleMusic() {
    if (!ctx || ctx.state !== 'running') return;
    while (nextStepAt < ctx.currentTime + 0.25) {
      const delay = Math.max(0, nextStepAt - ctx.currentTime);
      const bar = Math.floor(step / 8) % BASS_ROOTS.length;
      if (step % 2 === 0) {
        tone({ freq: BASS_ROOTS[bar], type: 'triangle', dur: 0.34, vol: 0.5, delay, bus: musicBus });
      }
      if (Math.random() < 0.42) {
        const note = ARP_SCALE[Math.floor(Math.random() * ARP_SCALE.length)];
        tone({ freq: note * 2, type: 'sine', dur: 0.22, vol: 0.16, delay, bus: musicBus });
      }
      step += 1;
      nextStepAt += STEP_SECONDS;
    }
  }

  const EFFECTS = {
    shoot() {
      tone({ freq: 840 + Math.random() * 120, freqEnd: 480, type: 'square', dur: 0.06, vol: 0.07 });
    },
    hit() {
      tone({ freq: 300, freqEnd: 190, type: 'square', dur: 0.05, vol: 0.08 });
    },
    kill() {
      noise({ dur: 0.14, vol: 0.2, freq: 900 });
      tone({ freq: 320, freqEnd: 70, type: 'square', dur: 0.16, vol: 0.14 });
    },
    split() {
      noise({ dur: 0.22, vol: 0.26, freq: 600 });
      tone({ freq: 180, freqEnd: 50, type: 'sawtooth', dur: 0.22, vol: 0.16 });
    },
    hurt() {
      tone({ freq: 170, freqEnd: 65, type: 'sawtooth', dur: 0.28, vol: 0.3 });
      noise({ dur: 0.2, vol: 0.2, freq: 500 });
    },
    shard() {
      tone({ freq: 1180, freqEnd: 1760, type: 'sine', dur: 0.07, vol: 0.12 });
    },
    levelup() {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        tone({ freq, type: 'sine', dur: 0.16, vol: 0.16, delay: i * 0.07 });
      });
    },
    wave() {
      tone({ freq: 196, type: 'triangle', dur: 0.22, vol: 0.22 });
      tone({ freq: 261.63, type: 'triangle', dur: 0.3, vol: 0.22, delay: 0.12 });
    },
    orbdown() {
      tone({ freq: 480, freqEnd: 920, type: 'square', dur: 0.07, vol: 0.1 });
    },
    click() {
      tone({ freq: 700, type: 'sine', dur: 0.04, vol: 0.12 });
    },
    over() {
      [392, 329.63, 261.63, 196].forEach((freq, i) => {
        tone({ freq, type: 'triangle', dur: 0.34, vol: 0.2, delay: i * 0.16 });
      });
    },
  };

  return {
    unlock,
    /** Play a named effect ('shoot', 'kill', ...); silent before unlock() and while muted. */
    play(name) {
      if (!ctx || ctx.state !== 'running') return;
      const effect = EFFECTS[name];
      if (effect) effect();
    },
    /** Mute or unmute everything, music included. Returns the new muted state. */
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
