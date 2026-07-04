import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { radii, spacing, typography } from '../src/theme/mobile-theme'
import type { MobileThemeColors } from '../src/theme/mobile-theme-palettes'
import type { MobileEinkChrome } from '../src/theme/mobile-eink-chrome'
import { useMobileTheme } from '../src/theme/mobile-theme-context'
import { extractPairingCodeFromUrl } from '../src/transport/pairing'

export default function PairRedirectScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ code?: string }>()
  const { colors, chrome } = useMobileTheme()
  const styles = useMemo(() => createPairRedirectStyles(colors, chrome), [colors, chrome])
  const [missingCode, setMissingCode] = useState(false)

  const goHome = useCallback(() => {
    router.replace('/')
  }, [router])

  useEffect(() => {
    let disposed = false

    async function redirectToConfirm() {
      const codeParam = Array.isArray(params.code) ? params.code[0] : params.code
      if (codeParam) {
        router.replace({ pathname: '/pair-confirm', params: { code: codeParam } })
        return
      }

      const initialUrl = await Linking.getInitialURL().catch(() => null)
      const code = initialUrl ? extractPairingCodeFromUrl(initialUrl) : null
      if (disposed) {
        return
      }
      if (code) {
        router.replace({ pathname: '/pair-confirm', params: { code } })
        return
      }
      setMissingCode(true)
    }

    void redirectToConfirm()
    return () => {
      disposed = true
    }
  }, [params.code, router])

  return (
    <View style={styles.container}>
      {missingCode ? (
        <>
          <Text style={styles.errorText}>Missing pairing code</Text>
          <Pressable style={styles.primaryButton} onPress={goHome}>
            <Text style={styles.primaryButtonText}>Back to home</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator size="large" color={colors.textSecondary} />
      )}
    </View>
  )
}

function createPairRedirectStyles(colors: MobileThemeColors, _chrome: MobileEinkChrome) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgBase,
      padding: spacing.lg
    },
    errorText: {
      color: colors.statusRed,
      fontSize: typography.bodySize,
      lineHeight: 20,
      marginBottom: spacing.xl,
      textAlign: 'center'
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: colors.textPrimary,
      borderRadius: radii.button,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.sm + 2
    },
    primaryButtonText: {
      color: colors.bgBase,
      fontSize: typography.bodySize,
      fontWeight: '600'
    }
  })
}
