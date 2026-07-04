// Why: e-ink mode needs a separate high-contrast light palette while the rest
// of the app still defaults to the existing graphite/dark tokens for backward compat.

export const darkPalette = {
  bgBase: '#111111',
  bgPanel: '#1a1a1a',
  bgRaised: '#242424',
  borderSubtle: '#2a2a2a',
  borderStrong: '#888888',
  editorSurface: '#1e1e1e',

  textPrimary: '#e0e0e0',
  textSecondary: '#888888',
  textMuted: '#555555',

  surfaceBright: '#f5f5f5',
  onSurfaceBright: '#111111',

  accentBlue: '#3b82f6',

  statusGreen: '#22c55e',
  statusAmber: '#f59e0b',
  statusRed: '#ef4444',
  mergeGreen: '#16a34a',
  onMergeGreen: '#ffffff',
  statusPurple: '#a78bfa',
  gitDecorationAdded: '#81b88b',
  gitDecorationDeleted: '#c74e39',
  diffAddedBg: 'rgba(129, 184, 139, 0.1)',
  diffDeletedBg: 'rgba(199, 78, 57, 0.11)',

  syntaxComment: '#6a9955',
  syntaxKeyword: '#569cd6',
  syntaxString: '#ce9178',
  syntaxNumber: '#b5cea8',
  syntaxType: '#4ec9b0',
  syntaxFunction: '#dcdcaa',
  syntaxVariable: '#9cdcfe',
  syntaxMeta: '#c586c0',

  terminalBg: '#1a1b26'
} as const

export type MobileThemeColors = { [K in keyof typeof darkPalette]: string }

// E-ink: binary black-on-white — no grey fills; borders carry structure.
export const einkPalette: MobileThemeColors = {
  bgBase: '#ffffff',
  bgPanel: '#ffffff',
  bgRaised: '#ffffff',
  borderSubtle: '#111111',
  borderStrong: '#111111',
  editorSurface: '#ffffff',

  textPrimary: '#111111',
  textSecondary: '#111111',
  textMuted: '#333333',

  surfaceBright: '#111111',
  onSurfaceBright: '#ffffff',

  accentBlue: '#111111',

  statusGreen: '#1a6b1a',
  statusAmber: '#8a6500',
  statusRed: '#b00020',
  mergeGreen: '#111111',
  onMergeGreen: '#ffffff',
  statusPurple: '#111111',
  gitDecorationAdded: '#1a6b1a',
  gitDecorationDeleted: '#b00020',
  diffAddedBg: 'transparent',
  diffDeletedBg: 'transparent',

  syntaxComment: '#333333',
  syntaxKeyword: '#111111',
  syntaxString: '#333333',
  syntaxNumber: '#333333',
  syntaxType: '#111111',
  syntaxFunction: '#111111',
  syntaxVariable: '#333333',
  syntaxMeta: '#333333',

  terminalBg: '#ffffff'
}

export function resolveMobileThemeColors(isEinkMode: boolean): MobileThemeColors {
  return isEinkMode ? einkPalette : darkPalette
}

export function einkPaletteAvoidsMidGreySurfaces(): boolean {
  const surfaces = [einkPalette.bgBase, einkPalette.bgPanel, einkPalette.bgRaised]
  return surfaces.every((hex) => hex === '#ffffff')
}
