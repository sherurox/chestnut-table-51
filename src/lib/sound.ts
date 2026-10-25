import { useSyncExternalStore } from "react";

// Sounds, generated with Web Audio (no audio files). One shared AudioContext, created and resumed on the
// first tap anywhere (pointerdown, touchend or click; installSoundUnlock in main.tsx), through a master gain. Every call is
// wrapped in try/catch: a sound never throws and never blocks input. Nothing touches `window` at import
// time (the admin screens' snapshot tests render in Node). navigator.audioSession is left alone.
// The "Sounds" setting on More is separate from Animations: reduced motion never mutes sounds.

export const SOUND_KEY = "ct51.sound";
const SOUND_EVENT = "ct51-sound-change";
const MASTER_GAIN = 0.25;

export type SoundName = "chip" | "saved" | "win";

export function readSoundSetting(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundSetting(on: boolean): void {
  try {
    if (on) localStorage.removeItem(SOUND_KEY);
    else localStorage.setItem(SOUND_KEY, "off");
  } catch {
    // storage unavailable: nothing to remember
  }
  if (!on) {
    try {
      void audio?.ctx.suspend().catch(() => {});
    } catch {
      // nothing to pause
    }
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SOUND_EVENT));
}

function subscribeSound(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SOUND_EVENT, listener);
  window.addEventListener("storage", listener); // other tabs
  return () => {
    window.removeEventListener(SOUND_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useSoundSetting(): boolean {
  return useSyncExternalStore(subscribeSound, readSoundSetting, () => true);
}

let audio: { ctx: AudioContext; out: AudioNode } | null = null;

function audioContextClass(): (new () => AudioContext) | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: new () => AudioContext }).webkitAudioContext;
}

// Creates the shared context on first use and resumes it (iOS suspends it until a tap). Sounds Off: nothing.
export function unlockAudio(): void {
  try {
    if (!readSoundSetting()) return;
    if (!audio) {
      const AudioCtx = audioContextClass();
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      // A gentle limiter so fast, overlapping chip taps layer without clipping.
      const limiter = ctx.createDynamicsCompressor();
      master.connect(limiter);
      limiter.connect(ctx.destination);
      audio = { ctx, out: master };
    }
    if (audio.ctx.state !== "running") void audio.ctx.resume().catch(() => {});
  } catch {
    // no Web Audio: stay silent
  }
}

// The events that unlock audio. iOS doesn't count a touch pointerdown as a user gesture, so resume()
// from it fails there: touchend and click do count, and pointerdown stays for everything else.
export const UNLOCK_EVENTS = ["pointerdown", "touchend", "click"] as const;

// Kept for the whole session: iOS suspends the context when the app goes to the background, and the
// next tap resumes it.
export function installSoundUnlock(target: Pick<Window, "addEventListener"> = window): void {
  try {
    for (const type of UNLOCK_EVENTS) target.addEventListener(type, unlockAudio, { capture: true, passive: true });
  } catch {
    // nothing to listen to
  }
}

interface Tone {
  type: OscillatorType;
  freq: number;
  at: number; // seconds after `t`
  dur: number;
  peak: number;
  attack?: number;
  filter?: number; // low-pass cutoff, Hz
  detune?: number;
}

function tone(ctx: AudioContext, out: AudioNode, t: number, { type, freq, at, dur, peak, attack = 0.01, filter, detune = 0 }: Tone) {
  const start = t + at;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  let dest: AudioNode = env;
  if (filter) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(filter, start);
    lp.frequency.exponentialRampToValueAtTime(filter * 0.5, start + dur);
    lp.connect(env);
    dest = lp;
  }
  env.connect(out);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  osc.connect(dest);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

let noise: AudioBuffer | null = null;

// A crisp clink (~70ms): a tick of filtered noise plus three high partials, slightly detuned each time so
// fast taps layer like real chips.
function chip(ctx: AudioContext, out: AudioNode, t: number) {
  const jitter = 0.97 + Math.random() * 0.06;
  for (const [freq, peak] of [[3150, 0.5], [4720, 0.3], [6900, 0.15]] as const) {
    tone(ctx, out, t, { type: "sine", freq: freq * jitter, at: 0, dur: 0.07, peak, attack: 0.002 });
  }
  if (!noise) {
    noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.02), ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2500;
  const g = ctx.createGain();
  g.gain.value = 0.4;
  src.connect(hp);
  hp.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(t + 0.03);
}

// A rising three-note brass sting (C5, E5, G5; ~600ms).
function saved(ctx: AudioContext, out: AudioNode, t: number) {
  const notes: [number, number, number][] = [
    [523.25, 0, 0.2],
    [659.25, 0.13, 0.2],
    [783.99, 0.26, 0.34],
  ];
  for (const [freq, at, dur] of notes) {
    for (const detune of [-6, 6]) tone(ctx, out, t, { type: "sawtooth", freq, at, dur, peak: 0.22, attack: 0.02, filter: 2400, detune });
  }
}

// A soft ta-da: a short pickup chord, then a held major chord.
function win(ctx: AudioContext, out: AudioNode, t: number) {
  for (const freq of [392, 493.88, 587.33]) tone(ctx, out, t, { type: "triangle", freq, at: 0, dur: 0.16, peak: 0.18, attack: 0.01 });
  for (const freq of [523.25, 659.25, 783.99, 1046.5]) tone(ctx, out, t, { type: "triangle", freq, at: 0.18, dur: 0.9, peak: 0.16, attack: 0.03 });
}

const SOUNDS: Record<SoundName, (ctx: AudioContext, out: AudioNode, t: number) => void> = { chip, saved, win };

// Plays a sound now. "chip" and "saved" come from a tap, so they may create the context; "win" (on
// opening Home) plays only if a tap already unlocked it in this session.
export function playSound(name: SoundName): void {
  try {
    if (!readSoundSetting()) return;
    if (name === "win") {
      if (!audio || audio.ctx.state !== "running") return;
    } else {
      unlockAudio();
    }
    if (!audio) return;
    SOUNDS[name](audio.ctx, audio.out, audio.ctx.currentTime + 0.005);
  } catch {
    // a sound is never worth an error
  }
}
