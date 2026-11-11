import { drum, noise, normalize, parseChord, playNote, reverb, rng, voiceChord, type DrumKind, type VoiceName } from './synth'

// Background beds: short songs written as step patterns that repeat until the design
// ends. 16 steps make a bar; a 32-step pattern covers two.
//   drums: X loud, x normal, . ghost, - rest
//   keys:  x hit, = hold, - rest (plays the whole chord)
//   bass:  r root, o octave up, f fifth, t third, l octave down, = hold, - rest
//   arp:   0-9 chord tones going up (wrapping by octave), = hold, - rest

export type BedRecipe = {
  slug: string
  title: string
  /** What kind of design it suits; the Sound pane groups by this. */
  use: string
  /** 1 gentle, 2 steady, 3 lively. */
  energy: 1 | 2 | 3
  tempo: number
  /** Seeds the small timing and velocity wobble. */
  seed: number
  chords: string[]
  /** Chords per bar. */
  per?: number
  swing?: number
  pad?: VoiceName
  padOctave?: number
  keys?: { voice: VoiceName; rhythm: string; octave?: number; spread?: number }
  bass?: { voice: VoiceName; line: string; octave?: number }
  arp?: { voice: VoiceName; line: string; octave?: number }
  drums?: Partial<Record<DrumKind, string>>
  /** Drum parts used on the last bar instead. */
  fill?: Partial<Record<DrumKind, string>>
  verb?: number
  crackle?: boolean
  /** Bars in the loop; defaults to one pass through the chords, at least 4. */
  bars?: number
}

// Two background loops written for Krevaya. These scores and the three cues
// in cues.ts are the whole bundled sound library.
export const BEDS: BedRecipe[] = [
  {
    slug: 'slow-sketch', title: 'Slow sketch', use: 'Focus', energy: 1, tempo: 78, seed: 54821,
    chords: ['Gmaj9', 'Bm7', 'Cmaj7', 'Am9', 'D7', 'G6'], bars: 6, swing: 0.12,
    keys: { voice: 'nylon', rhythm: 'x=====----x===--', octave: 55, spread: 0.022 },
    arp: { voice: 'epiano', line: '--3---1--4---2--', octave: 67 },
    bass: { voice: 'bass-finger', line: 'r======---f===--', octave: 36 },
    drums: { brush: '----x-------x---', shaker: '--x----x--x---x-' }, verb: 0.28,
  },
  {
    slug: 'line-work', title: 'Line work', use: 'Movement', energy: 2, tempo: 112, seed: 90347,
    chords: ['F6', 'Dm9', 'Bbmaj7', 'Cadd9', 'Am7', 'D7', 'Gm9', 'Csus4'], bars: 8,
    keys: { voice: 'epiano', rhythm: 'x--x--x---x--x--', octave: 60, spread: 0.009 },
    arp: { voice: 'marimba', line: '--2-4--1---3--5-', octave: 72 },
    bass: { voice: 'bass-pluck', line: 'r---t--f--r---o-', octave: 36 },
    drums: { kick: 'x-----x---x--x--', rim: '----x-------x--.', hat: '--x-x--x--x-x-x-' },
    fill: { kick: 'x-----x---x--x--', rim: '----x-----x--x.x', hat: '--x-x--x--x-x-xx' }, verb: 0.16,
  },
]

const TAIL = 2.5

export function bedLength(r: BedRecipe) {
  const per = r.per ?? 1
  let bars = r.bars ?? Math.ceil(r.chords.length / per)
  while (bars < 4) bars *= 2
  return { bars, seconds: (bars * 4 * 60) / r.tempo }
}

const velOf = (ch: string) => (ch === 'X' ? 1 : ch === 'x' ? 0.75 : ch === '.' ? 0.35 : 0)

/** How many steps a note started at `i` lasts: itself plus any following holds. */
function held(pat: string, i: number) {
  let n = 1
  while (n < 32 && pat[(i + n) % pat.length] === '=') n++
  return n
}

export async function synthBed(r: BedRecipe, sampleRate: number): Promise<AudioBuffer> {
  const { bars, seconds } = bedLength(r)
  const len = Math.round(seconds * sampleRate)
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: len + Math.round(TAIL * sampleRate), sampleRate })
  const rand = rng(r.seed)

  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.ratio.value = 3
  comp.attack.value = 0.01
  comp.release.value = 0.2
  comp.connect(ctx.destination)
  const master = ctx.createGain()
  master.gain.value = 0.8
  master.connect(comp)
  const room = reverb(ctx, 2.4, 3.2, r.tempo)
  const wet = ctx.createGain()
  wet.gain.value = r.verb ?? 0.2
  room.connect(wet).connect(master)
  const bus = (send: number) => {
    const g = ctx.createGain()
    g.connect(master)
    if (send) {
      const s = ctx.createGain()
      s.gain.value = send
      g.connect(s).connect(room)
    }
    return g
  }
  const melodic = bus(1)
  const low = bus(0.15)
  const drums = bus(0.25)

  const per = r.per ?? 1
  const step = 60 / r.tempo / 4
  const steps = bars * 16
  const stepsPerChord = 16 / per
  const chordAt = (s: number) => r.chords[Math.floor(s / stepsPerChord) % r.chords.length]
  const timeOf = (s: number) => s * step + (s % 2 === 1 ? (r.swing ?? 0) * step : 0)
  const human = () => 0.9 + rand() * 0.1

  // pads: one sustained chord per chord slot
  if (r.pad) {
    for (let s = 0; s < steps; s += stepsPerChord) {
      for (const n of voiceChord(chordAt(s), r.padOctave ?? 60)) {
        playNote(ctx, melodic, r.pad, n, timeOf(s), stepsPerChord * step * 0.98, 0.8)
      }
    }
  }

  for (let s = 0; s < steps; s++) {
    const t = timeOf(s)
    const chord = chordAt(s)
    if (r.keys) {
      const ch = r.keys.rhythm[s % r.keys.rhythm.length]
      if (ch === 'x') {
        const dur = held(r.keys.rhythm, s % r.keys.rhythm.length) * step * 0.95
        voiceChord(chord, r.keys.octave ?? 60).forEach((n, i) => {
          const pan = (i - 1.5) * 0.15
          playNote(ctx, melodic, r.keys!.voice, n, t + i * (r.keys!.spread ?? 0), dur, human() * (s % 4 === 0 ? 1 : 0.8), pan)
        })
      }
    }
    if (r.bass) {
      const line = r.bass.line
      const ch = line[s % line.length]
      if (ch !== '-' && ch !== '=') {
        const { root, notes } = parseChord(chord)
        const base = r.bass.octave ?? 36
        let m = base + root
        if (m > base + 6) m -= 12
        if (ch === 'o') m += 12
        if (ch === 'f') m += 7
        if (ch === 't') m += notes[1] - notes[0]
        if (ch === 'l') m -= 12
        playNote(ctx, low, r.bass.voice, m, t, held(line, s % line.length) * step * 0.9, human())
      }
    }
    if (r.arp) {
      const line = r.arp.line
      const ch = line[s % line.length]
      if (ch >= '0' && ch <= '9') {
        const tones = voiceChord(chord, r.arp.octave ?? 72)
        const i = Number(ch)
        const n = tones[i % tones.length] + 12 * Math.floor(i / tones.length)
        playNote(ctx, melodic, r.arp.voice, n, t, held(line, s % line.length) * step * 0.9, human() * 0.85, (rand() - 0.5) * 0.4)
      }
    }
    const kit = r.fill && s >= steps - 16 ? r.fill : r.drums
    if (kit) {
      for (const [kind, pat] of Object.entries(kit) as Array<[DrumKind, string]>) {
        const v = velOf(pat[s % pat.length])
        if (v) drum(ctx, drums, kind, t, v * human())
      }
    }
  }

  if (r.crackle) {
    const vinyl = ctx.createGain()
    vinyl.gain.value = 0.02
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800
    bp.Q.value = 0.4
    noise(ctx, 0, seconds + TAIL).connect(bp).connect(vinyl).connect(master)
    const pops = Math.round(seconds * 6)
    for (let i = 0; i < pops; i++) drum(ctx, master, 'tick', rand() * seconds, 0.15 + rand() * 0.25)
  }

  const out = await ctx.startRendering()
  // Fold the tail (reverb, releases) back onto the start so the loop wraps cleanly.
  const loop = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate })
  const tail = out.length - len
  for (let c = 0; c < 2; c++) {
    const src = out.getChannelData(c)
    const dst = loop.getChannelData(c)
    dst.set(src.subarray(0, len))
    for (let i = 0; i < tail && i < len; i++) dst[i] += src[len + i]
  }
  return normalize(loop, 0.8)
}
