import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, HeroCard, LoadingState, MetricCard, Pill, ScreenContainer, ScreenList, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { useRefreshQueries } from '@/lib/hooks/use-refresh-queries';
import type { Prescription } from '@/lib/types/pharmacy';
import { useAppTheme } from '@/lib/theme/theme-context';
import { formatDateTime } from '@/lib/utils/format';

function getPrescriptionTone(status: string): 'primary' | 'warning' | 'danger' | 'neutral' {
  if (status === 'DISPENSED') {
    return 'primary';
  }
  if (status === 'PARTIAL') {
    return 'warning';
  }
  if (status === 'CANCELLED' || status === 'EXPIRED') {
    return 'danger';
  }
  return 'neutral';
}

function remainingItems(prescription: Prescription): number {
  return prescription.items.filter((item) => item.remaining_quantity > 0 && !item.is_cancelled).length;
}

export default function PharmacyScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const refreshKeys = useMemo(() => [['prescriptions']] as const, []);
  const { isRefreshing, refresh } = useRefreshQueries(refreshKeys);

  const prescriptionsQuery = useQuery({
    queryKey: ['prescriptions'],
    queryFn: () => pharmacyApi.listPrescriptions({ page: 1, page_size: 20, ordering: '-prescribed_at' }),
  });

  if (prescriptionsQuery.isLoading) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState message="Loading prescription queue..." fullScreen />
      </ScreenContainer>
    );
  }

  const prescriptions = prescriptionsQuery.data?.results ?? [];
  const pendingCount = prescriptions.filter((item) => item.status === 'PENDING').length;
  const partialCount = prescriptions.filter((item) => item.status === 'PARTIAL').length;

  return (
    <ScreenList
      contentContainerStyle={styles.listContent}
      data={prescriptions}
      emptyDescription="Create a prescription from an encounter or start one directly from the pharmacy module."
      emptyTitle="No prescriptions yet"
      estimatedItemHeight={116}
      header={
        <>
          <HeroCard
            eyebrow="Pharmacy"
            title="Prescription queue"
            description="Review medication orders, check stock, and record dispensing quantities without leaving the mobile encounter workflow."
          />

          <View style={styles.metricRow}>
            <MetricCard label="Pending" value={String(pendingCount)} tone="primary" />
            <MetricCard label="Partial" value={String(partialCount)} tone="accent" />
            <MetricCard label="Queue size" value={String(prescriptions.length)} tone="secondary" />
          </View>

          <SectionCard title="Actions" subtitle="Create a new prescription or continue dispensing from the active queue.">
            <AppButton label="New prescription" onPress={() => router.push('/pharmacy/new' as never)} />
          </SectionCard>

          <SectionCard title="Dispensing queue" subtitle="Stock-aware dispensing starts from the open prescription list.">
            <Text style={styles.helperText}>Pull down to refresh queue changes from dispensing activity.</Text>
          </SectionCard>
        </>
      }
      keyExtractor={(prescription) => String(prescription.id)}
      onRefresh={() => void refresh()}
      refreshing={isRefreshing || prescriptionsQuery.isRefetching}
      renderItem={({ item: prescription }) => (
        <Pressable
          onPress={() => router.push(`/pharmacy/${prescription.id}` as never)}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.rowBetween}>
            <View style={styles.flexOne}>
              <Text style={styles.cardTitle}>{prescription.patient_name || prescription.patient_mrn || prescription.prescription_number}</Text>
              <Text style={styles.cardMeta}>{prescription.prescription_number} · {prescription.items.length} item{prescription.items.length === 1 ? '' : 's'} · {remainingItems(prescription)} remaining</Text>
            </View>
            <Pill label={prescription.status.replace(/_/g, ' ')} tone={getPrescriptionTone(prescription.status)} />
          </View>
          {prescription.clinical_notes ? <Text style={styles.bodyText}>{prescription.clinical_notes}</Text> : null}
          <Text style={styles.cardMeta}>Prescribed {formatDateTime(prescription.prescribed_at || prescription.created_at)}</Text>
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    metricRow: {
      flexDirection: 'row',
      gap: 12,
    },
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
    rowBetween: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    flexOne: {
      flex: 1,
      marginRight: 12,
    },
    cardTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '700',
    },
    cardMeta: {
      color: theme.colors.mutedText,
      fontSize: 12,
    },
    bodyText: {
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
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
