import { api } from '@/api/client'
import { useAuth } from '@/stores/auth'
import { forgetFonts, knownFonts, registerFonts, type FontInfo } from '@/render/assets'
import interItalic from '@fontsource-variable/inter/files/inter-latin-wght-italic.woff2?url'
import interNormal from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import outfit400 from '@fontsource/outfit/files/outfit-latin-400-normal.woff2?url'
import outfit600 from '@fontsource/outfit/files/outfit-latin-600-normal.woff2?url'
import outfit800 from '@fontsource/outfit/files/outfit-latin-800-normal.woff2?url'

// Two families ship inside the app so a guest with no server still has good
// type. Everything else comes from the server's font catalog.
const BUILT_IN: FontInfo[] = [
  {
    family: 'Inter',
    category: 'sans-serif',
    files: [100, 200, 300, 400, 500, 600, 700, 800, 900].flatMap((weight) => [
      { weight, style: 'normal' as const, url: interNormal },
      { weight, style: 'italic' as const, url: interItalic },
    ]),
  },
  {
    family: 'Outfit',
    category: 'sans-serif',
    files: [
      { weight: 400, style: 'normal', url: outfit400 },
      { weight: 600, style: 'normal', url: outfit600 },
      { weight: 800, style: 'normal', url: outfit800 },
    ],
  },
]

registerFonts(BUILT_IN)

let loading: Promise<void> | null = null
let loadedFor: string | null = null

export function ensureFontCatalog(): Promise<void> {
  const who = useAuth.getState().user?.id ?? null
  // signing in after the catalog loaded brings the user's own fonts along
  if (!loading || loadedFor !== who) {
    loadedFor = who
    loading = (async () => {
      try {
        const [catalog, mine] = await Promise.all([
          api<{ fonts: FontInfo[] }>('/api/fonts/catalog'),
          // guests have no font library of their own, asking would only log a 401
          useAuth.getState().user
            ? api<{ fonts: FontInfo[] }>('/api/fonts').catch(() => ({ fonts: [] as FontInfo[] }))
            : { fonts: [] as FontInfo[] },
        ])
        registerFonts(catalog.fonts)
        registerFonts(mine.fonts)
      } catch {
        // offline: built-in fonts only
      }
    })()
  }
  return loading
}

/** Fonts the design's owner uploaded, for people viewing it through a link (or the export page). */
export async function loadDesignFonts(designId: string, headers?: Record<string, string>) {
  try {
    const { fonts } = await api<{ fonts: FontInfo[] }>(`/api/designs/${designId}/fonts`, { headers })
    registerFonts(fonts)
  } catch {
    // not important enough to block opening the design
  }
}

export function reloadFonts() {
  // drop the user's own fonts first so deleted ones disappear from the list
  forgetFonts((f) => !!f.custom)
  loading = null
  return ensureFontCatalog()
}

export function fontList(): FontInfo[] {
  return knownFonts().sort((a, b) => a.family.localeCompare(b.family))
}

/** Weights a family actually has, so the toolbar doesn't offer fake bold. */
export function weightsOf(family: string): number[] {
  const f = knownFonts().find((x) => x.family === family)
  if (!f) return [400, 700]
  return [...new Set(f.files.filter((x) => x.style === 'normal').map((x) => x.weight))].sort((a, b) => a - b)
}

export const FONT_PAIRINGS: Array<{ heading: string; body: string; label: string }> = [
  { heading: 'Outfit', body: 'Inter', label: 'Startup pitch' },
  { heading: 'Libre Baskerville', body: 'Source Sans 3', label: 'Book launch' },
  { heading: 'Staatliches', body: 'Barlow', label: 'Gig flyer' },
  { heading: 'Fraunces', body: 'Work Sans', label: 'Café menu' },
  { heading: 'Space Grotesk', body: 'IBM Plex Sans', label: 'Dev meetup' },
  { heading: 'Abril Fatface', body: 'Lato', label: 'Fashion sale' },
  { heading: 'Fredoka', body: 'Quicksand', label: 'Kids party' },
  { heading: 'Archivo Black', body: 'Archivo', label: 'Sports club' },
  { heading: 'Prata', body: 'Raleway', label: 'Wedding' },
  { heading: 'Anton', body: 'Roboto', label: 'Big news' },
  { heading: 'DM Serif Display', body: 'DM Sans', label: 'Annual report' },
  { heading: 'Caveat', body: 'Nunito', label: 'Bake sale' },
]
