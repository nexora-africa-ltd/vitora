import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton, DataRow, EmptyState, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { laboratoryApi } from '@/lib/api/laboratory';
import { toApiError } from '@/lib/api/client';
import { queryClient } from '@/lib/query/client';
import type { LabOrder, LabResult } from '@/lib/types/laboratory';
import { useAppTheme } from '@/lib/theme/theme-context';
import { formatDateTime } from '@/lib/utils/format';

function getToneForFlag(flag?: string | null, critical?: boolean): 'primary' | 'warning' | 'danger' | 'neutral' {
  if (critical || flag === 'CRITICAL' || flag === 'HIGH' || flag === 'LOW') {
    return 'danger';
  }
  if (flag === 'ABNORMAL' || flag === 'BORDERLINE') {
    return 'warning';
  }
  if (flag === 'NORMAL') {
    return 'primary';
  }
  return 'neutral';
}

function getOrderTone(status: string): 'primary' | 'warning' | 'danger' | 'neutral' {
  if (status === 'COMPLETED') {
    return 'primary';
  }
  if (status === 'CANCELLED' || status === 'REJECTED') {
    return 'danger';
  }
  if (status === 'SPECIMEN_COLLECTED' || status === 'IN_PROGRESS') {
    return 'warning';
  }
  return 'neutral';
}

function canVerify(result: LabResult): boolean {
  const status = result.verification_status?.toUpperCase() ?? '';
  return !status.includes('APPROV') && status !== 'VERIFIED';
}

async function invalidateLabQueries(order: LabOrder) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['lab-orders'] }),
    queryClient.invalidateQueries({ queryKey: ['lab-order', order.order_number] }),
    order.encounter ? queryClient.invalidateQueries({ queryKey: ['encounter-lab-orders', order.encounter] }) : Promise.resolve(),
  ]);
}

export default function LaboratoryDetailScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{ id: string }>();
  const orderNumber = decodeURIComponent(String(params.id || ''));

  const orderQuery = useQuery({
    queryKey: ['lab-order', orderNumber],
    queryFn: () => laboratoryApi.getOrder(orderNumber),
    enabled: orderNumber.length > 0,
  });

  const submitMutation = useMutation({
    mutationFn: () => laboratoryApi.submitOrder(orderNumber),
    onSuccess: invalidateLabQueries,
  });

  const collectMutation = useMutation({
    mutationFn: () => laboratoryApi.collectSpecimen(orderNumber),
    onSuccess: invalidateLabQueries,
  });

  const cancelMutation = useMutation({
    mutationFn: () => laboratoryApi.cancelOrder(orderNumber, 'Cancelled from mobile laboratory workflow.'),
    onSuccess: invalidateLabQueries,
  });

  const verifyMutation = useMutation({
    mutationFn: (resultId: number) =>
      laboratoryApi.verifyResult(resultId, {
        approved: true,
        validation_type: 'TECHNICAL',
        comments: 'Verified from mobile laboratory workspace.',
      }),
    onSuccess: async () => {
      if (orderQuery.data) {
        await invalidateLabQueries(orderQuery.data);
      }
    },
  });

  if (orderQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading lab order..." />
      </ScreenContainer>
    );
  }

  if (!orderQuery.data) {
    return (
      <ScreenContainer>
        <EmptyState title="Lab order not found" description="This order could not be loaded from the laboratory API." />
      </ScreenContainer>
    );
  }

  const order = orderQuery.data;

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Lab order"
        title={order.patient_name || order.patient_mrn || order.order_number}
        description={`${order.order_number} · ${order.priority.replace(/_/g, ' ')} · ${order.items.length} requested test${order.items.length === 1 ? '' : 's'}`}
      >
        <Pill label={order.status.replace(/_/g, ' ')} tone={getOrderTone(order.status)} />
      </HeroCard>

      <SectionCard title="Workflow actions" subtitle="Advance the specimen workflow or manage exceptions directly from mobile.">
        {order.status === 'DRAFT' ? (
          <AppButton
            label={submitMutation.isPending ? 'Submitting...' : 'Submit order'}
            onPress={async () => {
              try {
                await submitMutation.mutateAsync();
              } catch (error) {
                Alert.alert('Unable to submit order', toApiError(error).message);
              }
            }}
            disabled={submitMutation.isPending}
          />
        ) : null}
        {order.status === 'ORDERED' ? (
          <AppButton
            label={collectMutation.isPending ? 'Recording specimen...' : 'Collect specimen'}
            variant="secondary"
            onPress={async () => {
              try {
                await collectMutation.mutateAsync();
              } catch (error) {
                Alert.alert('Unable to collect specimen', toApiError(error).message);
              }
            }}
            disabled={collectMutation.isPending}
          />
        ) : null}
        {!['CANCELLED', 'COMPLETED', 'REJECTED'].includes(order.status) ? (
          <AppButton
            label={cancelMutation.isPending ? 'Cancelling...' : 'Cancel order'}
            variant="danger"
            onPress={async () => {
              try {
                await cancelMutation.mutateAsync();
                router.back();
              } catch (error) {
                Alert.alert('Unable to cancel order', toApiError(error).message);
              }
            }}
            disabled={cancelMutation.isPending}
          />
        ) : null}
      </SectionCard>

      <SectionCard title="Summary">
        <DataRow label="Patient" value={order.patient_name} />
        <DataRow label="MRN" value={order.patient_mrn} />
        <DataRow label="Order type" value={order.order_type.replace(/_/g, ' ')} />
        <DataRow label="Priority" value={order.priority.replace(/_/g, ' ')} />
        <DataRow label="Ordered by" value={order.ordered_by_name} />
        <DataRow label="Ordered at" value={formatDateTime(order.ordered_at)} />
        <DataRow label="Specimen collected" value={order.specimen_collected ? formatDateTime(order.specimen_collected_at) : 'Not yet'} />
        <DataRow label="Clinical notes" value={order.clinical_notes} />
      </SectionCard>

      <SectionCard title="Results" subtitle="Reference ranges and abnormal markers are surfaced from the lab result serializers.">
        {order.items.length === 0 ? (
          <EmptyState title="No tests on this order" description="Add tests from the order creation flow before the laboratory can process results." />
        ) : (
          order.items.map((item) => (
            <View key={item.id} style={styles.resultCard}>
              <View style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>{item.test_name || item.test_code || 'Lab test'}</Text>
                  <Text style={styles.cardMeta}>{item.test_code || 'No code'} · {item.status.replace(/_/g, ' ')}</Text>
                </View>
                <Pill label={item.result?.verification_status?.replace(/_/g, ' ') || 'Pending result'} tone={item.result ? getToneForFlag(item.result.result_flag, item.result.is_critical_result) : 'neutral'} />
              </View>

              {item.result ? (
                <View style={styles.resultStack}>
                  <Text style={styles.resultValue}>{item.result.formatted_value || item.result.text_value || item.result.option_value || 'Result recorded'}</Text>
                  <Text style={styles.cardMeta}>
                    Range: {item.result.reference_range_text || [item.result.reference_low, item.result.reference_high].filter((value) => value != null).join(' - ') || 'Not provided'}
                  </Text>
                  {item.result.interpretation ? <Text style={styles.bodyText}>{item.result.interpretation}</Text> : null}
                  {item.result.result_flag || item.result.is_critical_result ? (
                    <View style={styles.flagRow}>
                      {item.result.result_flag ? <Pill label={item.result.result_flag.replace(/_/g, ' ')} tone={getToneForFlag(item.result.result_flag, item.result.is_critical_result)} /> : null}
                      {item.result.is_critical_result ? <Pill label="Critical" tone="danger" /> : null}
                    </View>
                  ) : null}
                  <DataRow label="Entered" value={formatDateTime(item.result.entered_at)} />
                  <DataRow label="Verified by" value={item.result.verified_by_name} />
                  {canVerify(item.result) ? (
                    <AppButton
                      label={verifyMutation.isPending ? 'Verifying...' : 'Verify result'}
                      variant="secondary"
                      onPress={async () => {
                        try {
                          await verifyMutation.mutateAsync(item.result!.id);
                        } catch (error) {
                          Alert.alert('Unable to verify result', toApiError(error).message);
                        }
                      }}
                      disabled={verifyMutation.isPending}
                    />
                  ) : null}
                </View>
              ) : (
                <Text style={styles.bodyText}>No result has been entered for this test yet.</Text>
              )}
            </View>
          ))
        )}
      </SectionCard>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    rowBetween: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    flexOne: {
      flex: 1,
      marginRight: 12,
    },
    resultCard: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      gap: 10,
      padding: 14,
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
    resultStack: {
      gap: 8,
    },
    resultValue: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '800',
    },
    bodyText: {
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
    },
    flagRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
  });
}