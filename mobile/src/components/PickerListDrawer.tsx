import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'

import { spacing, typography } from '../theme/mobile-theme'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'
import { useMobileTheme } from '../theme/mobile-theme-context'
import { BottomDrawer, BOTTOM_DRAWER_HIDE_DURATION_MS } from './BottomDrawer'

type Props<T extends { id: string; label: string }> = {
  visible: boolean
  title: string
  items: T[]
  selectedId: string
  onSelect: (item: T) => void
  onClose: () => void
  renderIcon?: (item: T) => ReactNode
}

export function PickerListDrawer<T extends { id: string; label: string }>({
  visible,
  title,
  items,
  selectedId,
  onSelect,
  onClose,
  renderIcon
}: Props<T>) {
  const { colors, chrome } = useMobileTheme()
  const styles = useMemo(() => createPickerListDrawerStyles(colors), [colors])
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drawerVisible = visible && !closing

  useEffect(() => {
    if (visible) {
      setClosing(false)
    }
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [visible])

  const finishClose = useCallback(() => {
    setClosing(false)
    onClose()
  }, [onClose])

  const closeThenSelect = useCallback(
    (item: T) => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
      }
      setClosing(true)
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null
        onClose()
        onSelect(item)
      }, BOTTOM_DRAWER_HIDE_DURATION_MS)
    },
    [onClose, onSelect]
  )

  return (
    <BottomDrawer
      visible={drawerVisible}
      onClose={finishClose}
      dragContentToDismiss={false}
      contentScrollable={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        style={[chrome.sectionCard, styles.group]}
        contentContainerStyle={items.length === 0 ? styles.emptyContent : undefined}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        ItemSeparatorComponent={() => <PickerSeparator styles={styles} />}
        renderItem={({ item }) => {
          const selected = item.id === selectedId
          return (
            <Pressable
              style={({ pressed }) => [
                styles.item,
                pressed && chrome.listRowPressed
              ]}
              onPress={() => closeThenSelect(item)}
            >
              {renderIcon?.(item)}
              <Text
                style={[styles.itemText, selected && styles.itemTextSelected]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
              {selected && <Check size={14} color={colors.textPrimary} />}
            </Pressable>
          )
        }}
      />
    </BottomDrawer>
  )
}

function PickerSeparator({
  styles
}: {
  styles: ReturnType<typeof createPickerListDrawerStyles>
}) {
  return <View style={styles.separator} />
}

function createPickerListDrawerStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    header: {
      paddingHorizontal: spacing.xs,
      paddingBottom: spacing.sm
    },
    title: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textMuted
    },
    group: {
      maxHeight: 420,
      flexGrow: 0
    },
    emptyContent: {
      minHeight: spacing.xl
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSubtle,
      marginHorizontal: spacing.md
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md + 2
    },
    itemText: {
      flex: 1,
      fontSize: typography.bodySize,
      color: colors.textPrimary
    },
    itemTextSelected: {
      fontWeight: '600'
    }
  })
}
