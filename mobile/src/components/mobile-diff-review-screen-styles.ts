import { useMemo } from 'react'
import { createMobileDiffReviewControlStyles } from './mobile-diff-review-control-styles'
import { createMobileDiffReviewLayoutStyles } from './mobile-diff-review-layout-styles'
import { useMobileTheme } from '../theme/mobile-theme-context'
import type { MobileEinkChrome } from '../theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'

export function createMobileDiffReviewStyles(colors: MobileThemeColors, chrome: MobileEinkChrome) {
  return {
    ...createMobileDiffReviewLayoutStyles(colors, chrome),
    ...createMobileDiffReviewControlStyles(colors, chrome)
  }
}

export function useMobileDiffReviewStyles() {
  const { colors, chrome } = useMobileTheme()
  return useMemo(() => createMobileDiffReviewStyles(colors, chrome), [colors, chrome])
}
