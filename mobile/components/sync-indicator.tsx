import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, Pill } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { useSyncStatus } from '@/lib/sync/status';
import { useAppTheme } from '@/lib/theme/theme-context';
import { formatDateTime } from '@/lib/utils/format';

function getTone(state: ReturnType<typeof useSyncStatus>['state']) {
  if (state === 'conflict' || state === 'error') {
    return 'danger' as const;
  }

  if (state === 'syncing') {
    return 'warning' as const;
  }

  if (state === 'offline' || state === 'idle' || state === 'hydrating') {
    return 'neutral' as const;
  }

  return 'primary' as const;
}

function getLabel(state: ReturnType<typeof useSyncStatus>['state'], pendingCount: number, conflictCount: number) {
  if (state === 'hydrating') {
    return 'Preparing offline cache';
  }

  if (state === 'syncing') {
    return 'Syncing';
  }

  if (state === 'conflict') {
    return conflictCount > 0 ? `${conflictCount} conflict${conflictCount === 1 ? '' : 's'}` : 'Conflict';
  }

  if (state === 'offline') {
    return pendingCount > 0 ? `${pendingCount} queued offline` : 'Offline';
  }

  if (state === 'error') {
    return 'Sync error';
  }

  return pendingCount > 0 ? `${pendingCount} queued` : 'Synced';
}

export function SyncIndicator() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { conflictCount, error, isOnline, lastSyncedAt, pendingCount, requestSync, state } = useSyncStatus();

  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <Pill label={getLabel(state, pendingCount, conflictCount)} tone={getTone(state)} />
        <Text style={styles.caption}>
          {state === 'synced' && lastSyncedAt
            ? `Last sync ${formatDateTime(lastSyncedAt)}`
            : error
              ? error
              : isOnline
                ? 'Connectivity available'
                : 'Changes stay on device until connectivity returns.'}
        </Text>
      </View>
      <View style={styles.buttonWrap}>
        <AppButton label={state === 'syncing' ? 'Syncing...' : 'Sync now'} onPress={() => void requestSync('manual')} disabled={!isOnline || state === 'syncing'} variant="ghost" />
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: theme.spacing.md,
      justifyContent: 'space-between',
      padding: theme.spacing.md,
    },
    copy: {
      flex: 1,
      gap: 6,
    },
    caption: {
      color: theme.colors.mutedText,
      fontSize: 12,
      lineHeight: 17,
    },
    buttonWrap: {
      minWidth: 108,
    },
  });
}