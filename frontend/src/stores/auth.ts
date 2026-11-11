import { create } from 'zustand'
import { api, type User } from '@/api/client'

type AuthState = {
  user: User | null
  ready: boolean
  /** True when the API can't be reached: the app still works for guests. */
  offline: boolean
  config: { signup: boolean; google: boolean; oidc: string | null }
  load: () => Promise<void>
  setUser: (u: User | null) => void
  logout: () => Promise<void>
  savePrefs: (prefs: Record<string, unknown>) => Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  ready: false,
  offline: false,
  config: { signup: true, google: false, oidc: null },
  load: async () => {
    try {
      const [{ user }, config] = await Promise.all([
        api<{ user: User | null }>('/api/auth/me'),
        api<AuthState['config']>('/api/auth/config'),
      ])
      set({ user, config, ready: true, offline: false })
    } catch {
      set({ user: null, ready: true, offline: true })
    }
  },
  setUser: (user) => set({ user }),
  logout: async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    set({ user: null })
  },
  savePrefs: async (prefs) => {
    const user = get().user
    if (!user) {
      localStorage.setItem('ka:prefs', JSON.stringify({ ...readLocalPrefs(), ...prefs }))
      return
    }
    set({ user: { ...user, prefs: { ...user.prefs, ...prefs } } })
    await api('/api/auth/me', { method: 'PATCH', json: { prefs } }).catch(() => {})
  },
}))

export function readLocalPrefs(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem('ka:prefs') ?? '{}')
  } catch {
    return {}
  }
}

export function prefs(): Record<string, unknown> {
  const u = useAuth.getState().user
  return u ? u.prefs : readLocalPrefs()
}
