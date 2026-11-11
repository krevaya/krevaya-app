// Instruments, drums, noise and reverb that beds.ts and cues.ts play into an
// OfflineAudioContext. Randomness comes from seeded generators, never Math.random,
// so a sound is identical on every machine and in every export.

export type Ctx = BaseAudioContext

export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

const noiseCache = new WeakMap<Ctx, AudioBuffer>()

export function noiseBuffer(ctx: Ctx): AudioBuffer {
  let buf = noiseCache.get(ctx)
  if (!buf) {
    const len = Math.floor(ctx.sampleRate * 2)
    buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    const r = rng(7)
    for (let i = 0; i < len; i++) d[i] = r() * 2 - 1
    noiseCache.set(ctx, buf)
  }
  return buf
}

export function noise(ctx: Ctx, t: number, dur: number, offset = 0): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx)
  src.loop = true
  src.start(t, offset % 1.9)
  src.stop(t + dur + 0.05)
  return src
}

/** A decaying stereo noise impulse, used as a cheap room. */
export function reverb(ctx: Ctx, seconds = 2.2, decay = 3, seed = 3): ConvolverNode {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    const r = rng(seed + c * 17)
    for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, decay)
  }
  const conv = ctx.createConvolver()
  conv.buffer = buf
  return conv
}

function env(g: AudioParam, t: number, peak: number, a: number, d: number, s: number, hold: number, r: number) {
  g.setValueAtTime(0, t)
  g.linearRampToValueAtTime(peak, t + Math.max(0.001, a))
  if (s < 1) g.setTargetAtTime(peak * s, t + a, Math.max(0.002, d / 3))
  const off = t + Math.max(hold, a)
  g.setTargetAtTime(0, off, Math.max(0.003, r / 4))
}

// Melodic voices: a tiny subtractive synth driven by data.

type Wave = { type: OscillatorType; ratio?: number; detune?: number; gain?: number }

export type Voice = {
  waves: Wave[]
  a: number
  d: number
  s: number
  r: number
  gain: number
  filter?: { type?: BiquadFilterType; freq: number; q?: number; env?: number; decay?: number; track?: number }
  /** Pitch drop at the start, in semitones, for plucky attacks. */
  bend?: number
  vibrato?: number
}

export const VOICES = {
  'pad-warm': { waves: [{ type: 'sawtooth', detune: -9 }, { type: 'sawtooth', detune: 9 }, { type: 'triangle', ratio: 0.5, gain: 0.6 }], a: 0.6, d: 1, s: 0.8, r: 1.2, gain: 0.07, filter: { freq: 900, q: 0.5, env: 400, decay: 2 } },
  'pad-glass': { waves: [{ type: 'triangle', detune: -6 }, { type: 'triangle', detune: 6 }, { type: 'sine', ratio: 2, gain: 0.4 }], a: 0.8, d: 1, s: 0.85, r: 1.5, gain: 0.1, filter: { freq: 3200, q: 0.3 } },
  strings: { waves: [{ type: 'sawtooth', detune: -12 }, { type: 'sawtooth', detune: 0 }, { type: 'sawtooth', detune: 12 }], a: 0.45, d: 0.6, s: 0.9, r: 0.9, gain: 0.05, filter: { freq: 2000, q: 0.4 }, vibrato: 4 },
  epiano: { waves: [{ type: 'sine' }, { type: 'sine', ratio: 2, gain: 0.35 }, { type: 'triangle', ratio: 1, detune: 4, gain: 0.25 }], a: 0.005, d: 1.2, s: 0.25, r: 0.5, gain: 0.16 },
  piano: { waves: [{ type: 'triangle' }, { type: 'sine', ratio: 2, gain: 0.3 }, { type: 'sine', ratio: 3, gain: 0.1 }], a: 0.003, d: 1.4, s: 0.12, r: 0.4, gain: 0.18, filter: { freq: 2400, env: 2400, decay: 0.6, track: 1 } },
  pluck: { waves: [{ type: 'sawtooth' }, { type: 'square', detune: 7, gain: 0.4 }], a: 0.002, d: 0.35, s: 0.0, r: 0.2, gain: 0.12, filter: { freq: 500, q: 2, env: 3500, decay: 0.18 } },
  guitar: { waves: [{ type: 'sawtooth' }, { type: 'triangle', ratio: 2, gain: 0.3 }], a: 0.002, d: 0.9, s: 0.0, r: 0.3, gain: 0.1, filter: { freq: 700, q: 1.2, env: 2600, decay: 0.25 } },
  marimba: { waves: [{ type: 'sine' }, { type: 'sine', ratio: 4, gain: 0.25 }], a: 0.002, d: 0.45, s: 0, r: 0.15, gain: 0.22 },
  bell: { waves: [{ type: 'sine' }, { type: 'sine', ratio: 2.76, gain: 0.35 }, { type: 'sine', ratio: 5.4, gain: 0.12 }], a: 0.002, d: 1.8, s: 0, r: 1, gain: 0.13 },
  chip: { waves: [{ type: 'square' }], a: 0.002, d: 0.15, s: 0.55, r: 0.05, gain: 0.06, filter: { freq: 5000 } },
  lead: { waves: [{ type: 'sawtooth', detune: -5 }, { type: 'square', detune: 5, gain: 0.5 }], a: 0.01, d: 0.3, s: 0.6, r: 0.2, gain: 0.07, filter: { freq: 1800, q: 1, env: 1200, decay: 0.3 }, vibrato: 5 },
  stab: { waves: [{ type: 'sawtooth', detune: -8 }, { type: 'sawtooth', detune: 8 }], a: 0.003, d: 0.18, s: 0.15, r: 0.12, gain: 0.07, filter: { freq: 900, q: 3, env: 2400, decay: 0.12 } },
  organ: { waves: [{ type: 'sine' }, { type: 'sine', ratio: 2, gain: 0.5 }, { type: 'sine', ratio: 3, gain: 0.3 }], a: 0.02, d: 0.2, s: 0.9, r: 0.15, gain: 0.08 },
  swell: { waves: [{ type: 'sawtooth', detune: -10 }, { type: 'sawtooth', detune: 10 }, { type: 'triangle', ratio: 0.5, gain: 0.5 }], a: 1.6, d: 1, s: 0.95, r: 1.4, gain: 0.05, filter: { freq: 1400, q: 0.4 }, vibrato: 3.5 },
  'pad-air': { waves: [{ type: 'sine', detune: -7 }, { type: 'sine', detune: 7 }, { type: 'triangle', ratio: 2, gain: 0.15 }], a: 1.4, d: 1, s: 0.9, r: 2.2, gain: 0.11, filter: { freq: 2200, q: 0.3 } },
  nylon: { waves: [{ type: 'triangle' }, { type: 'sine', ratio: 2, gain: 0.25 }, { type: 'sawtooth', gain: 0.08 }], a: 0.002, d: 0.8, s: 0, r: 0.25, gain: 0.17, filter: { freq: 900, q: 0.8, env: 2200, decay: 0.2, track: 1 } },
  vibes: { waves: [{ type: 'sine' }, { type: 'sine', ratio: 4, gain: 0.12 }], a: 0.002, d: 1.5, s: 0, r: 0.9, gain: 0.15, vibrato: 5.5 },
  'bass-sub': { waves: [{ type: 'sine' }, { type: 'triangle', gain: 0.3 }], a: 0.005, d: 0.3, s: 0.8, r: 0.08, gain: 0.35 },
  'bass-saw': { waves: [{ type: 'sawtooth' }, { type: 'sine', ratio: 0.5, gain: 0.5 }], a: 0.004, d: 0.25, s: 0.6, r: 0.08, gain: 0.16, filter: { freq: 300, q: 4, env: 900, decay: 0.15 } },
  'bass-pluck': { waves: [{ type: 'square' }, { type: 'sine', gain: 0.6 }], a: 0.003, d: 0.3, s: 0.25, r: 0.08, gain: 0.14, filter: { freq: 250, q: 2, env: 1300, decay: 0.12 } },
  'bass-finger': { waves: [{ type: 'triangle' }, { type: 'sine', gain: 0.8 }], a: 0.006, d: 0.5, s: 0.4, r: 0.1, gain: 0.3, filter: { freq: 900 } },
} satisfies Record<string, Voice>

export type VoiceName = keyof typeof VOICES

export function playNote(ctx: Ctx, out: AudioNode, voice: Voice | VoiceName, midi: number, t: number, dur: number, vel = 1, pan = 0) {
  const v: Voice = typeof voice === 'string' ? VOICES[voice] : voice
  const f = mtof(midi)
  const g = ctx.createGain()
  env(g.gain, t, v.gain * vel, v.a, v.d, v.s, dur, v.r)
  let head: AudioNode = g
  if (v.filter) {
    const fl = ctx.createBiquadFilter()
    fl.type = v.filter.type ?? 'lowpass'
    fl.Q.value = v.filter.q ?? 0.7
    const base = v.filter.freq * (v.filter.track ? Math.pow(f / 261.6, 0.5 * v.filter.track) : 1)
    const top = Math.min(18000, base + (v.filter.env ?? 0) * vel)
    fl.frequency.setValueAtTime(top, t)
    if (v.filter.env) fl.frequency.setTargetAtTime(base, t + 0.002, (v.filter.decay ?? 0.2) / 3)
    fl.connect(g)
    head = fl
  }
  if (pan) {
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    g.connect(p).connect(out)
  } else {
    g.connect(out)
  }
  const end = t + dur + v.r * 1.5 + 0.05
  let lfo: OscillatorNode | null = null
  let lfoGain: GainNode | null = null
  if (v.vibrato) {
    lfo = ctx.createOscillator()
    lfo.frequency.value = v.vibrato
    lfoGain = ctx.createGain()
    lfoGain.gain.setValueAtTime(0, t)
    lfoGain.gain.linearRampToValueAtTime(6, t + 0.4)
    lfo.connect(lfoGain)
    lfo.start(t)
    lfo.stop(end)
  }
  for (const w of v.waves) {
    const o = ctx.createOscillator()
    o.type = w.type
    const freq = f * (w.ratio ?? 1)
    if (v.bend) {
      o.frequency.setValueAtTime(freq * Math.pow(2, v.bend / 12), t)
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.06)
    } else {
      o.frequency.value = freq
    }
    o.detune.value = w.detune ?? 0
    if (lfoGain) lfoGain.connect(o.detune)
    if (w.gain !== undefined && w.gain !== 1) {
      const wg = ctx.createGain()
      wg.gain.value = w.gain
      o.connect(wg).connect(head)
    } else {
      o.connect(head)
    }
    o.start(t)
    o.stop(end)
  }
}

// Drums

export type DrumKind = 'kick' | 'snare' | 'clap' | 'hat' | 'ohat' | 'shaker' | 'rim' | 'tom' | 'ride' | 'crash' | 'brush' | 'tick'

export function drum(ctx: Ctx, out: AudioNode, kind: DrumKind, t: number, vel = 1, tune = 1) {
  const gain = (v: number) => {
    const g = ctx.createGain()
    g.gain.value = v
    g.connect(out)
    return g
  }
  switch (kind) {
    case 'kick': {
      const o = ctx.createOscillator()
      const g = gain(0)
      o.frequency.setValueAtTime(150 * tune, t)
      o.frequency.exponentialRampToValueAtTime(48 * tune, t + 0.11)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.9 * vel, t + 0.003)
      g.gain.setTargetAtTime(0, t + 0.06, 0.09)
      o.connect(g)
      o.start(t)
      o.stop(t + 0.6)
      const click = noise(ctx, t, 0.01, t * 3.1)
      const cg = gain(0)
      cg.gain.setValueAtTime(0.25 * vel, t)
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.012)
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 3000
      click.connect(hp).connect(cg)
      return
    }
    case 'snare':
    case 'brush': {
      const soft = kind === 'brush'
      const n = noise(ctx, t, 0.35, t * 1.7)
      const bp = ctx.createBiquadFilter()
      bp.type = soft ? 'bandpass' : 'highpass'
      bp.frequency.value = soft ? 3500 : 1800
      bp.Q.value = soft ? 0.6 : 0.9
      const g = gain(0)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime((soft ? 0.18 : 0.45) * vel, t + (soft ? 0.015 : 0.002))
      g.gain.setTargetAtTime(0, t + 0.01, soft ? 0.07 : 0.05)
      n.connect(bp).connect(g)
      if (!soft) {
        const o = ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.setValueAtTime(240 * tune, t)
        o.frequency.exponentialRampToValueAtTime(160 * tune, t + 0.05)
        const og = gain(0)
        og.gain.setValueAtTime(0.4 * vel, t)
        og.gain.setTargetAtTime(0, t + 0.005, 0.03)
        o.connect(og)
        o.start(t)
        o.stop(t + 0.25)
      }
      return
    }
    case 'clap': {
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 1100 * tune
      bp.Q.value = 0.9
      const g = gain(0)
      bp.connect(g)
      g.gain.setValueAtTime(0, t)
      for (const ms of [0, 8, 17, 24]) {
        const tt = t + ms / 1000
        g.gain.setValueAtTime(0.45 * vel, tt)
        g.gain.setTargetAtTime(0.05 * vel, tt + 0.001, 0.006)
      }
      g.gain.setValueAtTime(0.3 * vel, t + 0.03)
      g.gain.setTargetAtTime(0, t + 0.031, 0.08)
      noise(ctx, t, 0.45, t * 2.3).connect(bp)
      return
    }
    case 'hat':
    case 'ohat':
    case 'shaker':
    case 'tick': {
      const len = kind === 'ohat' ? 0.09 : kind === 'shaker' ? 0.025 : kind === 'tick' ? 0.006 : 0.018
      const f = ctx.createBiquadFilter()
      f.type = kind === 'shaker' ? 'bandpass' : 'highpass'
      f.frequency.value = (kind === 'shaker' ? 5200 : kind === 'tick' ? 4000 : 8800) * tune
      f.Q.value = kind === 'shaker' ? 2 : 0.5
      const g = gain(0)
      const peak = (kind === 'shaker' ? 0.14 : kind === 'tick' ? 0.3 : 0.16) * vel
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(peak, t + (kind === 'shaker' ? 0.006 : 0.001))
      g.gain.setTargetAtTime(0, t + 0.003, len)
      noise(ctx, t, len * 6 + 0.05, t * 5.3).connect(f).connect(g)
      return
    }
    case 'ride':
    case 'crash': {
      const crash = kind === 'crash'
      const f = ctx.createBiquadFilter()
      f.type = 'highpass'
      f.frequency.value = crash ? 4000 : 6000
      const g = gain(0)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime((crash ? 0.22 : 0.08) * vel, t + 0.002)
      g.gain.setTargetAtTime(0, t + 0.01, crash ? 0.6 : 0.25)
      noise(ctx, t, crash ? 3 : 1.2, t * 7.7).connect(f).connect(g)
      if (!crash) {
        const o = ctx.createOscillator()
        o.type = 'square'
        o.frequency.value = 5200
        const og = gain(0)
        og.gain.setValueAtTime(0.012 * vel, t)
        og.gain.setTargetAtTime(0, t, 0.2)
        o.connect(og)
        o.start(t)
        o.stop(t + 1)
      }
      return
    }
    case 'rim': {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = 640 * tune
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 2300 * tune
      const g = gain(0)
      g.gain.setValueAtTime(0.9 * vel, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.035)
      o.connect(bp).connect(g)
      o.start(t)
      o.stop(t + 0.06)
      return
    }
    case 'tom': {
      const o = ctx.createOscillator()
      o.frequency.setValueAtTime(190 * tune, t)
      o.frequency.exponentialRampToValueAtTime(95 * tune, t + 0.25)
      const g = gain(0)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.6 * vel, t + 0.003)
      g.gain.setTargetAtTime(0, t + 0.04, 0.12)
      o.connect(g)
      o.start(t)
      o.stop(t + 0.8)
      return
    }
  }
}

// Chords

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  '6': [0, 4, 7, 9],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  dim: [0, 3, 6],
  '5': [0, 7, 12],
}

/** "F#m7" -> { root: 6, notes: [0, 3, 7, 10] }. Root is a pitch class. */
export function parseChord(sym: string): { root: number; notes: number[] } {
  const m = /^([A-G])([#b]?)(.*)$/.exec(sym)
  if (!m) return { root: 0, notes: QUALITY[''] }
  const root = (NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12
  return { root, notes: QUALITY[m[3]] ?? QUALITY[''] }
}

/** Chord notes as midi numbers voiced close to `center`. */
export function voiceChord(sym: string, center = 60): number[] {
  const { root, notes } = parseChord(sym)
  let base = Math.floor(center / 12) * 12 + root
  if (base > center + 3) base -= 12
  return notes.map((n) => base + n)
}

export function peakOf(buf: AudioBuffer): number {
  let peak = 0
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i])
      if (v > peak) peak = v
    }
  }
  return peak
}

export function normalize(buf: AudioBuffer, target = 0.85) {
  const peak = peakOf(buf)
  if (peak < 1e-6) return buf
  const k = target / peak
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < d.length; i++) d[i] *= k
  }
  return buf
}
