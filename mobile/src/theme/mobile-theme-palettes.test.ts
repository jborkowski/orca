import { describe, expect, it } from 'vitest'
import { createMobileEinkChrome } from './mobile-eink-chrome'
import { einkPalette, einkPaletteAvoidsMidGreySurfaces, resolveMobileThemeColors } from './mobile-theme-palettes'

describe('eink palette', () => {
  it('uses flat white surfaces without mid-grey fills', () => {
    expect(einkPaletteAvoidsMidGreySurfaces()).toBe(true)
    expect(einkPalette.bgPanel).toBe('#ffffff')
    expect(einkPalette.bgRaised).toBe('#ffffff')
  })

  it('uses black ink for borders and primary text', () => {
    expect(einkPalette.borderSubtle).toBe('#111111')
    expect(einkPalette.textPrimary).toBe('#111111')
  })

  it('resolves eink colors only when mode is enabled', () => {
    expect(resolveMobileThemeColors(false).bgBase).toBe('#111111')
    expect(resolveMobileThemeColors(true).bgBase).toBe('#ffffff')
  })
})

describe('eink chrome', () => {
  it('outlines chips and rows instead of grey fills', () => {
    const colors = resolveMobileThemeColors(true)
    const chrome = createMobileEinkChrome(true, colors)

    expect(chrome.filterChip(false).backgroundColor).toBe('#ffffff')
    expect(chrome.filterChip(true).borderWidth).toBe(2)
    expect(chrome.listRowPressed.backgroundColor).toBe('#ffffff')
    expect(chrome.noShadow.shadowOpacity).toBe(0)
  })
})
