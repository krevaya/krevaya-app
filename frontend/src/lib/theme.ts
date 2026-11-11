import { prefs } from '@/stores/auth'

export type ContrastPref = 'system' | 'high' | 'normal'
export type ThemePref = 'system' | 'light' | 'dark'

const hcQuery = window.matchMedia('(prefers-contrast: more)')
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

/** Apply the theme and contrast settings to <html>. Follows the device unless overridden. */
export function applyTheme() {
  const p = prefs()
  const contrast = (p.contrast as ContrastPref) ?? 'system'
  const theme = (p.theme as ThemePref) ?? 'light'
  const high = contrast === 'high' || (contrast === 'system' && hcQuery.matches)
  const dark = theme === 'dark' || (theme === 'system' && darkQuery.matches)
  document.documentElement.dataset.contrast = high ? 'high' : 'normal'
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

hcQuery.addEventListener('change', applyTheme)
darkQuery.addEventListener('change', applyTheme)
