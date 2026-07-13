import { useEffect, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, X } from 'lucide-react-native'
import { radii, spacing, typography } from '../../theme/mobile-theme'
import type { MobileThemeColors } from '../../theme/mobile-theme-palettes'
import type { MobileEinkChrome } from '../../theme/mobile-eink-chrome'
import { useMobileTheme } from '../../theme/mobile-theme-context'
import type { ConnectionState } from '../../transport/types'
import type { RpcClient } from '../../transport/rpc-client'
import type { MobileGitStatusResult } from '../../source-control/mobile-git-status'
import type { MobilePrSidebarController } from '../../session/use-mobile-pr-sidebar-controller'
import { MobilePRSidebar } from '../MobilePRSidebar'

type Props = {
  client: RpcClient | null
  connState: ConnectionState
  worktreeId: string
  branch: string | null
  headSha: string | null
  gitStatus: MobileGitStatusResult | null
  isGithubRepo?: boolean
  branchContextLoaded?: boolean
  controller: MobilePrSidebarController
}

// Chromeless PR sidebar body for the source-control hub's Pull Request segment.
// The hub owns the header, segmented control, load triggers, and the shared
// controller (one fetch feeds both the branch-card chip and this body).
export function MobilePrViewPanelBody({
  client,
  connState,
  worktreeId,
  branch,
  headSha,
  gitStatus,
  isGithubRepo = true,
  branchContextLoaded = true,
  controller
}: Props) {
  const insets = useSafeAreaInsets()
  const { colors, chrome } = useMobileTheme()
  const styles = useMemo(() => createMobilePrViewPanelStyles(colors, chrome), [colors, chrome])
  const controller = useMobilePrSidebarController({
    client,
    connState,
    worktreeId,
    branch,
    headSha
  })

  const sidebarState = !branchContextLoaded
    ? ({ kind: 'loading' } as const)
    : !isGithubRepo
      ? ({
          kind: 'blocked',
          message: 'Hosted review panel unavailable for this provider.'
        } as const)
      : branch === null
        ? ({
            kind: 'error',
            message: 'Current branch unavailable.'
          } as const)
        : controller.prSidebarState

  return (
    <View style={styles.container}>
      <MobilePRSidebar
        state={sidebarState}
        onRetry={controller.retryPRSidebar}
        refetch={controller.refetchPRSidebar}
        client={client}
        connState={connState}
        worktreeId={worktreeId}
        gitBranch={branch}
        gitStatus={gitStatus}
        headSha={headSha}
        bottomInset={insets.bottom}
        // Hub header already hosts open-on-web while this segment is active.
        showOpenOnWeb={false}
      />
    </View>
  )
}

function createMobilePrViewPanelStyles(colors: MobileThemeColors, chrome: MobileEinkChrome) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgBase
    },
    header: {
      backgroundColor: chrome.sectionCard.backgroundColor,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle
    },
    topBar: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md
    },
    iconButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.button
    },
    iconButtonPressed: {
      ...chrome.listRowPressed
    },
    title: {
      flex: 1,
      minWidth: 0,
      color: colors.textPrimary,
      fontSize: typography.titleSize,
      fontWeight: '600'
    }
  })
}
