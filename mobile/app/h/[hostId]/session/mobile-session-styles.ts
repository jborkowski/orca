import { createMobileEinkChrome } from '../../../../src/theme/mobile-eink-chrome'
import { darkPalette } from '../../../../src/theme/mobile-theme-palettes'
import { createMobileSessionCommandInputStyles } from './mobile-session-command-input-styles'
import { createMobileSessionFrameStyles } from './mobile-session-frame-styles'
import { createMobileSessionReaderStyles } from './mobile-session-reader-styles'
import { createMobileSessionReviewCommentStyles } from './mobile-session-review-comment-styles'

// Why: legacy static export for tests and tooling that still import this module.
const darkChrome = createMobileEinkChrome(false, darkPalette)

export const styles = {
  ...createMobileSessionFrameStyles(darkPalette, darkChrome),
  ...createMobileSessionReaderStyles(darkPalette, darkChrome),
  ...createMobileSessionReviewCommentStyles(darkPalette, darkChrome),
  ...createMobileSessionCommandInputStyles(darkPalette, darkChrome)
}
