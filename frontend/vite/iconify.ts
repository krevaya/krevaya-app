import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { Plugin } from 'vite'

// Serves the @iconify-json sets to the app as small lazy chunks instead of one
// multi-megabyte JSON per set:
//   virtual:iconify             names of every icon and which chunk holds it
//   virtual:iconify/featured    the few icons and emoji the panel shows up front
//   virtual:iconify/<set>-<n>   icon bodies for one chunk
// The editor only fetches the chunks for icons it actually shows.

const require = createRequire(import.meta.url)

const SETS = [
  { prefix: 'tabler', name: 'Tabler' },
  { prefix: 'ph', name: 'Phosphor' },
  { prefix: 'mdi', name: 'Material Design' },
  { prefix: 'ri', name: 'Remix' },
  { prefix: 'carbon', name: 'Carbon' },
  { prefix: 'lucide', name: 'Lucide' },
]
const EMOJI = { prefix: 'fluent-emoji-flat', name: 'Fluent Emoji' }

const FEATURED_ICONS = [
  'tabler:heart', 'tabler:star', 'tabler:home', 'tabler:phone', 'tabler:mail', 'tabler:map-pin',
  'ph:camera', 'ph:music-notes', 'mdi:instagram', 'ri:calendar-line', 'tabler:check', 'lucide:sparkles',
]
const FEATURED_EMOJI = [
  'grinning-face', 'red-heart', 'fire', 'party-popper', 'sparkles', 'thumbs-up',
  'star-struck', 'rocket', 'sun', 'birthday-cake', 'light-bulb', 'trophy',
]

type IconData = { body: string; width?: number; height?: number; left?: number; top?: number; hidden?: boolean }
type IconSet = {
  prefix: string
  icons: Record<string, IconData>
  width?: number
  height?: number
  left?: number
  top?: number
}

const CHUNK_BYTES = 120_000
const TONES = ['-light', '-medium-light', '-medium', '-medium-dark', '-dark']

type Prepared = {
  set: IconSet
  license: string
  names: string[]
  starts: number[]
}

const cache = new Map<string, Prepared>()

function prepare(prefix: string): Prepared {
  const hit = cache.get(prefix)
  if (hit) return hit
  const set = JSON.parse(readFileSync(require.resolve(`@iconify-json/${prefix}/icons.json`), 'utf8')) as IconSet
  const info = JSON.parse(readFileSync(require.resolve(`@iconify-json/${prefix}/info.json`), 'utf8'))
  let names = Object.keys(set.icons).filter((n) => !set.icons[n].hidden)
  if (prefix === EMOJI.prefix) {
    // skin tone variants would bury the base emoji; keep the default yellow ones
    const all = new Set(names)
    names = names.filter((n) => !TONES.some((t) => n.endsWith(t) && all.has(n.slice(0, -t.length))))
  }
  const starts: number[] = [0]
  let bytes = 0
  names.forEach((n, i) => {
    bytes += set.icons[n].body.length + n.length
    if (bytes > CHUNK_BYTES && i > starts[starts.length - 1]) {
      starts.push(i + 1)
      bytes = 0
    }
  })
  if (starts[starts.length - 1] >= names.length) starts.pop()
  const p = { set, license: info.license?.spdx ?? '', names, starts }
  cache.set(prefix, p)
  return p
}

function iconOut(set: IconSet, name: string) {
  const i = set.icons[name]
  return {
    body: i.body,
    width: i.width ?? set.width ?? 16,
    height: i.height ?? set.height ?? 16,
    left: i.left ?? set.left ?? 0,
    top: i.top ?? set.top ?? 0,
  }
}

function emojiCategories(p: Prepared): Array<{ name: string; items: number[] }> {
  const meta = JSON.parse(readFileSync(require.resolve(`@iconify-json/${EMOJI.prefix}/metadata.json`), 'utf8'))
  const index = new Map(p.names.map((n, i) => [n, i]))
  return Object.entries((meta.categories ?? {}) as Record<string, string[]>).map(([name, list]) => ({
    name,
    items: list.map((n) => index.get(n)).filter((i): i is number => i !== undefined),
  })).filter((c) => c.items.length)
}

function setEntry(meta: { prefix: string; name: string }) {
  const p = prepare(meta.prefix)
  const loaders = p.starts.map((_, n) => `() => import(${JSON.stringify(`virtual:iconify/${meta.prefix}-${n}`)})`)
  return `{ prefix: ${JSON.stringify(meta.prefix)}, name: ${JSON.stringify(meta.name)}, license: ${JSON.stringify(p.license)}, `
    + `names: ${JSON.stringify(p.names.join(','))}, starts: ${JSON.stringify(p.starts)}, chunks: [${loaders.join(', ')}] }`
}

function featuredModule(): string {
  const featured = FEATURED_ICONS.map((id) => {
    const [prefix, name] = id.split(':')
    const p = prepare(prefix)
    return p.set.icons[name] ? { prefix, name, ...iconOut(p.set, name) } : null
  }).filter(Boolean)
  const emoji = prepare(EMOJI.prefix)
  const featuredEmoji = FEATURED_EMOJI.filter((n) => emoji.set.icons[n]).map((name) => ({ prefix: EMOJI.prefix, name, ...iconOut(emoji.set, name) }))
  return `export const featuredIcons = ${JSON.stringify(featured)}\nexport const featuredEmoji = ${JSON.stringify(featuredEmoji)}`
}

function indexModule(): string {
  return [
    `export const iconSets = [${SETS.map(setEntry).join(',\n')}]`,
    `export const emojiSet = ${setEntry(EMOJI)}`,
    `export const emojiCategories = ${JSON.stringify(emojiCategories(prepare(EMOJI.prefix)))}`,
  ].join('\n')
}

function chunkModule(prefix: string, n: number): string {
  const p = prepare(prefix)
  const from = p.starts[n] ?? p.names.length
  const to = p.starts[n + 1] ?? p.names.length
  const icons: Record<string, ReturnType<typeof iconOut>> = {}
  for (const name of p.names.slice(from, to)) icons[name] = iconOut(p.set, name)
  return `export default JSON.parse(${JSON.stringify(JSON.stringify(icons))})`
}

export function iconify(): Plugin {
  return {
    name: 'krevaya-iconify',
    resolveId(id) {
      if (id === 'virtual:iconify' || id.startsWith('virtual:iconify/')) return '\0' + id
      return null
    },
    load(id) {
      if (id === '\0virtual:iconify') return indexModule()
      if (id === '\0virtual:iconify/featured') return featuredModule()
      const m = /^\0virtual:iconify\/([a-z0-9-]+)-(\d+)$/.exec(id)
      if (m) return chunkModule(m[1], Number(m[2]))
      return null
    },
  }
}
