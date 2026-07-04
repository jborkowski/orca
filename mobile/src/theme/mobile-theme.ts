// Orca mobile design tokens — matches desktop graphite/dark palette.
// All screen files should import from here instead of using inline hex values.
//
// For theme-aware UI, prefer useMobileTheme() from mobile-theme-context.tsx.

export { darkPalette, einkPalette, type MobileThemeColors } from './mobile-theme-palettes'
import { darkPalette } from './mobile-theme-palettes'

// Backward compat: static imports still receive the dark palette until migrated.
export const colors = darkPalette

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24
} as const

export const radii = {
  row: 6,
  card: 14,
  button: 6,
  input: 6,
  camera: 8
} as const

export const typography = {
  titleSize: 18,
  bodySize: 14,
  metaSize: 12,
  monoFamily: 'monospace' as const
} as const
