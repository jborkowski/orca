import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { resolveMobileThemeColors, type MobileThemeColors } from './mobile-theme-palettes'
import { createMobileEinkChrome, type MobileEinkChrome } from './mobile-eink-chrome'
import { loadEinkDisplayMode, saveEinkDisplayMode } from '../storage/preferences'

// Why: haptics and other non-React modules need a synchronous read of e-ink mode
// without threading props through every call site.
let einkDisplayModeFlag = false

export function setEinkDisplayModeFlag(enabled: boolean): void {
  einkDisplayModeFlag = enabled
}

export function isEinkDisplayModeFlagActive(): boolean {
  return einkDisplayModeFlag
}

type MobileThemeContextValue = {
  colors: MobileThemeColors
  chrome: MobileEinkChrome
  isEinkMode: boolean
  statusBarStyle: 'light' | 'dark'
  motionEnabled: boolean
  setEinkMode: (enabled: boolean) => void
}

const MobileThemeCtx = createContext<MobileThemeContextValue | null>(null)

export function MobileThemeProvider({ children }: { children: ReactNode }) {
  const [isEinkMode, setIsEinkMode] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadEinkDisplayMode().then((enabled) => {
      if (cancelled) {
        return
      }
      setIsEinkMode(enabled)
      setEinkDisplayModeFlag(enabled)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const setEinkMode = useCallback((enabled: boolean) => {
    setIsEinkMode(enabled)
    setEinkDisplayModeFlag(enabled)
    void saveEinkDisplayMode(enabled)
  }, [])

  const value = useMemo<MobileThemeContextValue>(() => {
    const colors = resolveMobileThemeColors(isEinkMode)
    return {
      colors,
      chrome: createMobileEinkChrome(isEinkMode, colors),
      isEinkMode,
      statusBarStyle: isEinkMode ? 'dark' : 'light',
      motionEnabled: !isEinkMode,
      setEinkMode
    }
  }, [isEinkMode, setEinkMode])

  return <MobileThemeCtx.Provider value={value}>{children}</MobileThemeCtx.Provider>
}

export function useMobileTheme(): MobileThemeContextValue {
  const ctx = useContext(MobileThemeCtx)
  if (!ctx) {
    throw new Error('useMobileTheme must be used within MobileThemeProvider')
  }
  return ctx
}
