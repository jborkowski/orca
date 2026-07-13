import { Platform, StyleSheet } from 'react-native'
import { spacing } from '../theme/mobile-theme'

export const bottomDrawerChromeStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000
  },
  root: {
    flex: 1
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  anchor: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  anchorWide: {
    alignItems: 'center'
  },
  drawer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: spacing.md,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.2,
        shadowRadius: 10
      },
      android: { elevation: 8 }
    })
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.4
  },
  handleHitArea: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md
  },
  staticContent: {
    minHeight: 0
  },
  bottomExtension: {
    position: 'absolute',
    bottom: -500,
    left: 0,
    right: 0,
    height: 500
  }
})
