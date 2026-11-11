import type { IconBody, IconSetIndex } from 'virtual:iconify'

export type { IconBody }

export type IconSet = Omit<IconSetIndex, 'names'> & { list: string[] }
export type IconIndex = { sets: IconSet[]; emoji: IconSet; categories: Array<{ name: string; items: number[] }> }
/** One icon in a set, by position in the set's name list. */
export type IconHit = { set: IconSet; i: number }

let indexP: Promise<IconIndex> | null = null

/** Names of every icon and emoji. Around 120 KB gzipped, so only loaded when the panel needs it. */
export function loadIconIndex(): Promise<IconIndex> {
  if (!indexP) {
    indexP = import('virtual:iconify').then((m) => {
      const prep = ({ names, ...s }: IconSetIndex): IconSet => ({ ...s, list: names.split(',') })
      return { sets: m.iconSets.map(prep), emoji: prep(m.emojiSet), categories: m.emojiCategories }
    })
    indexP.catch(() => {
      indexP = null
    })
  }
  return indexP
}

const chunks = new Map<string, Promise<Record<string, IconBody>>>()
const loaded = new Map<string, Record<string, IconBody>>()

function chunkOf(set: IconSet, i: number): number {
  let lo = 0
  let hi = set.starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (set.starts[mid] <= i) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** The icon if its chunk is already here. */
export function iconNow(hit: IconHit): IconBody | undefined {
  return loaded.get(`${hit.set.prefix}/${chunkOf(hit.set, hit.i)}`)?.[hit.set.list[hit.i]]
}

export async function loadIcon(hit: IconHit): Promise<IconBody | undefined> {
  const n = chunkOf(hit.set, hit.i)
  const key = `${hit.set.prefix}/${n}`
  let p = chunks.get(key)
  if (!p) {
    p = hit.set.chunks[n]().then((m) => {
      loaded.set(key, m.default)
      return m.default
    })
    p.catch(() => chunks.delete(key))
    chunks.set(key, p)
  }
  return (await p)[hit.set.list[hit.i]]
}

export function iconSvg(b: IconBody, size?: number): string {
  const dims = size ? ` width="${size}" height="${size}"` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.left} ${b.top} ${b.width} ${b.height}"${dims}>${b.body}</svg>`
}

/** Readable label from an icon name, e.g. "arrow-up-right" -> "Arrow up right". */
export function iconLabel(name: string): string {
  const s = name.replace(/-/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Every icon whose name contains all the words, best matches first: exact
 * name, then names starting with the query, then whole-word hits.
 */
export function searchSets(sets: IconSet[], query: string): IconHit[] {
  const words = query.toLowerCase().trim().split(/[\s_-]+/).filter(Boolean)
  if (!words.length) return sets.flatMap((set) => set.list.map((_, i) => ({ set, i })))
  const joined = words.join('-')
  const scored: Array<{ hit: IconHit; score: number }> = []
  sets.forEach((set, si) => {
    set.list.forEach((name, i) => {
      for (const w of words) if (!name.includes(w)) return
      let score: number
      if (name === joined) score = 0
      else if (name.startsWith(joined)) score = 1
      else if (words.every((w) => name.startsWith(w) || name.includes('-' + w))) score = 2
      else score = 3
      scored.push({ hit: { set, i }, score: score * 1e6 + name.length * 100 + si })
    })
  })
  scored.sort((a, b) => a.score - b.score)
  return scored.map((s) => s.hit)
}
