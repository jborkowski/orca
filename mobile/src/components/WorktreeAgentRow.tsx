import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { RuntimeWorktreeAgentRow } from '../../../src/shared/runtime-types'
import { spacing } from '../theme/mobile-theme'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'
import { useMobileTheme } from '../theme/mobile-theme-context'
import { agentDisplayLabel, agentDotState, formatTimeAgo } from '../worktree/agent-row-display'
import { AgentStateDot } from './AgentStateDot'
import { MobileAgentIcon } from './MobileAgentIcon'

const INDENT_PER_DEPTH = 14

type Props = {
  agent: RuntimeWorktreeAgentRow
  depth: number
  now: number
  // Bold/foreground until the user has visited the worktree, mirroring desktop's
  // unvisited rule (the workspace title and its agent rows share one signal).
  unvisited: boolean
}

// One inline agent row: state dot → identity → last message/prompt → time ago.
// Mirrors desktop DashboardAgentRow's compact in-card layout.
export function WorktreeAgentRow({ agent, depth, now, unvisited }: Props) {
  const { colors } = useMobileTheme()
  const styles = useMemo(() => createWorktreeAgentRowStyles(colors), [colors])
  const dotState = agentDotState(agent, now)
  const label = agentDisplayLabel(agent, now)
  const ts = formatTimeAgo(agent.stateStartedAt, now)

  return (
    <View style={[styles.row, { paddingLeft: depth * INDENT_PER_DEPTH }]}>
      <AgentStateDot state={dotState} />
      {agent.agentType ? <MobileAgentIcon agentId={agent.agentType} size={13} /> : null}
      <Text style={[styles.label, unvisited && styles.labelUnvisited]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.time}>{ts}</Text>
    </View>
  )
}

function createWorktreeAgentRowStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: 3
    },
    label: {
      flex: 1,
      fontSize: 11,
      color: colors.textMuted
    },
    labelUnvisited: {
      color: colors.textPrimary,
      fontWeight: '600'
    },
    time: {
      fontSize: 10,
      color: colors.textMuted
    }
  })
}
