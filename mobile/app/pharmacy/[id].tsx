import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppTextInput, DataRow, EmptyState, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { toApiError } from '@/lib/api/client';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { queryClient } from '@/lib/query/client';
import type { Prescription, PrescriptionItem, StockLevel } from '@/lib/types/pharmacy';
import { useAppTheme } from '@/lib/theme/theme-context';
import { formatDate, formatDateTime } from '@/lib/utils/format';

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

function buildStockMap(levels: StockLevel[]): Record<number, StockLevel> {
  return levels.reduce<Record<number, StockLevel>>((accumulator, level) => {
    accumulator[level.drugId] = level;
    return accumulator;
  }, {});
}

async function invalidatePrescriptionQueries(prescription: Prescription) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['prescriptions'] }),
    queryClient.invalidateQueries({ queryKey: ['prescription', prescription.id] }),
    prescription.encounter
      ? queryClient.invalidateQueries({ queryKey: ['encounter-prescriptions', prescription.encounter] })
      : Promise.resolve(),
  ]);
}

export default function PharmacyDetailScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{ id: string }>();
  const prescriptionId = Number(params.id);
  const [quantities, setQuantities] = useState<Record<number, string>>({});

  const prescriptionQuery = useQuery({
    queryKey: ['prescription', prescriptionId],
    queryFn: () => pharmacyApi.getPrescription(prescriptionId),
    enabled: Number.isFinite(prescriptionId),
  });

  const stockQuery = useQuery({
    queryKey: ['prescription-stock', prescriptionId],
    enabled: Boolean(prescriptionQuery.data),
    queryFn: async () => {
      const uniqueDrugIds = Array.from(new Set((prescriptionQuery.data?.items ?? []).map((item) => item.drug)));
      const levels = await Promise.all(uniqueDrugIds.map((drugId) => pharmacyApi.getStockLevel(drugId)));
      return buildStockMap(levels);
    },
  });

  useEffect(() => {
    if (!prescriptionQuery.data) {
      return;
    }

    setQuantities((current) => {
      const next = { ...current };
      for (const item of prescriptionQuery.data.items) {
        if (!(item.id in next)) {
          next[item.id] = String(item.remaining_quantity || item.quantity_prescribed);
        }
      }
      return next;
    });
  }, [prescriptionQuery.data]);

  const dispenseMutation = useMutation({
    mutationFn: (item: PrescriptionItem) =>
      pharmacyApi.dispense({
        drug_id: item.drug,
        patient_id: prescriptionQuery.data!.patient,
        quantity: Number(quantities[item.id] || '0'),
        prescription_item_id: item.id,
      }),
    onSuccess: async () => {
      if (prescriptionQuery.data) {
        await invalidatePrescriptionQueries(prescriptionQuery.data);
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => pharmacyApi.cancelPrescription(prescriptionId, 'Cancelled from mobile pharmacy workflow.'),
    onSuccess: async (updatedPrescription) => {
      await invalidatePrescriptionQueries(updatedPrescription);
    },
  });

  if (prescriptionQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading prescription..." />
      </ScreenContainer>
    );
  }

  if (!prescriptionQuery.data) {
    return (
      <ScreenContainer>
        <EmptyState title="Prescription not found" description="This prescription could not be loaded from the pharmacy API." />
      </ScreenContainer>
    );
  }

  const prescription = prescriptionQuery.data;
  const stockMap = stockQuery.data ?? {};

  async function handleDispense(item: PrescriptionItem) {
    const requestedQuantity = Number(quantities[item.id] || '0');
    const stockLevel = stockMap[item.drug];

    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      Alert.alert('Quantity required', 'Enter a valid quantity to dispense.');
      return;
    }

    if (requestedQuantity > item.remaining_quantity) {
      Alert.alert('Quantity too high', 'You cannot dispense more than the remaining prescribed quantity.');
      return;
    }

    if (stockLevel && requestedQuantity > stockLevel.availableQuantity) {
      Alert.alert('Insufficient stock', `Only ${stockLevel.availableQuantity} units are currently available.`);
      return;
    }

    try {
      const records = await dispenseMutation.mutateAsync(item);
      Alert.alert('Dispensed', `${records.length} stock batch record${records.length === 1 ? '' : 's'} created for this medication.`);
    } catch (error) {
      Alert.alert('Unable to dispense medication', toApiError(error).message);
    }
  }

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Prescription"
        title={prescription.patient_name || prescription.patient_mrn || prescription.prescription_number}
        description={`${prescription.prescription_number} · valid until ${formatDate(prescription.valid_until)} · ${prescription.items.length} medication item${prescription.items.length === 1 ? '' : 's'}`}
      >
        <Pill label={prescription.status.replace(/_/g, ' ')} tone={getPrescriptionTone(prescription.status)} />
      </HeroCard>

      <SectionCard title="Summary">
        <DataRow label="Patient" value={prescription.patient_name} />
        <DataRow label="MRN" value={prescription.patient_mrn} />
        <DataRow label="Prescriber" value={prescription.prescriber_name} />
        <DataRow label="Prescribed at" value={formatDateTime(prescription.prescribed_at || prescription.created_at)} />
        <DataRow label="Valid until" value={formatDate(prescription.valid_until)} />
        <DataRow label="Clinical notes" value={prescription.clinical_notes} />
      </SectionCard>

      {!['CANCELLED', 'DISPENSED', 'EXPIRED'].includes(prescription.status) ? (
        <SectionCard title="Prescription actions" subtitle="Cancel this prescription if it should not proceed to dispensing.">
          <AppButton
            label={cancelMutation.isPending ? 'Cancelling...' : 'Cancel prescription'}
            variant="danger"
            onPress={async () => {
              try {
                await cancelMutation.mutateAsync();
              } catch (error) {
                Alert.alert('Unable to cancel prescription', toApiError(error).message);
              }
            }}
            disabled={cancelMutation.isPending}
          />
        </SectionCard>
      ) : null}

      <SectionCard title="Medication items" subtitle="Dispensing checks live stock before posting the FEFO dispense request.">
        {prescription.items.length === 0 ? (
          <EmptyState title="No medication items" description="This prescription was created without medication lines." />
        ) : (
          prescription.items.map((item) => {
            const stockLevel = stockMap[item.drug];
            return (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.rowBetween}>
                  <View style={styles.flexOne}>
                    <Text style={styles.cardTitle}>{item.drug_name || item.drug_code || 'Medication'}</Text>
                    <Text style={styles.cardMeta}>{item.dosage} · {item.frequency} · {item.duration}</Text>
                  </View>
                  <Pill label={`${item.remaining_quantity} left`} tone={item.remaining_quantity > 0 ? 'warning' : 'primary'} />
                </View>

                {item.instructions ? <Text style={styles.bodyText}>{item.instructions}</Text> : null}

                <View style={styles.flagRow}>
                  <Pill label={`Dispensed ${item.quantity_dispensed}`} tone="neutral" />
                  {stockLevel ? (
                    <Pill
                      label={stockLevel.outOfStock ? 'Out of stock' : `${stockLevel.availableQuantity} in stock`}
                      tone={stockLevel.outOfStock ? 'danger' : stockLevel.lowStock ? 'warning' : 'primary'}
                    />
                  ) : (
                    <Pill label="Checking stock" tone="neutral" />
                  )}
                </View>

                <AppTextInput
                  label="Dispense quantity"
                  value={quantities[item.id] || ''}
                  onChangeText={(value) => setQuantities((current) => ({ ...current, [item.id]: value }))}
                  keyboardType="numeric"
                  autoCapitalize="none"
                />
                <AppButton
                  label={dispenseMutation.isPending ? 'Dispensing...' : 'Dispense medication'}
                  onPress={() => void handleDispense(item)}
                  disabled={dispenseMutation.isPending || item.is_cancelled || item.remaining_quantity <= 0}
                />
              </View>
            );
          })
        )}
      </SectionCard>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    itemCard: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      gap: 10,
      padding: 14,
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
    flagRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
  });
}