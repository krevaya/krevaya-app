import type { AudioTrack, DesignDoc } from '@/doc/schema'
import { resolveLocal } from '@/persistence/local'
import { synthBuiltin } from './builtin'

const decoded = new Map<string, Promise<AudioBuffer>>()

function isFreesound(url: string) {
  return /^https:\/\/(cdn\.)?freesound\.org\//.test(url)
}

/** The URL we can actually fetch for a track source. */
export async function fetchableUrl(src: string, kind?: AudioTrack['kind']): Promise<string> {
  if (src.startsWith('local:')) return resolveLocal(src)
  if (kind === 'freesound' || isFreesound(src)) return `/api/stock/proxy?url=${encodeURIComponent(src)}`
  return src
}

async function decode(src: string, kind: AudioTrack['kind'] | undefined, sampleRate: number): Promise<AudioBuffer> {
  const res = await fetch(await fetchableUrl(src, kind), { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`couldn't load audio (${res.status})`)
  const data = await res.arrayBuffer()
  // decodeAudioData resamples to the context rate, which is what the mix needs
  const ctx = new OfflineAudioContext(1, 1, sampleRate)
  return ctx.decodeAudioData(data)
}

/** The decoded audio behind a track, cached by source and sample rate. */
export function trackBuffer(track: Pick<AudioTrack, 'preset' | 'src' | 'kind'>, sampleRate = 48000): Promise<AudioBuffer> {
  if (track.preset) return synthBuiltin(track.preset, sampleRate)
  if (!track.src) return Promise.reject(new Error('track has no source'))
  const key = `${track.src}@${sampleRate}`
  let hit = decoded.get(key)
  if (!hit) {
    hit = decode(track.src, track.kind, sampleRate)
    hit.catch(() => decoded.delete(key))
    decoded.set(key, hit)
  }
  return hit
}

/** When a track stops on the design timeline, in ms. */
export function trackEnd(track: AudioTrack, clipMs: number, designMs: number): number {
  if (track.duration) return track.start + track.duration
  if (track.loop) return designMs
  return track.start + Math.max(0, clipMs - (track.offset ?? 0))
}

/** Mix every audio track of a design into one buffer, for video export. Null when there's no audio. */
export async function renderDesignAudio(doc: DesignDoc, durationMs: number, sampleRate = 48000): Promise<AudioBuffer | null> {
  const tracks = (doc.settings.audio ?? []).filter((t) => t.volume > 0 && t.start < durationMs)
  if (!tracks.length || durationMs <= 0) return null
  const loaded = await Promise.all(tracks.map(async (t) => {
    try {
      return { t, buf: await trackBuffer(t, sampleRate) }
    } catch (e) {
      console.warn(`skipping audio track "${t.name}"`, e)
      return null
    }
  }))
  const ready = loaded.filter(Boolean) as Array<{ t: AudioTrack; buf: AudioBuffer }>
  if (!ready.length) return null

  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil((durationMs / 1000) * sampleRate), sampleRate })
  for (const { t, buf } of ready) {
    const clipMs = buf.duration * 1000
    const startS = Math.max(0, t.start) / 1000
    const endS = Math.min(durationMs, trackEnd(t, clipMs, durationMs)) / 1000
    const len = endS - startS
    if (len <= 0.005) continue
    const offset = ((t.offset ?? 0) / 1000) % buf.duration
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = !!t.loop
    const g = ctx.createGain()
    const vol = Math.min(1, Math.max(0, t.volume))
    const fadeIn = Math.min(len / 2, (t.fadeIn ?? 0) / 1000)
    const fadeOut = Math.min(len / 2, (t.fadeOut ?? 0) / 1000)
    g.gain.setValueAtTime(fadeIn ? 0 : vol, startS)
    if (fadeIn) g.gain.linearRampToValueAtTime(vol, startS + fadeIn)
    if (fadeOut) {
      g.gain.setValueAtTime(vol, endS - fadeOut)
      g.gain.linearRampToValueAtTime(0, endS)
    }
    src.connect(g).connect(ctx.destination)
    src.start(startS, offset)
    src.stop(endS)
  }
  const out = await ctx.startRendering()
  // tracks can stack past full scale; scale the whole mix down rather than clip
  let peak = 0
  for (let c = 0; c < out.numberOfChannels; c++) {
    const d = out.getChannelData(c)
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak) peak = Math.abs(d[i])
  }
  if (peak > 0.98) {
    const k = 0.98 / peak
    for (let c = 0; c < out.numberOfChannels; c++) {
      const d = out.getChannelData(c)
      for (let i = 0; i < d.length; i++) d[i] *= k
    }
  }
  return out
}
