import { clamp01, lerp, type Easing } from './easing'

// Keyframe tracks shared by element moves and page changes. A track maps a
// position 0..1 to one number, either through stops or with a function for the
// shapes stops can't describe (wobbles, steps).

/** A value at a stop: a plain number, or one worked out from the subject (an element's size, say). */
export type Value<C> = number | ((c: C) => number)

/** [position, value, curve]. The curve shapes the segment that ends at this stop. */
export type Stop<C> = readonly [at: number, value: Value<C>, curve?: Easing]

export type Track<C> = ReadonlyArray<Stop<C>> | ((pos: number, c: C) => number)

const resolve = <C>(v: Value<C>, c: C) => (typeof v === 'function' ? v(c) : v)

export function sample<C>(track: Track<C>, pos: number, c: C): number {
  if (typeof track === 'function') return track(pos, c)
  const first = track[0]
  if (pos <= first[0]) return resolve(first[1], c)
  for (let i = 1; i < track.length; i++) {
    const [at, value, curve] = track[i]
    if (pos > at) continue
    const [from, prev] = track[i - 1]
    const k = at > from ? (pos - from) / (at - from) : 1
    return lerp(resolve(prev, c), resolve(value, c), (curve ?? ((x: number) => x))(clamp01(k)))
  }
  return resolve(track[track.length - 1][1], c)
}

/** Sample every track in a set at once. */
export function sampleAll<K extends string, C>(tracks: Partial<Record<K, Track<C>>>, pos: number, c: C): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {}
  for (const k in tracks) {
    const t = tracks[k]
    if (t) out[k] = sample(t, pos, c)
  }
  return out
}

/** A track that goes from `from` to `to` over the whole move. */
export const glide = <C>(from: Value<C>, to: Value<C>, curve?: Easing): Track<C> => [[0, from], [1, to, curve]]

/** Fades from nothing to full by `by` (0..1 of the move). */
export const showBy = <C>(by: number, curve?: Easing): Track<C> => [[0, 0], [by, 1, curve]]
