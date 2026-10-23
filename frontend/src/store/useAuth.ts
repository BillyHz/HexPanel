import { create } from 'zustand'
import { api } from '../api/client'
import type { Me } from '../api/types'

interface AuthState {
  user: Me | null
  loading: boolean
  error: string | null
  init: () => Promise<void>
  login: (u: string, p: string) => Promise<boolean>
  logout: () => Promise<void>
  hasPerm: (perm: string) => boolean
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  error: null,

  init: async () => {
    try {
      const me = await api.getMe()
      set({ user: me, loading: false, error: null })
    } catch {
      // Mock user fallback if VITE_MOCK or backend not connected
      if ((import.meta as any).env?.VITE_MOCK === '1') {
        set({
          user: {
            id: 1,
            username: 'Tecsharp',
            mcName: 'Tecsharp',
            mcUuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
            role: 'admin',
            permissions: ['panel.admin', 'server.view', 'server.console', 'server.power', 'players.view', 'players.moderate', 'inventory.view', 'inventory.edit', 'audit.view'],
          },
          loading: false,
          error: null,
        })
      } else {
        set({ user: null, loading: false })
      }
    }
  },

  login: async (u: string, p: string) => {
    try {
      set({ loading: true, error: null })
      const res = await api.login(u, p)
      set({ user: res.user, loading: false })
      return true
    } catch (e: any) {
      set({ error: e.message, loading: false })
      return false
    }
  },

  logout: async () => {
    try {
      await api.logout()
    } catch {}
    set({ user: null })
  },

  hasPerm: (perm: string) => {
    const u = get().user
    if (!u) return false
    return u.permissions.includes('panel.admin') || u.permissions.includes(perm)
  },
}))
