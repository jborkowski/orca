import type { RuntimeMobileTerminalTheme } from '../../../src/shared/runtime-types'
import { EINK_TERMINAL_THEME } from './mobile-eink-terminal-theme'

export function resolveMobileTerminalTheme(
  isEinkMode: boolean,
  desktopTheme?: RuntimeMobileTerminalTheme
): RuntimeMobileTerminalTheme | undefined {
  if (isEinkMode) {
    return EINK_TERMINAL_THEME
  }
  return desktopTheme
}
