import { create } from 'zustand'
import { ChoiceRow, Toggle } from '@/components/ui/kit'
import { applyTheme, type ContrastPref, type ThemePref } from '@/lib/theme'
import { prefs, useAuth } from '@/stores/auth'

// guests keep prefs in localStorage, which nothing watches, so re-render by hand
const useTick = create(() => ({ n: 0 }))

export function useAppearance() {
  const user = useAuth((s) => s.user)
  useTick((s) => s.n)
  const p = prefs()
  const theme = (p.theme as ThemePref) ?? 'light'
  const contrast = (p.contrast as ContrastPref) ?? 'system'
  const save = async (patch: { theme?: ThemePref; contrast?: ContrastPref }) => {
    const done = useAuth.getState().savePrefs(patch)
    applyTheme()
    useTick.setState((s) => ({ n: s.n + 1 }))
    await done
    applyTheme()
  }
  return { theme, contrast, save, signedIn: !!user }
}

export function AppearanceControls() {
  const { theme, contrast, save } = useAppearance()
  // until someone flips the switch, it follows the device's own contrast setting
  const strong = contrast === 'high' || (contrast === 'system' && document.documentElement.dataset.contrast === 'high')
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink">Theme</span>
        <ChoiceRow<ThemePref>
          value={theme}
          onChange={(v) => void save({ theme: v })}
          options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'Match device' }]}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Toggle label="Stronger contrast" checked={strong} onChange={(v) => void save({ contrast: v ? 'high' : 'normal' })} />
        <p className="text-[12px] text-muted">Bolder outlines and deeper text everywhere. Comes on by itself when your device asks for more contrast.</p>
      </div>
    </div>
  )
}
