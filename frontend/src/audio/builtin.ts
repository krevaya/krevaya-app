import { BEDS, bedLength, synthBed } from './beds'
import { CUES, CUE_SHELVES, cueSeconds, synthCue } from './cues'

// Sounds that ship with the app. They're synthesised in the browser from the recipes in
// beds.ts and cues.ts (CC0), so nothing is downloaded. Tracks refer to them
// as `bed:<slug>` or `cue:<slug>`.

export type BedItem = { ref: string; title: string; use: string; energy: 1 | 2 | 3; lengthMs: number }
export type CueItem = { ref: string; title: string; shelf: string; lengthMs: number }

export const BED_ITEMS: BedItem[] = BEDS.map((r) => ({
  ref: `bed:${r.slug}`,
  title: r.title,
  use: r.use,
  energy: r.energy,
  lengthMs: Math.round(bedLength(r).seconds * 1000),
}))

export const CUE_ITEMS: CueItem[] = CUES.map((r) => ({
  ref: `cue:${r.slug}`,
  title: r.title,
  shelf: r.shelf,
  lengthMs: Math.round(cueSeconds(r) * 1000),
}))

export const BED_USES = [...new Set(BEDS.map((r) => r.use))]
export const CUE_SHELF_TITLES = CUE_SHELVES.map((s) => s.title)

const rendered = new Map<string, Promise<AudioBuffer>>()

/** Synthesise a built-in bed or cue. Cached per ref and sample rate. */
export function synthBuiltin(ref: string, sampleRate = 48000): Promise<AudioBuffer> {
  const key = `${ref}@${sampleRate}`
  let hit = rendered.get(key)
  if (!hit) {
    const bed = BEDS.find((b) => ref === `bed:${b.slug}`)
    const cue = CUES.find((c) => ref === `cue:${c.slug}`)
    if (bed) hit = synthBed(bed, sampleRate)
    else if (cue) hit = synthCue(cue, sampleRate)
    else return Promise.reject(new Error(`unknown built-in sound ${ref}`))
    hit.catch(() => rendered.delete(key))
    rendered.set(key, hit)
  }
  return hit
}
