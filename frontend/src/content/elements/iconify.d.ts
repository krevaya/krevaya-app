// Generated at build time by vite/iconify.ts.
declare module 'virtual:iconify' {
  export type IconBody = { body: string; width: number; height: number; left: number; top: number }
  export type IconSetIndex = {
    prefix: string
    name: string
    license: string
    /** Comma separated icon names, in chunk order. */
    names: string
    /** Index of the first name in each chunk. */
    starts: number[]
    chunks: Array<() => Promise<{ default: Record<string, IconBody> }>>
  }
  export const iconSets: IconSetIndex[]
  export const emojiSet: IconSetIndex
  export const emojiCategories: Array<{ name: string; items: number[] }>
}

declare module 'virtual:iconify/featured' {
  import type { IconBody } from 'virtual:iconify'
  export const featuredIcons: Array<IconBody & { prefix: string; name: string }>
  export const featuredEmoji: Array<IconBody & { prefix: string; name: string }>
}
