import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppPicker,
  AppTextInput,
  LoadingState,
  Pill,
  ScreenContainer,
  SectionCard,
} from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { inpatientApi } from '@/lib/api/inpatient';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { PayerType } from '@/lib/types/inpatient';

const PAYER_TYPES: { label: string; value: PayerType }[] = [
  { label: 'Cash', value: 'CASH' },
  { label: 'SHA (Insurance)', value: 'SHA' },
  { label: 'Corporate', value: 'CORPORATE' },
];

export default function NewAdmissionScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  // ── Form state ──
  const [patientId, setPatientId] = useState('');
  const [encounterIdStr, setEncounterIdStr] = useState('');
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);
  const [selectedBedId, setSelectedBedId] = useState<number | null>(null);
  const [autoAssignBed, setAutoAssignBed] = useState(false);
  const [payerType, setPayerType] = useState<PayerType>('CASH');
  const [insuranceDetails, setInsuranceDetails] = useState('');
  const [constraintOverride, setConstraintOverride] = useState(false);
  const [constraintOverrideReason, setConstraintOverrideReason] = useState('');

  // ── Wards query ──
  const wardsQuery = useQuery({
    queryKey: ['inpatient', 'wards', 'active'],
    queryFn: () => inpatientApi.listWards({ is_active: true, page_size: 100 }),
  });

  // ── Beds query (filtered to selected ward) ──
  const bedsQuery = useQuery({
    queryKey: ['inpatient', 'ward', selectedWardId, 'beds'],
    queryFn: () => inpatientApi.getWardBeds(selectedWardId!),
    enabled: selectedWardId != null,
  });

  const wards = wardsQuery.data?.results ?? [];
  const allBeds = bedsQuery.data?.results ?? [];
  const availableBeds = allBeds.filter((b) => b.status === 'AVAILABLE');

  const wardItems = wards.map((w) => ({
    label: `${w.name} (${w.available_beds} available)`,
    value: w.id,
  }));

  const bedItems = availableBeds.map((b) => ({
    label: `${b.bed_number}${b.bed_type ? ` — ${b.bed_type}` : ''}`,
    value: b.id,
  }));

  const selectedWard = wards.find((w) => w.id === selectedWardId);

  // Reset bed when ward changes
  const handleWardChange = (wardId: number) => {
    setSelectedWardId(wardId);
    setSelectedBedId(null);
    setAutoAssignBed(false);
  };

  // ── Mutation ──
  const admitMutation = useMutation({
    mutationFn: () => {
      const pid = parseInt(patientId, 10);
      if (isNaN(pid) || pid <= 0) {
        return Promise.reject(new Error('Enter a valid patient ID.'));
      }
      if (!selectedWardId) {
        return Promise.reject(new Error('Select a ward.'));
      }
      if (!autoAssignBed && !selectedBedId) {
        return Promise.reject(new Error('Select a bed or enable auto-assign.'));
      }

      return inpatientApi.createAdmission({
        patient: pid,
        opd_encounter: encounterIdStr ? parseInt(encounterIdStr, 10) || undefined : undefined,
        ward: selectedWardId,
        bed: autoAssignBed ? undefined : selectedBedId ?? undefined,
        auto_assign_bed: autoAssignBed,
        payer_type: payerType,
        insurance_details: insuranceDetails || undefined,
        constraint_override: constraintOverride,
        constraint_override_reason: constraintOverrideReason || undefined,
      });
    },
    onSuccess: (admission) => {
      queryClient.invalidateQueries({ queryKey: ['inpatient'] });
      Alert.alert('Admitted', `${admission.patient_name ?? 'Patient'} admitted to ${admission.ward_name ?? 'ward'}.`, [
        { text: 'View admission', onPress: () => router.replace(`/inpatient/admissions/${admission.id}` as never) },
      ]);
    },
    onError: (error: Error) => {
      Alert.alert('Admission failed', error.message || 'Could not admit patient. Please check the form and try again.');
    },
  });

  const canSubmit =
    patientId.trim() !== '' &&
    selectedWardId != null &&
    (autoAssignBed || selectedBedId != null) &&
    !admitMutation.isPending;

  return (
    <ScreenContainer>
      <SectionCard title="Admit patient" subtitle="Create a new inpatient admission with ward and bed assignment.">
        <Pill label="New admission" tone="primary" />
      </SectionCard>

      {/* Patient & encounter linking */}
      <SectionCard title="Patient" subtitle="Enter the patient ID and optionally link an OPD encounter.">
        <AppTextInput
          label="Patient ID"
          value={patientId}
          onChangeText={setPatientId}
          keyboardType="numeric"
          placeholder="e.g. 42"
        />
        <AppTextInput
          label="OPD encounter ID (optional)"
          value={encounterIdStr}
          onChangeText={setEncounterIdStr}
          keyboardType="numeric"
          placeholder="Link to an existing OPD encounter"
        />
      </SectionCard>

      {/* Ward selection */}
      <SectionCard title="Ward" subtitle="Select the destination ward for this admission.">
        {wardsQuery.isLoading && <LoadingState message="Loading wards..." />}
        {wards.length > 0 && (
          <AppPicker
            label="Ward"
            selectedValue={selectedWardId}
            items={wardItems}
            onValueChange={handleWardChange}
          />
        )}
        {selectedWard && (
          <View style={styles.wardInfo}>
            <Text style={styles.wardInfoText}>
              {selectedWard.ward_type_display ?? selectedWard.ward_type} · Capacity: {selectedWard.capacity}
            </Text>
            <View style={styles.wardMetrics}>
              <Pill label={`${selectedWard.available_beds} available`} tone="primary" />
              <Pill label={`${selectedWard.occupied_beds} occupied`} tone="neutral" />
              <Pill label={`${Math.round(selectedWard.occupancy_rate)}% full`} tone={selectedWard.occupancy_rate >= 90 ? 'danger' : 'neutral'} />
            </View>
          </View>
        )}
      </SectionCard>

      {/* Bed selection */}
      {selectedWardId != null && (
        <SectionCard title="Bed" subtitle="Choose a specific bed or auto-assign.">
          {bedsQuery.isLoading && <LoadingState message="Loading beds..." />}

          <AppButton
            label={autoAssignBed ? 'Auto-assign enabled ✓' : 'Auto-assign bed'}
            onPress={() => {
              setAutoAssignBed(!autoAssignBed);
              if (!autoAssignBed) setSelectedBedId(null);
            }}
            variant={autoAssignBed ? 'primary' : 'secondary'}
          />

          {!autoAssignBed && availableBeds.length > 0 && (
            <AppPicker
              label="Select bed"
              selectedValue={selectedBedId}
              items={bedItems}
              onValueChange={(v) => setSelectedBedId(v)}
            />
          )}

          {!autoAssignBed && !bedsQuery.isLoading && availableBeds.length === 0 && (
            <Text style={styles.warningText}>No available beds in this ward.</Text>
          )}
        </SectionCard>
      )}

      {/* Payer */}
      <SectionCard title="Payer" subtitle="Payment method for this admission.">
        <AppPicker
          label="Payer type"
          selectedValue={payerType}
          items={PAYER_TYPES}
          onValueChange={setPayerType}
        />
        {payerType === 'SHA' && (
          <AppTextInput
            label="Insurance details"
            value={insuranceDetails}
            onChangeText={setInsuranceDetails}
            placeholder="SHA member number or card details"
          />
        )}
        {payerType === 'CORPORATE' && (
          <AppTextInput
            label="Corporate details"
            value={insuranceDetails}
            onChangeText={setInsuranceDetails}
            placeholder="Company name or account reference"
          />
        )}
      </SectionCard>

      {/* Constraint override (age/gender restrictions) */}
      <SectionCard title="Constraint override" subtitle="Override ward restrictions if clinically necessary.">
        <AppButton
          label={constraintOverride ? 'Override enabled ✓' : 'Override ward constraints'}
          onPress={() => setConstraintOverride(!constraintOverride)}
          variant={constraintOverride ? 'danger' : 'ghost'}
        />
        {constraintOverride && (
          <AppTextInput
            label="Reason for override"
            value={constraintOverrideReason}
            onChangeText={setConstraintOverrideReason}
            placeholder="Clinical justification for overriding ward restrictions..."
            multiline
          />
        )}
      </SectionCard>

      {/* Submit */}
      <SectionCard>
        <AppButton
          label={admitMutation.isPending ? 'Admitting...' : 'Admit patient'}
          onPress={() => admitMutation.mutate()}
          disabled={!canSubmit}
        />
      </SectionCard>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wardInfo: {
      gap: theme.spacing.sm,
      paddingTop: theme.spacing.sm,
    },
    wardInfoText: {
      color: theme.colors.mutedText,
      fontSize: 13,
    },
    wardMetrics: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    warningText: {
      color: '#D97706',
      fontSize: 13,
      fontWeight: '600',
    },
  });
}
