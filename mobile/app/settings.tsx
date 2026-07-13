import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  ChevronLeft,
  ChevronRight,
  Info,
  Bell,
  Wrench,
  Shield,
  LifeBuoy,
  Mic,
  Globe,
  Terminal as TerminalIcon,
  KeyRound
} from 'lucide-react-native'
import { spacing, typography } from '../src/theme/mobile-theme'
import type { MobileThemeColors } from '../src/theme/mobile-theme-palettes'
import type { MobileEinkChrome } from '../src/theme/mobile-eink-chrome'
import { useMobileTheme } from '../src/theme/mobile-theme-context'
import { loadTerminalTextScale, saveTerminalTextScale } from '../src/storage/preferences'
import {
  loadPendingHostCredentialCleanup,
  subscribePendingHostCredentialCleanup
} from '../src/transport/host-credential-cleanup'
import { retryPendingHostCredentialCleanup } from '../src/transport/host-store'

export default function SettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors, chrome, isEinkMode, setEinkMode } = useMobileTheme()
  const [pendingCredentialIds, setPendingCredentialIds] = useState<string[]>([])
  const [credentialStorageUnreadable, setCredentialStorageUnreadable] = useState(false)
  const [retryingCredentialCleanup, setRetryingCredentialCleanup] = useState(false)
  const [credentialRetryFailed, setCredentialRetryFailed] = useState(false)
  const credentialRefreshGenerationRef = useRef(0)

  useFocusEffect(
    useCallback(() => {
      let active = true
      setCredentialRetryFailed(false)
      const refresh = () => {
        const generation = ++credentialRefreshGenerationRef.current
        void loadPendingHostCredentialCleanup().then((state) => {
          if (active && generation === credentialRefreshGenerationRef.current) {
            setPendingCredentialIds(state.ids)
            setCredentialStorageUnreadable(state.storageUnreadable)
            if (state.ids.length === 0 && !state.storageUnreadable) {
              setCredentialRetryFailed(false)
            }
          }
        })
      }
      const unsubscribe = subscribePendingHostCredentialCleanup(refresh)
      refresh()
      return () => {
        active = false
        credentialRefreshGenerationRef.current += 1
        unsubscribe()
      }
    }, [])
  )

  const retryCredentialCleanup = useCallback(async () => {
    if (retryingCredentialCleanup) {
      return
    }
    setCredentialRetryFailed(false)
    setRetryingCredentialCleanup(true)
    try {
      const result = await retryPendingHostCredentialCleanup()
      setPendingCredentialIds(result.remainingIds)
      setCredentialStorageUnreadable(result.storageUnreadable)
      setCredentialRetryFailed(result.remainingIds.length > 0 || result.storageUnreadable)
    } catch {
      setCredentialRetryFailed(true)
    } finally {
      setRetryingCredentialCleanup(false)
    }
  }, [retryingCredentialCleanup])

  const pendingCredentialCount = pendingCredentialIds.length
  // Why: an unreadable queue can hide an orphaned token, so keep the retry
  // affordance visible even when no pending credential IDs can be loaded.
  const showCredentialCleanup = pendingCredentialCount > 0 || credentialStorageUnreadable

  const toggleEinkMode = useCallback(
    (next: boolean) => {
      setEinkMode(next)
      if (next) {
        void loadTerminalTextScale().then((scale) => {
          if (scale === 1) {
            void saveTerminalTextScale(1.25)
          }
        })
      }
    },
    [setEinkMode]
  )

  const styles = useMemo(() => createSettingsStyles(colors, chrome), [colors, chrome])

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.topRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.heading}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionHeading}>DISPLAY</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.switchRowLabel}>E-ink display mode</Text>
              <Text style={styles.rowSublabel}>
                Light theme, reduced motion, and a DOM-based terminal for sharper text on e-ink
                screens.
              </Text>
            </View>
            <Switch
              value={isEinkMode}
              onValueChange={toggleEinkMode}
              trackColor={{
                false: isEinkMode ? colors.bgBase : colors.bgRaised,
                true: colors.textSecondary
              }}
              thumbColor={colors.textPrimary}
            />
          </View>
        </View>

        <View style={[styles.section, styles.sectionSpacer]}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push('/terminal-settings')}
          >
            <TerminalIcon size={16} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Terminal</Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
          <View style={styles.separator} />
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push('/browser-settings')}
          >
            <Globe size={16} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Browser</Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
          <View style={styles.separator} />
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push('/voice-settings')}
          >
            <Mic size={16} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Voice</Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
          <View style={styles.separator} />
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push('/notifications')}
          >
            <Bell size={16} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Notifications</Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
          <View style={styles.separator} />
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push('/troubleshoot')}
          >
            <Wrench size={16} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Troubleshooting</Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
          <View style={styles.separator} />
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push('/about')}
          >
            <Info size={16} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>About</Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        {showCredentialCleanup ? (
          <View style={[styles.section, styles.sectionSpacer]}>
            <View style={styles.credentialCleanupRow}>
              <KeyRound size={16} color={colors.statusAmber} />
              <View style={styles.credentialCleanupCopy}>
                <Text style={styles.credentialCleanupTitle}>Pairing credential cleanup</Text>
                <Text accessibilityLiveRegion="polite" style={styles.rowHint}>
                  {credentialRetryFailed
                    ? "Cleanup still couldn't be confirmed. Try again later."
                    : pendingCredentialCount > 0
                      ? `Couldn't confirm cleanup for ${pendingCredentialCount} credential${pendingCredentialCount === 1 ? '' : 's'} on this device.`
                      : "Couldn't check cleanup status on this device. Retry to be safe."}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry clearing pairing credentials"
                accessibilityState={{
                  busy: retryingCredentialCleanup,
                  disabled: retryingCredentialCleanup
                }}
                disabled={retryingCredentialCleanup}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.retryButton,
                  pressed && !retryingCredentialCleanup && styles.rowPressed
                ]}
                onPress={() => void retryCredentialCleanup()}
              >
                {retryingCredentialCleanup ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <Text style={styles.retryButtonText}>Retry</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={[styles.section, styles.sectionSpacer]}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => void Linking.openURL('https://www.onorca.dev/privacy')}
          >
            <Shield size={16} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Privacy Policy</Text>
          </Pressable>
          <View style={styles.separator} />
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => void Linking.openURL('https://github.com/stablyai/orca/issues')}
          >
            <LifeBuoy size={16} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Support</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

function createSettingsStyles(colors: MobileThemeColors, chrome: MobileEinkChrome) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgBase,
      padding: spacing.lg
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.xl
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm
    },
    heading: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary
    },
    sectionHeading: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      letterSpacing: 0.5,
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.xs
    },
    section: {
      ...chrome.sectionCard
    },
    sectionSpacer: {
      marginTop: spacing.md
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md + 2
    },
    rowPressed: {
      ...chrome.listRowPressed
    },
    rowContent: {
      flex: 1
    },
    rowLabel: {
      flex: 1,
      fontSize: typography.bodySize,
      fontWeight: '500',
      color: colors.textPrimary
    },
    switchRowLabel: {
      fontSize: typography.bodySize,
      fontWeight: '500',
      color: colors.textPrimary
    },
    rowSublabel: {
      fontSize: typography.bodySize - 2,
      color: colors.textSecondary,
      marginTop: 2,
      lineHeight: 18
    },
    credentialCleanupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md + 2
    },
    credentialCleanupCopy: {
      flex: 1,
      gap: spacing.xs
    },
    credentialCleanupTitle: {
      fontSize: typography.bodySize,
      fontWeight: '500',
      color: colors.textPrimary
    },
    rowHint: {
      fontSize: typography.metaSize,
      color: colors.textSecondary,
      lineHeight: 17
    },
    retryButton: {
      minWidth: 72,
      minHeight: 32,
      ...chrome.outlineButton,
      alignItems: 'center',
      justifyContent: 'center'
    },
    retryButtonText: {
      fontSize: typography.metaSize,
      fontWeight: '600',
      color: colors.textPrimary
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSubtle,
      marginHorizontal: spacing.md
    }
  })
}
