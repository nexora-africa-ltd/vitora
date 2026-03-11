import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppPicker,
  AppTextInput,
  DataRow,
  LoadingState,
  Pill,
  ScreenContainer,
  SectionCard,
} from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { inpatientApi } from '@/lib/api/inpatient';
import { nursingApi } from '@/lib/api/nursing';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { AdmissionStatus, DischargeType, InpatientWard } from '@/lib/types/inpatient';

const TRANSFER_REASONS: { label: string; value: string }[] = [
  { label: 'Clinical need', value: 'CLINICAL' },
  { label: 'Bed management', value: 'BED_MANAGEMENT' },
  { label: 'Patient request', value: 'PATIENT_REQUEST' },
  { label: 'Step down', value: 'STEP_DOWN' },
  { label: 'Step up / escalation', value: 'STEP_UP' },
  { label: 'Other', value: 'OTHER' },
];

const STATUS_TONE: Record<AdmissionStatus, 'primary' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'primary',
  DISCHARGED: 'neutral',
  TRANSFERRED_OUT: 'warning',
  DECEASED: 'danger',
  ABSCONDED: 'danger',
};

const DISCHARGE_TYPES: { label: string; value: DischargeType }[] = [
  { label: 'Normal', value: 'NORMAL' },
  { label: 'Against advice', value: 'AGAINST_ADVICE' },
  { label: 'Transferred', value: 'TRANSFERRED' },
  { label: 'Deceased', value: 'DECEASED' },
  { label: 'Absconded', value: 'ABSCONDED' },
];

export default function AdmissionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  // ── Data queries ──
  const admissionQuery = useQuery({
    queryKey: ['inpatient', 'admission', id],
    queryFn: () => inpatientApi.getAdmission(Number(id)),
    enabled: !!id,
  });

  const roundsQuery = useQuery({
    queryKey: ['inpatient', 'ward-rounds', id],
    queryFn: () => nursingApi.listWardRounds({ admission: Number(id) }),
    enabled: !!id,
  });

  // ── Discharge form ──
  const [showDischarge, setShowDischarge] = useState(false);
  const [dischargeType, setDischargeType] = useState<DischargeType>('NORMAL');
  const [treatmentSummary, setTreatmentSummary] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');

  // ── Transfer form ──
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferWardId, setTransferWardId] = useState<number | null>(null);
  const [transferBedId, setTransferBedId] = useState<number | null>(null);
  const [transferReason, setTransferReason] = useState('CLINICAL');
  const [transferNotes, setTransferNotes] = useState('');

  const wardsQuery = useQuery({
    queryKey: ['inpatient', 'wards', 'active'],
    queryFn: () => inpatientApi.listWards({ is_active: true, page_size: 100 }),
    enabled: showTransfer,
  });

  const transferBedsQuery = useQuery({
    queryKey: ['inpatient', 'ward', transferWardId, 'beds'],
    queryFn: () => inpatientApi.getWardBeds(transferWardId!),
    enabled: transferWardId != null,
  });

  const transferableWards = (wardsQuery.data?.results ?? []).filter(
    (w: InpatientWard) => w.id !== admission?.ward
  );
  const transferableBeds = (transferBedsQuery.data?.results ?? []).filter(
    (b) => b.status === 'AVAILABLE'
  );

  const transferMutation = useMutation({
    mutationFn: () =>
      inpatientApi.createTransfer({
        admission: Number(id),
        destination_ward: transferWardId!,
        destination_bed: transferBedId ?? undefined,
        reason: transferReason,
        clinical_handover_notes: transferNotes || undefined,
      }),
    onSuccess: () => {
      Alert.alert('Transferred', 'Patient has been transferred successfully.');
      queryClient.invalidateQueries({ queryKey: ['inpatient'] });
      setShowTransfer(false);
      setTransferWardId(null);
      setTransferBedId(null);
      setTransferNotes('');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to transfer patient. Please try again.');
    },
  });

  const dischargeMutation = useMutation({
    mutationFn: () =>
      inpatientApi.createDischarge({
        admission: Number(id),
        discharge_type: dischargeType,
        discharge_date: new Date().toISOString().slice(0, 10),
        treatment_summary: treatmentSummary,
        follow_up_instructions: followUpInstructions || undefined,
        pharmacy_cleared: true,
        billing_cleared: true,
        lab_results_acknowledged: true,
      }),
    onSuccess: () => {
      Alert.alert('Discharged', 'Patient has been discharged successfully.');
      queryClient.invalidateQueries({ queryKey: ['inpatient'] });
      setShowDischarge(false);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to discharge patient. Please try again.');
    },
  });

  const admission = admissionQuery.data;
  const rounds = roundsQuery.data?.results ?? [];

  if (admissionQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading admission..." />
      </ScreenContainer>
    );
  }

  if (!admission) {
    return (
      <ScreenContainer>
        <SectionCard title="Not found">
          <Text style={{ color: theme.colors.mutedText }}>Admission not found.</Text>
        </SectionCard>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Patient summary */}
      <SectionCard title={admission.patient_name ?? `Patient #${admission.patient}`}>
        <View style={styles.headerRow}>
          <Pill
            label={admission.admission_status_display ?? admission.admission_status}
            tone={STATUS_TONE[admission.admission_status]}
          />
          <Text style={styles.admissionNumber}>{admission.admission_number}</Text>
        </View>
        <DataRow label="Ward" value={admission.ward_name} />
        <DataRow label="Bed" value={admission.bed_number} />
        <DataRow label="Admitted" value={admission.admission_date} />
        <DataRow label="Length of stay" value={admission.length_of_stay != null ? `${admission.length_of_stay} day(s)` : null} />
        <DataRow label="Admitting diagnosis" value={admission.admitting_diagnosis_text} />
        <DataRow label="Payer" value={admission.payer_type_display ?? admission.payer_type} />
        <DataRow label="Attending doctor" value={admission.attending_doctor_username} />
      </SectionCard>

      {/* Quick actions */}
      {admission.admission_status === 'ACTIVE' && (
        <SectionCard title="Actions">
          <View style={styles.actionStack}>
            <AppButton
              label="Nursing kardex"
              onPress={() => router.push(`/inpatient/nursing/kardex?admission=${admission.id}` as never)}
              variant="secondary"
            />
            <AppButton
              label="Add ward round"
              onPress={() => router.push(`/inpatient/nursing/rounds?admission=${admission.id}` as never)}
              variant="secondary"
            />
            <AppButton
              label="Vitals chart"
              onPress={() => router.push(`/inpatient/nursing/vitals?admission=${admission.id}` as never)}
              variant="secondary"
            />
            <AppButton
              label="Medication administration"
              onPress={() => router.push(`/inpatient/nursing/mar?admission=${admission.id}` as never)}
              variant="secondary"
            />
            <AppButton
              label={showTransfer ? 'Cancel transfer' : 'Transfer patient'}
              onPress={() => {
                setShowTransfer(!showTransfer);
                if (showDischarge) setShowDischarge(false);
              }}
              variant={showTransfer ? 'ghost' : 'secondary'}
            />
            <AppButton
              label={showDischarge ? 'Cancel discharge' : 'Discharge patient'}
              onPress={() => {
                setShowDischarge(!showDischarge);
                if (showTransfer) setShowTransfer(false);
              }}
              variant={showDischarge ? 'ghost' : 'danger'}
            />
          </View>
        </SectionCard>
      )}

      {/* Transfer form */}
      {showTransfer && (
        <SectionCard title="Transfer" subtitle="Move patient to another ward.">
          <AppPicker
            label="Destination ward"
            selectedValue={transferWardId}
            items={transferableWards.map((w: InpatientWard) => ({
              label: `${w.name} (${w.available_beds} available)`,
              value: w.id,
            }))}
            onValueChange={(v: number) => {
              setTransferWardId(v);
              setTransferBedId(null);
            }}
          />
          {transferWardId != null && transferableBeds.length > 0 && (
            <AppPicker
              label="Destination bed (optional)"
              selectedValue={transferBedId}
              items={transferableBeds.map((b) => ({
                label: `${b.bed_number}${b.bed_type ? ` — ${b.bed_type}` : ''}`,
                value: b.id,
              }))}
              onValueChange={setTransferBedId}
            />
          )}
          <AppPicker
            label="Reason"
            selectedValue={transferReason}
            items={TRANSFER_REASONS}
            onValueChange={setTransferReason}
          />
          <AppTextInput
            label="Clinical handover notes"
            value={transferNotes}
            onChangeText={setTransferNotes}
            placeholder="Key clinical information for the receiving ward..."
            multiline
          />
          <AppButton
            label={transferMutation.isPending ? 'Transferring...' : 'Confirm transfer'}
            onPress={() => transferMutation.mutate()}
            disabled={transferMutation.isPending || !transferWardId}
          />
        </SectionCard>
      )}

      {/* Discharge form */}
      {showDischarge && (
        <SectionCard title="Discharge" subtitle="Complete the discharge summary.">
          <AppPicker
            label="Discharge type"
            selectedValue={dischargeType}
            items={DISCHARGE_TYPES}
            onValueChange={setDischargeType}
          />
          <AppTextInput
            label="Treatment summary"
            value={treatmentSummary}
            onChangeText={setTreatmentSummary}
            placeholder="Summarize the treatment provided..."
            multiline
          />
          <AppTextInput
            label="Follow-up instructions"
            value={followUpInstructions}
            onChangeText={setFollowUpInstructions}
            placeholder="Post-discharge care instructions..."
            multiline
          />
          <AppButton
            label={dischargeMutation.isPending ? 'Discharging...' : 'Confirm discharge'}
            onPress={() => dischargeMutation.mutate()}
            disabled={dischargeMutation.isPending || !treatmentSummary.trim()}
            variant="danger"
          />
        </SectionCard>
      )}

      {/* Recent ward rounds */}
      <SectionCard title="Ward rounds" subtitle={`${rounds.length} round(s) recorded`}>
        {rounds.length === 0 && (
          <Text style={styles.emptyText}>No ward rounds recorded yet.</Text>
        )}
        {rounds.map((round) => (
          <View key={round.id} style={styles.roundCard}>
            <View style={styles.roundHeader}>
              <Text style={styles.roundDate}>{round.round_date}</Text>
              {round.conducted_by_username && (
                <Text style={styles.roundDoctor}>Dr. {round.conducted_by_username}</Text>
              )}
            </View>
            {round.subjective && <DataRow label="Subjective" value={round.subjective} />}
            {round.objective && <DataRow label="Objective" value={round.objective} />}
            {round.assessment && <DataRow label="Assessment" value={round.assessment} />}
            {round.plan && <DataRow label="Plan" value={round.plan} />}
          </View>
        ))}
      </SectionCard>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    headerRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    admissionNumber: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: '600',
    },
    actionStack: {
      gap: theme.spacing.sm,
    },
    emptyText: {
      color: theme.colors.mutedText,
      fontSize: 14,
    },
    roundCard: {
      borderBottomColor: theme.colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 6,
      paddingVertical: theme.spacing.md,
    },
    roundHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    roundDate: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    roundDoctor: {
      color: theme.colors.mutedText,
      fontSize: 12,
    },
  });
}
