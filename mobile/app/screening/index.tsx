import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton, HeroCard, LoadingState, Pill, ScreenContainer, ScreenList, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { screeningApi } from '@/lib/api/screening';
import { useLocalScreenings } from '@/lib/hooks/use-local-mch';
import { useRefreshQueries } from '@/lib/hooks/use-refresh-queries';
import { notifyErrorHaptic, notifySuccessHaptic } from '@/lib/haptics';
import { useAppTheme } from '@/lib/theme/theme-context';
import { formatDate } from '@/lib/utils/format';

function screeningLabel(type: string): string {
  if (type === 'MALNUTRITION') return 'Malnutrition';
  if (type === 'TB_CONTACT') return 'TB contact';
  return 'Malaria RDT';
}

export default function ScreeningListScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const screeningsQuery = useLocalScreenings();
  const refreshKeys = useMemo(() => [['local-screenings']] as const, []);
  const { isRefreshing, refresh } = useRefreshQueries(refreshKeys);

  if (screeningsQuery.isLoading) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState message="Loading field screenings..." fullScreen />
      </ScreenContainer>
    );
  }

  const records = screeningsQuery.screenings;
  const pendingCount = records.filter((record) => record.sync_status === 'pending_upload').length;

  async function handleSyncPending() {
    try {
      const summary = await screeningApi.syncPendingScreenings();
      await notifySuccessHaptic();
      Alert.alert('Screening sync status', summary.message);
      await refresh();
    } catch (error) {
      await notifyErrorHaptic();
      Alert.alert('Screening sync failed', error instanceof Error ? error.message : 'Unable to sync pending screenings.');
    }
  }

  return (
    <ScreenList
      contentContainerStyle={styles.listContent}
      data={records}
      emptyDescription="Start a screening while online or offline and it will be stored on the device."
      emptyTitle="No field screenings yet"
      estimatedItemHeight={124}
      header={
        <>
          <HeroCard
            eyebrow="Community screening"
            title="Field outreach"
            description="Capture malnutrition checks, TB contact tracing, and malaria RDT visits while offline in the field."
          />

          <SectionCard title="Actions" subtitle="Start a new screening record or review pending submissions.">
            <AppButton label="New screening" onPress={() => router.push('/screening/new' as never)} />
            <AppButton label={`Pending upload (${pendingCount})`} onPress={() => void handleSyncPending()} variant="secondary" />
          </SectionCard>

          <SectionCard title="Screening log" subtitle={`${records.length} field records stored on this device.`}>
            <Text style={styles.helperText}>Pull down to refresh after queued uploads or field edits.</Text>
          </SectionCard>
        </>
      }
      keyExtractor={(record) => String(record.id)}
      onRefresh={() => void refresh()}
      refreshing={isRefreshing || screeningsQuery.isRefetching}
      renderItem={({ item: record }) => (
        <View style={styles.card}>
          <View style={styles.topRow}>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>{record.patient_name || 'Unlinked field visit'}</Text>
              <Text style={styles.meta}>{screeningLabel(record.screening_type)} · {formatDate(record.screening_date)}</Text>
            </View>
            <Pill label={record.sync_status === 'pending_upload' ? 'Queued' : record.sync_status.replace(/_/g, ' ')} tone={record.sync_status === 'upload_failed' ? 'danger' : record.sync_status === 'uploaded' ? 'primary' : 'warning'} />
          </View>
          <Text style={styles.summary}>{record.result_summary}</Text>
          <Text style={styles.meta}>{record.chu_name || 'CHU pending'} · {record.territory || 'Territory pending'}</Text>
          <View style={styles.flagRow}>
            {record.location ? <Pill label="GPS captured" tone="primary" /> : <Pill label="No GPS" tone="warning" />}
            {record.photo ? <Pill label="Photo attached" tone="primary" /> : null}
          </View>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
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
    flagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    meta: {
      color: theme.colors.mutedText,
      fontSize: 12,
    },
    summary: {
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
    },
    title: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '700',
    },
    titleBlock: {
      flex: 1,
      marginRight: 12,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
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