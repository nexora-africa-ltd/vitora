import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppPicker, HeroCard, ListSkeleton, Pill, ScreenList, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { auditApi } from '@/lib/api/audit';
import { useAuth } from '@/lib/auth/auth-context';
import { useRefreshQueries } from '@/lib/hooks/use-refresh-queries';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { AuditLogEntry } from '@/lib/types/audit';
import { formatDateTime } from '@/lib/utils/format';

const ACTION_FILTERS = [
  { label: 'All actions', value: '' },
  { label: 'Authentication', value: 'login_success' },
  { label: 'Patient views', value: 'patient_view' },
  { label: 'Encounter edits', value: 'encounter_update' },
  { label: 'Check-in', value: 'patient_checkin' },
] as const;

function getActionTone(action: string): 'primary' | 'warning' | 'danger' | 'neutral' {
  if (action.includes('delete') || action.includes('denied') || action.includes('failed')) {
    return 'danger';
  }

  if (action.includes('update') || action.includes('check') || action.includes('claim')) {
    return 'warning';
  }

  if (action.includes('create') || action.includes('login') || action.includes('view')) {
    return 'primary';
  }

  return 'neutral';
}

export default function AuditLogScreen() {
  const { theme } = useAppTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [actionFilter, setActionFilter] = useState('');
  const refreshKeys = useMemo(() => [['audit-logs']] as const, []);
  const { isRefreshing, refresh } = useRefreshQueries(refreshKeys);

  const auditQuery = useQuery({
    queryKey: ['audit-logs', user?.id ?? null, actionFilter],
    queryFn: () =>
      auditApi.listAuditLogs({
        action: actionFilter || undefined,
        ordering: '-timestamp',
        page_size: 50,
        user: user?.id,
      }),
    enabled: Boolean(user?.id),
  });

  if (auditQuery.isLoading) {
    return <ListSkeleton itemCount={4} showHero />;
  }

  const entries = auditQuery.data?.results ?? [];

  return (
    <ScreenList
      contentContainerStyle={styles.listContent}
      data={entries}
      emptyDescription="Your matching actions will appear here once they are recorded by the backend."
      emptyTitle="No audit entries"
      estimatedItemHeight={104}
      header={
        <>
          <HeroCard
            eyebrow="Audit trail"
            title="Your activity"
            description="Read-only security trail for your own mobile and backend actions."
          />

          <SectionCard title="Filters" subtitle="Narrow the audit stream by action type.">
            <AppPicker label="Action type" selectedValue={actionFilter} onValueChange={setActionFilter} items={ACTION_FILTERS.map((item) => ({ ...item }))} />
            <AppButton label="Back to settings" variant="ghost" onPress={() => router.back()} />
          </SectionCard>

          <SectionCard title="Entries" subtitle={`${entries.length} audit event${entries.length === 1 ? '' : 's'} loaded.`}>
            <Text style={styles.helperText}>Pull down to refresh after recent actions like login or patient view.</Text>
          </SectionCard>
        </>
      }
      keyExtractor={(entry) => String(entry.id)}
      onRefresh={() => void refresh()}
      refreshing={isRefreshing || auditQuery.isRefetching}
      renderItem={({ item: entry }) => <AuditLogCard entry={entry} styles={styles} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

function AuditLogCard({ entry, styles }: { entry: AuditLogEntry; styles: ReturnType<typeof createStyles> }) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>{entry.action.replace(/_/g, ' ')}</Text>
          <Text style={styles.cardMeta}>{entry.resource_type} {entry.resource_id ? `#${entry.resource_id}` : ''}</Text>
        </View>
        <Pill label={entry.action.replace(/_/g, ' ')} tone={getActionTone(entry.action)} />
      </View>
      <Text style={styles.cardSummary}>{formatDateTime(entry.timestamp)}</Text>
      {entry.patient_id ? <Text style={styles.cardMeta}>Patient #{entry.patient_id}</Text> : null}
    </Pressable>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      gap: 8,
      padding: 14,
    },
    cardPressed: {
      opacity: 0.82,
    },
    cardHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
    },
    cardMeta: {
      color: theme.colors.mutedText,
      fontSize: 12,
    },
    cardSummary: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    cardTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '800',
      textTransform: 'capitalize',
    },
    cardTitleBlock: {
      flex: 1,
      gap: 2,
    },
    helperText: {
      color: theme.colors.mutedText,
      fontSize: 13,
    },
    listContent: {
      paddingBottom: 28,
    },
    separator: {
      height: 12,
    },
  });
}