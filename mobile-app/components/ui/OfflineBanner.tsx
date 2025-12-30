/**
 * OfflineBanner Component
 *
 * A banner component to display offline status and pending sync count.
 *
 * @example
 * <OfflineBanner isOffline={true} />
 * <OfflineBanner isOffline={true} pendingSyncCount={5} />
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants/colors';
import { theme } from '@/constants/theme';

export interface OfflineBannerProps {
  /** Whether the device is offline */
  isOffline: boolean;
  /** Number of items pending sync */
  pendingSyncCount?: number;
  /** Test ID for testing */
  testID?: string;
}

export function OfflineBanner({
  isOffline,
  pendingSyncCount = 0,
  testID,
}: OfflineBannerProps): React.ReactElement | null {
  if (!isOffline) {
    return null;
  }

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.content}>
        <Text style={styles.icon}>📡</Text>
        <Text style={styles.text}>You are offline</Text>
        {pendingSyncCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingSyncCount}</Text>
          </View>
        )}
      </View>
      {pendingSyncCount > 0 && (
        <Text style={styles.subtext}>
          {pendingSyncCount} change{pendingSyncCount === 1 ? '' : 's'} pending
          sync
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.warning.light,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.warning.main,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: theme.fontSize.md,
    marginRight: theme.spacing.xs,
  },
  text: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: colors.warning.dark,
    flex: 1,
  },
  badge: {
    backgroundColor: colors.warning.main,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    color: colors.neutral[0],
  },
  subtext: {
    fontSize: theme.fontSize.xs,
    color: colors.warning.dark,
    marginTop: theme.spacing.xs,
    marginLeft: theme.fontSize.md + theme.spacing.xs,
  },
});
