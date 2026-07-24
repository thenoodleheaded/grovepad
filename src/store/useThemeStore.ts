import { create } from 'zustand'

export type Theme = 'dark' | 'light'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('gp-theme', theme)
}

// Apply before first React render to avoid flash of wrong theme.
const storedTheme = (localStorage.getItem('gp-theme') as Theme | null) ?? 'dark'
applyTheme(storedTheme)

export const useThemeStore = create<ThemeState>()((set) => ({
  theme: storedTheme,
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  toggle: () =>
    set((state) => {
      const next: Theme = state.theme === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      return { theme: next }
    }),
}))
