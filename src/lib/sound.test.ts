import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SoundModule = typeof import("./sound.js");

const g = globalThis as { localStorage?: unknown; window?: unknown };

function memoryStore() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

// A fake AudioContext that counts what it makes.
function fakeAudio() {
  const made = { contexts: 0, oscillators: 0, sources: 0, resumed: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {}, gain: param(), frequency: param(), detune: param(), type: "" });
  class FakeAudioContext {
    state = "suspended";
    currentTime = 0;
    sampleRate = 48000;
    destination = node();
    constructor() {
      made.contexts++;
    }
    resume() {
      made.resumed++;
      this.state = "running";
      return Promise.resolve();
    }
    suspend() {
      this.state = "suspended";
      return Promise.resolve();
    }
    createGain = node;
    createBiquadFilter = node;
    createDynamicsCompressor = node;
    createOscillator() {
      made.oscillators++;
      return { ...node(), start() {}, stop() {} };
    }
    createBuffer(_c: number, length: number) {
      return { getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() {
      made.sources++;
      return { ...node(), buffer: null, start() {}, stop() {} };
    }
  }
  return { made, FakeAudioContext };
}

let before: { localStorage: unknown; window: unknown };
let store: ReturnType<typeof memoryStore>;
let sound: SoundModule;

beforeEach(async () => {
  before = { localStorage: g.localStorage, window: g.window };
  store = memoryStore();
  g.localStorage = store;
  vi.resetModules(); // a fresh shared context per test
  sound = await import("./sound.js");
});

afterEach(() => {
  g.localStorage = before.localStorage;
  g.window = before.window;
});

function withWindow(AudioContext?: unknown) {
  const listeners: string[] = [];
  g.window = {
    AudioContext,
    addEventListener: (type: string) => listeners.push(type),
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  };
  return listeners;
}

describe("Sounds setting (ct51.sound)", () => {
  it("defaults to On; Off is stored as \"off\"; On removes the key", () => {
    expect(sound.readSoundSetting()).toBe(true);
    sound.setSoundSetting(false);
    expect(store.map.get(sound.SOUND_KEY)).toBe("off");
    expect(sound.readSoundSetting()).toBe(false);
    sound.setSoundSetting(true);
    expect(store.map.has(sound.SOUND_KEY)).toBe(false);
    expect(sound.readSoundSetting()).toBe(true);
  });

  it("reads On when storage throws", () => {
    g.localStorage = {
      getItem() {
        throw new Error("blocked");
      },
    };
    expect(sound.readSoundSetting()).toBe(true);
  });
});

describe("playing sounds", () => {
  it("never throws without a window or an AudioContext", () => {
    g.window = undefined;
    expect(() => {
      sound.unlockAudio();
      for (const name of ["chip", "saved", "win"] as const) sound.playSound(name);
    }).not.toThrow();
    withWindow(undefined);
    expect(() => sound.playSound("chip")).not.toThrow();
  });

  it("never throws when the AudioContext itself throws", () => {
    withWindow(
      class {
        constructor() {
          throw new Error("no audio");
        }
      },
    );
    expect(() => sound.playSound("saved")).not.toThrow();
  });

  it("Off: no context is created and nothing plays", () => {
    const { made, FakeAudioContext } = fakeAudio();
    withWindow(FakeAudioContext);
    sound.setSoundSetting(false);
    sound.unlockAudio();
    sound.playSound("chip");
    sound.playSound("saved");
    sound.playSound("win");
    expect(made).toEqual({ contexts: 0, oscillators: 0, sources: 0, resumed: 0 });
  });

  it("On: one shared context, unlocked by the first pointerdown; overlapping chips each play", () => {
    const { made, FakeAudioContext } = fakeAudio();
    const listeners = withWindow(FakeAudioContext);
    sound.installSoundUnlock(g.window as Window);
    expect(listeners).toContain("pointerdown");
    sound.unlockAudio();
    sound.playSound("chip");
    sound.playSound("chip");
    sound.playSound("saved");
    expect(made.contexts).toBe(1);
    expect(made.sources).toBe(2);
    expect(made.oscillators).toBeGreaterThan(6);
  });

  it("win plays only once a tap has unlocked the context", () => {
    const { made, FakeAudioContext } = fakeAudio();
    withWindow(FakeAudioContext);
    sound.playSound("win");
    expect(made.contexts).toBe(0);
    sound.unlockAudio(); // the first tap
    sound.playSound("win");
    expect(made.oscillators).toBeGreaterThan(0);
  });
});
