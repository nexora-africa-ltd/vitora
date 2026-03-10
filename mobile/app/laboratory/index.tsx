import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, EmptyState, HeroCard, LoadingState, MetricCard, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { laboratoryApi } from '@/lib/api/laboratory';
import type { LabOrder } from '@/lib/types/laboratory';
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

export default function LaboratoryScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const ordersQuery = useQuery({
    queryKey: ['lab-orders'],
    queryFn: () => laboratoryApi.listOrders({ page: 1, page_size: 20 }),
  });

  if (ordersQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading laboratory workload..." />
      </ScreenContainer>
    );
  }

  const orders = ordersQuery.data?.results ?? [];
  const completedCount = orders.filter((order) => order.status === 'COMPLETED').length;
  const urgentCount = orders.filter((order) => order.priority === 'URGENT' || order.priority === 'STAT').length;

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Laboratory"
        title="Orders and results"
        description="Clinicians can place lab requests, while lab staff can review specimen status and verified results from the same mobile workspace."
      />

      <View style={styles.metricRow}>
        <MetricCard label="Open orders" value={String(orders.length)} tone="primary" />
        <MetricCard label="Completed" value={String(completedCount)} tone="secondary" />
        <MetricCard label="Urgent" value={String(urgentCount)} tone="accent" />
      </View>

      <SectionCard title="Actions" subtitle="Start new lab work from a patient or encounter, or create a standalone order.">
        <AppButton label="New lab order" onPress={() => router.push('/laboratory/new' as never)} />
      </SectionCard>

      <SectionCard title="Lab queue" subtitle="Orders show specimen state, turnaround progress, and abnormal result cues.">
        {orders.length === 0 ? (
          <EmptyState title="No lab orders yet" description="Create the first mobile lab order to start the Phase 2 workflow." />
        ) : (
          orders.map((order) => (
            <Pressable
              key={order.order_number}
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
          ))
        )}
      </SectionCard>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    metricRow: {
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
  });
}