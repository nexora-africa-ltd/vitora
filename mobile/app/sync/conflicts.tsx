import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, EmptyState, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { discardQueueEntry, getConflictAndFailedEntries, retryQueueEntry } from '@/lib/db';
import type { SyncQueueEntry } from '@/lib/db/schema';
import { useSyncStatus } from '@/lib/sync/status';
import { useAppTheme } from '@/lib/theme/theme-context';

function getEntryTitle(entry: SyncQueueEntry): string {
  const payload = entry.payload as unknown as Record<string, unknown>;
  if (entry.entity === 'patient') {
    const name = [payload.first_name, payload.last_name].filter(Boolean).join(' ');
    return name || 'Unknown patient';
  }
  const complaint = typeof payload.chief_complaint === 'string' ? payload.chief_complaint : '';
  return complaint.slice(0, 60) || 'Encounter';
}

function getStatusTone(status: SyncQueueEntry['status']): 'danger' | 'warning' {
  return status === 'conflict' ? 'warning' : 'danger';
}

function getStatusLabel(entry: SyncQueueEntry): string {
  if (entry.status === 'conflict') return 'Conflict (409)';
  return `Failed (${entry.attempts} attempts)`;
}

export default function SyncConflictsScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { requestSync } = useSyncStatus();
  const [entries, setEntries] = useState<SyncQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const items = await getConflictAndFailedEntries();
    setEntries(items);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDiscard = useCallback((entry: SyncQueueEntry) => {
    Alert.alert(
      'Discard record?',
      `This will permanently remove the locally-created ${entry.entity} that failed to sync. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            await discardQueueEntry(entry.id);
            await refresh();
          },
        },
      ]
    );
  }, [refresh]);

  const handleRetry = useCallback(async (entry: SyncQueueEntry) => {
    await retryQueueEntry(entry.id);
    await requestSync('conflict-retry');
    await refresh();
  }, [refresh, requestSync]);

  const handleRetryAll = useCallback(async () => {
    for (const entry of entries) {
      await retryQueueEntry(entry.id);
    }
    await requestSync('conflict-retry-all');
    await refresh();
  }, [entries, refresh, requestSync]);

  if (loading) {
    return <ScreenContainer><LoadingState message="Loading sync issues..." /></ScreenContainer>;
  }

  if (entries.length === 0) {
    return (
      <ScreenContainer>
        <EmptyState title="No sync issues" description="All records have been synced successfully." />
        <View style={styles.footerActions}>
          <AppButton label="Go back" onPress={() => router.back()} variant="ghost" />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Sync Issues</Text>
        <Text style={styles.subtitle}>
          {entries.length} item{entries.length === 1 ? '' : 's'} need{entries.length === 1 ? 's' : ''} attention
        </Text>
      </View>

      {entries.length > 1 && (
        <View style={styles.bulkActions}>
          <AppButton label="Retry all" onPress={handleRetryAll} variant="ghost" />
        </View>
      )}

      {entries.map((entry) => (
        <SectionCard key={entry.id} title={getEntryTitle(entry)} subtitle={`${entry.entity} • ${entry.operation}`}>
          <View style={styles.entryContent}>
            <View style={styles.entryStatus}>
              <Pill label={getStatusLabel(entry)} tone={getStatusTone(entry.status)} />
            </View>

            {entry.last_error ? (
              <Text style={styles.errorText}>{entry.last_error}</Text>
            ) : null}

            <Text style={styles.metaText}>
              Created {new Date(entry.created_at).toLocaleString()} • {entry.attempts} attempt{entry.attempts === 1 ? '' : 's'}
            </Text>

            <Pressable onPress={() => setEntries((prev) =>
              prev.map((e) => e.id === entry.id ? { ...e, _expanded: !((e as Record<string, unknown>)._expanded) } as SyncQueueEntry : e)
            )}>
              <Text style={styles.togglePayload}>View payload</Text>
            </Pressable>

            {(entry as Record<string, unknown>)._expanded ? (
              <View style={styles.payloadBox}>
                <Text style={styles.payloadText}>{JSON.stringify(entry.payload, null, 2)}</Text>
              </View>
            ) : null}

            <View style={styles.entryActions}>
              <AppButton label="Retry" onPress={() => void handleRetry(entry)} variant="ghost" />
              <AppButton label="Discard" onPress={() => handleDiscard(entry)} variant="danger" />
            </View>
          </View>
        </SectionCard>
      ))}

      <View style={styles.footerActions}>
        <AppButton label="Go back" onPress={() => router.back()} variant="ghost" />
      </View>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    header: {
      gap: 4,
      marginBottom: theme.spacing.md,
    },
    title: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: '700',
    },
    subtitle: {
      color: theme.colors.mutedText,
      fontSize: 14,
    },
    bulkActions: {
      alignItems: 'flex-end',
      marginBottom: theme.spacing.sm,
    },
    entryContent: {
      gap: theme.spacing.sm,
    },
    entryStatus: {
      alignItems: 'flex-start',
    },
    errorText: {
      backgroundColor: theme.colors.danger + '14',
      borderRadius: theme.radius.sm,
      color: theme.colors.danger,
      fontSize: 13,
      lineHeight: 18,
      padding: theme.spacing.sm,
    },
    metaText: {
      color: theme.colors.mutedText,
      fontSize: 12,
    },
    togglePayload: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: '500',
    },
    payloadBox: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      padding: theme.spacing.sm,
    },
    payloadText: {
      color: theme.colors.mutedText,
      fontFamily: 'monospace',
      fontSize: 11,
      lineHeight: 16,
    },
    entryActions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      justifyContent: 'flex-end',
    },
    footerActions: {
      alignItems: 'center',
      marginTop: theme.spacing.md,
    },
  });
}
