import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, HeroCard, ListSkeleton, MetricCard, Pill, ScreenList, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { laboratoryApi } from '@/lib/api/laboratory';
import { useRefreshQueries } from '@/lib/hooks/use-refresh-queries';
import type { LabOrder, LabResult } from '@/lib/types/laboratory';
import { useAppTheme } from '@/lib/theme/theme-context';
import { formatDateTime } from '@/lib/utils/format';

function getLabStatusTone(status: string): 'primary' | 'warning' | 'danger' | 'neutral' {
  if (status === 'COMPLETED') {
    return 'primary';
  }
  if (status === 'CANCELLED' || status === 'REJECTED') {
    return 'danger';
  }
  if (status === 'URGENT' || status === 'STAT' || status === 'SPECIMEN_COLLECTED' || status === 'IN_PROGRESS') {
    return 'warning';
  }
  return 'neutral';
}

function hasAbnormalResult(order: LabOrder): boolean {
  return order.items.some((item) => Boolean(item.result?.result_flag) || item.result?.is_critical_result);
}

function getResultTone(result: LabResult): 'primary' | 'warning' | 'danger' | 'neutral' {
  if (result.is_critical_result || ['CRITICAL', 'HIGH', 'LOW'].includes(result.result_flag || '')) {
    return 'danger';
  }
  if (result.result_flag) {
    return 'warning';
  }
  if ((result.verification_status || '').toUpperCase().includes('VERIF') || (result.verification_status || '').toUpperCase().includes('APPROV')) {
    return 'primary';
  }
  return 'neutral';
}

export default function LaboratoryScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [activeView, setActiveView] = useState<'orders' | 'results'>('orders');
  const refreshKeys = useMemo(() => [['lab-orders'], ['lab-results']] as const, []);
  const { isRefreshing, refresh } = useRefreshQueries(refreshKeys);

  const ordersQuery = useQuery({
    queryKey: ['lab-orders'],
    queryFn: () => laboratoryApi.listOrders({ page: 1, page_size: 20 }),
  });

  const resultsQuery = useQuery({
    queryKey: ['lab-results'],
    queryFn: () => laboratoryApi.listResults({ page: 1, page_size: 20 }),
  });

  if (ordersQuery.isLoading || resultsQuery.isLoading) {
    return <ListSkeleton itemCount={4} showHero />;
  }

  const orders = ordersQuery.data?.results ?? [];
  const results = resultsQuery.data?.results ?? [];
  const completedCount = orders.filter((order) => order.status === 'COMPLETED').length;
  const urgentCount = orders.filter((order) => order.priority === 'URGENT' || order.priority === 'STAT').length;
  const verifiedCount = results.filter((result) => (result.verification_status || '').toUpperCase().includes('VERIF') || (result.verification_status || '').toUpperCase().includes('APPROV')).length;
  const abnormalCount = results.filter((result) => Boolean(result.result_flag) || result.is_critical_result).length;
  const header = (
    <>
      <HeroCard
        eyebrow="Laboratory"
        title="Orders and results"
        description="Clinicians can place lab requests, while lab staff can review specimen status and verified results from the same mobile workspace."
      />

      <View style={styles.metricRow}>
        <MetricCard label="Open orders" value={String(orders.length)} tone="primary" />
        <MetricCard label="Completed" value={String(completedCount)} tone="secondary" />
        <MetricCard label={activeView === 'orders' ? 'Urgent' : 'Abnormal'} value={String(activeView === 'orders' ? urgentCount : abnormalCount)} tone="accent" />
      </View>

      <SectionCard title="Actions" subtitle="Start new lab work from a patient or encounter, or create a standalone order.">
        <AppButton label="New lab order" onPress={() => router.push('/laboratory/new' as never)} />
      </SectionCard>

      <SectionCard title="Laboratory workspace" subtitle="Switch between distinct order management and result review views.">
        <View style={styles.segmentedRow}>
          <AppButton label={`Orders (${orders.length})`} onPress={() => setActiveView('orders')} variant={activeView === 'orders' ? 'primary' : 'ghost'} />
          <AppButton label={`Results (${results.length})`} onPress={() => setActiveView('results')} variant={activeView === 'results' ? 'primary' : 'ghost'} />
        </View>
        <Text style={styles.helperText}>Pull down to refresh specimen and verification state.</Text>
      </SectionCard>
    </>
  );

  if (activeView === 'orders') {
    return (
      <ScreenList
        contentContainerStyle={styles.listContent}
        data={orders}
        emptyDescription="Create the first mobile lab order to start tracking specimen and result work from this device."
        emptyTitle="No lab orders yet"
        estimatedItemHeight={118}
        header={header}
        keyExtractor={(order) => order.order_number}
        onRefresh={() => void refresh()}
        refreshing={isRefreshing || ordersQuery.isRefetching || resultsQuery.isRefetching}
        renderItem={({ item: order }) => (
          <Pressable
            onPress={() => router.push(`/laboratory/${encodeURIComponent(order.order_number)}` as never)}
            style={({ pressed }) => [styles.orderCard, pressed && styles.cardPressed]}
          >
            <View style={styles.rowBetween}>
              <View style={styles.flexOne}>
                <Text style={styles.cardTitle}>{order.patient_name || order.patient_mrn || order.order_number}</Text>
                <Text style={styles.cardMeta}>{order.order_number} · {order.priority.replace('_', ' ')} · {order.items.length} test{order.items.length === 1 ? '' : 's'}</Text>
              </View>
              <Pill label={order.status.replace(/_/g, ' ')} tone={getLabStatusTone(order.status)} />
            </View>
            {order.clinical_notes ? <Text style={styles.bodyText}>{order.clinical_notes}</Text> : null}
            <View style={styles.metaRow}>
              <Text style={styles.cardMeta}>Ordered {formatDateTime(order.ordered_at)}</Text>
              {hasAbnormalResult(order) ? <Pill label="Abnormal result" tone="danger" /> : null}
            </View>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    );
  }

  return (
    <ScreenList
      contentContainerStyle={styles.listContent}
      data={results}
      emptyDescription="Verified or pending laboratory results will appear here for dedicated result review."
      emptyTitle="No lab results yet"
      estimatedItemHeight={144}
      header={header}
      keyExtractor={(result) => String(result.id)}
      onRefresh={() => void refresh()}
      refreshing={isRefreshing || ordersQuery.isRefetching || resultsQuery.isRefetching}
      renderItem={({ item: result }) => (
        <View style={styles.resultCard}>
          <View style={styles.rowBetween}>
            <View style={styles.flexOne}>
              <Text style={styles.cardTitle}>{result.test_name || result.test_code || 'Lab result'}</Text>
              <Text style={styles.cardMeta}>{result.test_code || 'No code'} · Entered {formatDateTime(result.entered_at || result.created_at)}</Text>
            </View>
            <Pill label={(result.verification_status || 'Pending').replace(/_/g, ' ')} tone={getResultTone(result)} />
          </View>
          <Text style={styles.resultValue}>{result.formatted_value || result.text_value || result.option_value || 'Result recorded'}</Text>
          <Text style={styles.cardMeta}>
            Range: {result.reference_range_text || [result.reference_low, result.reference_high].filter((value) => value != null).join(' - ') || 'Not provided'}
          </Text>
          <View style={styles.metaRow}>
            {result.result_flag ? <Pill label={result.result_flag.replace(/_/g, ' ')} tone={getResultTone(result)} /> : null}
            {result.is_critical_result ? <Pill label="Critical" tone="danger" /> : null}
            {verifiedCount > 0 ? <Text style={styles.cardMeta}>{verifiedCount} verified in this view</Text> : null}
          </View>
          {result.interpretation ? <Text style={styles.bodyText}>{result.interpretation}</Text> : null}
        </View>
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
    segmentedRow: {
      flexDirection: 'row',
      gap: 12,
    },
    orderCard: {
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
    metaRow: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'space-between',
    },
    resultCard: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      gap: 8,
      padding: 14,
    },
    resultValue: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '800',
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