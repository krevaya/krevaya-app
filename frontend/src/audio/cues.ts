import { drum, noise, normalize, playNote, reverb, rng, type DrumKind, type VoiceName } from './synth'

// Short cues for moments in a design (a card flying in, a win, a hit), each a stack of
// synth parts laid out in seconds. Grouped into shelves for the Sound pane.

type Env = {
  at?: number
  gain?: number
  /** Where the loudest point sits, as a fraction of the duration (0 = a hit, 0.5 = a whoosh). */
  peak?: number
  curve?: 'exp' | 'lin'
  /** Hold at full level and cut at the end, like a held key. */
  sustain?: boolean
}

type Tone = Env & { k: 'tone'; f: number; to?: number; dur: number; wave?: OscillatorType; lp?: number; vib?: [number, number] }
type Noise = Env & { k: 'noise'; f: number; to?: number; dur: number; type?: BiquadFilterType; q?: number }
type Notes = { k: 'notes'; voice: VoiceName; notes: Array<[number, number, number?]>; gain?: number }
type Hit = { k: 'drum'; kind: DrumKind; at?: number; vel?: number; tune?: number }
type Scatter = { k: 'scatter'; layer: Tone | Noise | Hit; count: number; spread: number; at?: number; jitter?: number; fade?: 'in' | 'out' | 'both'; seed?: number }

export type Layer = Tone | Noise | Notes | Hit | Scatter
export type CueRecipe = {
  slug: string
  title: string
  shelf: string
  parts: Layer[]
  /** Reverb send, 0 = dry. */
  room: number
  /** Seeds the reverb tail. */
  seed: number
}
export type Shelf = { title: string; cues: CueRecipe[] }

const T = (f: number, dur: number, o: Partial<Tone> = {}): Tone => ({ k: 'tone', f, dur, ...o })
const N = (f: number, dur: number, o: Partial<Noise> = {}): Noise => ({ k: 'noise', f, dur, type: 'bandpass', q: 1, ...o })
const P = (voice: VoiceName, notes: Array<[number, number, number?]>, gain = 1): Notes => ({ k: 'notes', voice, notes, gain })
const D = (kind: DrumKind, at = 0, vel = 1, tune = 1): Hit => ({ k: 'drum', kind, at, vel, tune })
const S = (layer: Tone | Noise | Hit, count: number, spread: number, o: Partial<Scatter> = {}): Scatter => ({ k: 'scatter', layer, count, spread, ...o })

const cue = (slug: string, title: string, parts: Layer[], room = 0, seed = slug.length) => ({ slug, title, parts, room, seed })
const shelf = (title: string, cues: Array<Omit<CueRecipe, 'shelf'>>): Shelf => ({ title, cues: cues.map((c) => ({ ...c, shelf: title })) })

// Three short cues written for Krevaya, alongside the two loops in beds.ts.
export const CUE_SHELVES: Shelf[] = [
  shelf('Short cues', [
    cue('paper-lift', 'Paper lift', [
      N(740, 0.46, { to: 3300, q: 0.9, peak: 0.38, curve: 'lin', gain: 0.45 }),
      S(N(2100, 0.028, { type: 'highpass', gain: 0.16 }), 7, 0.24, { at: 0.06, jitter: 0.18, seed: 317 }),
      T(392, 0.18, { to: 587, at: 0.22, wave: 'triangle', gain: 0.1, peak: 0.2 }),
    ], 0.06, 1207),
    cue('small-signal', 'Small signal', [
      P('pluck', [[76, 0, 0.07], [81, 0.09, 0.08], [78, 0.22, 0.09], [85, 0.36, 0.22]], 0.75),
      T(1318.5, 0.16, { at: 0.37, wave: 'sine', gain: 0.09 }),
    ], 0.12, 2083),
    cue('last-mark', 'Last mark', [
      D('rim', 0, 0.28, 0.8),
      P('vibes', [[67, 0.04, 0.16], [74, 0.15, 0.12], [71, 0.3, 0.18], [78, 0.49, 0.45]], 0.8),
      P('pad-glass', [[55, 0.49, 0.6], [62, 0.49, 0.6]], 0.18),
    ], 0.2, 3259),
  ]),
]

export const CUES: CueRecipe[] = CUE_SHELVES.flatMap((s) => s.cues)

function shape(g: AudioParam, t: number, e: Env, dur: number) {
  const gain = e.gain ?? 1
  const tp = t + Math.max(0.002, (e.peak ?? 0) * dur)
  const end = t + dur
  g.setValueAtTime(0, t)
  g.linearRampToValueAtTime(gain, tp)
  if (e.sustain) {
    g.setValueAtTime(gain, Math.max(tp, end - 0.03))
    g.linearRampToValueAtTime(0, end)
  } else if (e.curve === 'lin') {
    g.linearRampToValueAtTime(0, Math.max(end, tp + 0.005))
  } else {
    g.setTargetAtTime(0, tp, Math.max(0.004, (end - tp) / 4))
  }
}

function sweep(p: AudioParam, t: number, from: number, to: number | undefined, dur: number) {
  p.setValueAtTime(from, t)
  if (to !== undefined && to !== from) p.exponentialRampToValueAtTime(Math.max(1, to), t + dur)
}

function layerEnd(l: Layer): number {
  switch (l.k) {
    case 'tone':
    case 'noise':
      return (l.at ?? 0) + l.dur
    case 'notes':
      return Math.max(...l.notes.map(([, at, d]) => at + (d ?? 0.3))) + 1
    case 'drum':
      return (l.at ?? 0) + (l.kind === 'crash' ? 2.5 : 0.6)
    case 'scatter':
      return (l.at ?? 0) + l.spread + layerEnd(l.layer)
  }
}

function play(ctx: BaseAudioContext, out: AudioNode, l: Layer, base: number, scale = 1, amp = 1) {
  switch (l.k) {
    case 'tone': {
      const t = base + (l.at ?? 0)
      const o = ctx.createOscillator()
      o.type = l.wave ?? 'sine'
      sweep(o.frequency, t, l.f * scale, l.to !== undefined ? l.to * scale : undefined, l.dur)
      const g = ctx.createGain()
      shape(g.gain, t, { ...l, gain: (l.gain ?? 1) * 0.5 * amp }, l.dur)
      let head: AudioNode = o
      if (l.lp) {
        const f = ctx.createBiquadFilter()
        f.frequency.value = l.lp
        head = head.connect(f)
      }
      head.connect(g).connect(out)
      if (l.vib) {
        const lfo = ctx.createOscillator()
        lfo.frequency.value = l.vib[0]
        const lg = ctx.createGain()
        lg.gain.value = l.vib[1]
        lfo.connect(lg).connect(o.frequency)
        lfo.start(t)
        lfo.stop(t + l.dur + 0.05)
      }
      o.start(t)
      o.stop(t + l.dur + 0.1)
      return
    }
    case 'noise': {
      const t = base + (l.at ?? 0)
      const f = ctx.createBiquadFilter()
      f.type = l.type ?? 'bandpass'
      f.Q.value = l.q ?? 1
      sweep(f.frequency, t, l.f * scale, l.to !== undefined ? l.to * scale : undefined, l.dur)
      const g = ctx.createGain()
      // band-passed noise is quiet; lift it so layers sit at similar levels
      const lift = f.type === 'bandpass' ? 1.6 : 0.7
      shape(g.gain, t, { ...l, gain: (l.gain ?? 1) * lift * amp }, l.dur)
      noise(ctx, t, l.dur + 0.05, t * 13 + l.f).connect(f).connect(g).connect(out)
      return
    }
    case 'notes': {
      const g = ctx.createGain()
      g.gain.value = (l.gain ?? 1) * 2 * amp
      g.connect(out)
      for (const [m, at, d] of l.notes) playNote(ctx, g, l.voice, m + 12 * Math.log2(scale), base + at, d ?? 0.15)
      return
    }
    case 'drum':
      drum(ctx, out, l.kind, base + (l.at ?? 0), (l.vel ?? 1) * amp, (l.tune ?? 1) * scale)
      return
    case 'scatter': {
      const r = rng(l.seed ?? 1)
      for (let i = 0; i < l.count; i++) {
        const x = r()
        const at = base + (l.at ?? 0) + x * l.spread
        const s = 1 + (r() * 2 - 1) * (l.jitter ?? 0)
        let a = 0.6 + r() * 0.4
        if (l.fade === 'out') a *= 1 - x * 0.85
        if (l.fade === 'in') a *= 0.15 + x * 0.85
        if (l.fade === 'both') a *= Math.sin(Math.PI * Math.min(1, x * 1.15))
        play(ctx, out, l.layer, at, scale * s, amp * a)
      }
      return
    }
  }
}

export function cueSeconds(r: CueRecipe) {
  return Math.max(...r.parts.map(layerEnd)) + (r.room ? 1 : 0.05)
}

export async function synthCue(r: CueRecipe, sampleRate: number): Promise<AudioBuffer> {
  const seconds = cueSeconds(r)
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(seconds * sampleRate), sampleRate })
  const dry = ctx.createGain()
  dry.connect(ctx.destination)
  if (r.room) {
    const room = reverb(ctx, 1.6, 3, r.seed)
    const wet = ctx.createGain()
    wet.gain.value = r.room
    dry.connect(room).connect(wet).connect(ctx.destination)
  }
  for (const l of r.parts) play(ctx, dry, l, 0.005)
  const buf = await ctx.startRendering()
  return trim(normalize(buf, 0.9))
}

/** Cut the near-silent tail so a cue doesn't end on a long gap. */
function trim(buf: AudioBuffer): AudioBuffer {
  let last = 0
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = d.length - 1; i > last; i--) {
      if (Math.abs(d[i]) > 0.0015) {
        last = i
        break
      }
    }
  }
  const len = Math.min(buf.length, last + Math.round(buf.sampleRate * 0.02))
  if (len >= buf.length - 1 || len < 64) return buf
  const out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: len, sampleRate: buf.sampleRate })
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(0, len), c)
  // short fade so the cut doesn't click
  const fade = Math.min(len, Math.round(buf.sampleRate * 0.01))
  for (let c = 0; c < out.numberOfChannels; c++) {
    const d = out.getChannelData(c)
    for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade
  }
  return out
}
