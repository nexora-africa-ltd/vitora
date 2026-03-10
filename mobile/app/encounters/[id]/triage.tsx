import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppPicker, AppTextInput, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import { appTheme } from '@/constants/theme';
import { encountersApi } from '@/lib/api/encounters';
import { triageApi } from '@/lib/api/triage';
import { queryClient } from '@/lib/query/client';
import type { TriageAssessmentCreateData, TriageAssignedArea, TriageLevel, TriageMentalStatus } from '@/lib/types/triage';
import { formatDateTime } from '@/lib/utils/format';

type TriageFormState = {
  chiefComplaint: string;
  chiefComplaintCategory: string;
  painScore: string;
  mentalStatus: TriageMentalStatus;
  mobility: string;
  arrivalMode: string;
  referringFacilityName: string;
  allergiesNoted: string;
  spo2: string;
  heartRate: string;
  systolicBp: string;
  diastolicBp: string;
  temperature: string;
  respiratoryRate: string;
  weight: string;
  height: string;
  triageCategory: TriageLevel | '';
  categoryOverrideReason: string;
  assignedArea: TriageAssignedArea;
  gcsEye: string;
  gcsVerbal: string;
  gcsMotor: string;
};

const complaintCategoryItems = [
  { label: 'Chest pain', value: 'CHEST_PAIN' },
  { label: 'Difficulty breathing', value: 'DIFFICULTY_BREATHING' },
  { label: 'Trauma/injury', value: 'TRAUMA' },
  { label: 'Fever', value: 'FEVER' },
  { label: 'Abdominal pain', value: 'ABDOMINAL_PAIN' },
  { label: 'Headache', value: 'HEADACHE' },
  { label: 'Altered consciousness', value: 'ALTERED_CONSCIOUSNESS' },
  { label: 'Bleeding', value: 'BLEEDING' },
  { label: 'Poisoning/overdose', value: 'POISONING' },
  { label: 'Obstetric emergency', value: 'OBSTETRIC' },
  { label: 'Pediatric emergency', value: 'PEDIATRIC' },
  { label: 'Other', value: 'OTHER' },
] as const;

const mentalStatusItems = [
  { label: 'Alert', value: 'A' },
  { label: 'Responds to voice', value: 'V' },
  { label: 'Responds to pain', value: 'P' },
  { label: 'Unresponsive', value: 'U' },
] as const;

const mobilityItems = [
  { label: 'Ambulatory', value: 'AMBULATORY' },
  { label: 'Wheelchair', value: 'WHEELCHAIR' },
  { label: 'Stretcher', value: 'STRETCHER' },
  { label: 'Immobile/carried', value: 'IMMOBILE' },
] as const;

const arrivalModeItems = [
  { label: 'Walk-in', value: 'WALK_IN' },
  { label: 'Ambulance', value: 'AMBULANCE' },
  { label: 'Police', value: 'POLICE' },
  { label: 'Referral', value: 'REFERRAL' },
  { label: 'Other', value: 'OTHER' },
] as const;

const triageCategoryItems = [
  { label: 'Auto-calculate', value: '' },
  { label: 'RED · Immediate', value: 'RED' },
  { label: 'ORANGE · <10 min', value: 'ORANGE' },
  { label: 'YELLOW · <60 min', value: 'YELLOW' },
  { label: 'GREEN · <240 min', value: 'GREEN' },
  { label: 'BLUE · Referral/non-urgent', value: 'BLUE' },
] as const;

const assignedAreaItems = [
  { label: 'Outpatient department', value: 'OPD' },
  { label: 'ER resuscitation', value: 'ER_RESUS' },
  { label: 'ER acute', value: 'ER_ACUTE' },
  { label: 'ER fast track', value: 'ER_FAST_TRACK' },
  { label: 'Observation', value: 'OBSERVATION' },
  { label: 'Trauma', value: 'TRAUMA' },
  { label: 'Pediatric ER', value: 'PEDIATRIC_ER' },
  { label: 'Maternity', value: 'MATERNITY' },
  { label: 'Specialty', value: 'SPECIALTY' },
] as const;

function toOptionalNumber(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function TriageAssessmentScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const encounterId = Number(params.id);
  const [form, setForm] = useState<TriageFormState>({
    chiefComplaint: '',
    chiefComplaintCategory: 'OTHER',
    painScore: '',
    mentalStatus: 'A',
    mobility: 'AMBULATORY',
    arrivalMode: 'WALK_IN',
    referringFacilityName: '',
    allergiesNoted: '',
    spo2: '',
    heartRate: '',
    systolicBp: '',
    diastolicBp: '',
    temperature: '',
    respiratoryRate: '',
    weight: '',
    height: '',
    triageCategory: '',
    categoryOverrideReason: '',
    assignedArea: 'OPD',
    gcsEye: '',
    gcsVerbal: '',
    gcsMotor: '',
  });

  const encounterQuery = useQuery({
    queryKey: ['encounter', encounterId],
    queryFn: () => encountersApi.get(encounterId),
    enabled: Number.isFinite(encounterId),
  });

  const triageQuery = useQuery({
    queryKey: ['encounter-triage', encounterId],
    queryFn: () => triageApi.getByEncounter(encounterId),
    enabled: Number.isFinite(encounterId),
  });

  useEffect(() => {
    if (!encounterQuery.data || triageQuery.data) {
      return;
    }

    setForm((current) => ({
      ...current,
      chiefComplaint: encounterQuery.data.chief_complaint,
      allergiesNoted: encounterQuery.data.allergies ?? '',
      spo2: encounterQuery.data.spo2 != null ? String(encounterQuery.data.spo2) : current.spo2,
      heartRate: encounterQuery.data.pulse != null ? String(encounterQuery.data.pulse) : current.heartRate,
      temperature: encounterQuery.data.temperature != null ? String(encounterQuery.data.temperature) : current.temperature,
      respiratoryRate: encounterQuery.data.respiratory_rate != null ? String(encounterQuery.data.respiratory_rate) : current.respiratoryRate,
      weight: encounterQuery.data.weight != null ? String(encounterQuery.data.weight) : current.weight,
      height: encounterQuery.data.height != null ? String(encounterQuery.data.height) : current.height,
    }));
  }, [encounterQuery.data, triageQuery.data]);

  const createTriageMutation = useMutation({
    mutationFn: async () => {
      const payload: TriageAssessmentCreateData = {
        encounter: encounterId,
        chief_complaint: form.chiefComplaint.trim(),
        chief_complaint_category: form.chiefComplaintCategory,
        pain_score: toOptionalNumber(form.painScore),
        mental_status: form.mentalStatus,
        gcs_eye: toOptionalNumber(form.gcsEye),
        gcs_verbal: toOptionalNumber(form.gcsVerbal),
        gcs_motor: toOptionalNumber(form.gcsMotor),
        mobility: form.mobility,
        arrival_mode: form.arrivalMode,
        referring_facility_name: form.referringFacilityName.trim(),
        allergies_noted: form.allergiesNoted.trim(),
        spo2: toOptionalNumber(form.spo2),
        heart_rate: toOptionalNumber(form.heartRate),
        systolic_bp: toOptionalNumber(form.systolicBp),
        diastolic_bp: toOptionalNumber(form.diastolicBp),
        temperature: toOptionalNumber(form.temperature),
        respiratory_rate: toOptionalNumber(form.respiratoryRate),
        weight: toOptionalNumber(form.weight),
        height: toOptionalNumber(form.height),
        triage_category: form.triageCategory || null,
        category_override_reason: form.categoryOverrideReason.trim(),
        assigned_area: form.assignedArea,
        arrival_time: new Date().toISOString(),
      };

      return triageApi.create(payload);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['encounter-triage', encounterId] }),
        queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] }),
        queryClient.invalidateQueries({ queryKey: ['encounters'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      ]);
      router.replace(`/encounters/${encounterId}` as never);
    },
  });

  const completeTriageMutation = useMutation({
    mutationFn: (triageId: number) => triageApi.complete(triageId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['encounter-triage', encounterId] }),
        queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] }),
        queryClient.invalidateQueries({ queryKey: ['encounters'] }),
      ]);
    },
  });

  function validateForm(): string | null {
    if (!form.chiefComplaint.trim()) {
      return 'Chief complaint is required.';
    }
    if (!form.chiefComplaintCategory) {
      return 'Chief complaint category is required.';
    }
    if (form.arrivalMode === 'REFERRAL' && !form.referringFacilityName.trim()) {
      return 'Referring facility name is required for referral arrivals.';
    }

    const limits: [string, number, number, string][] = [
      [form.spo2, 0, 100, 'SpO2'],
      [form.heartRate, 0, 300, 'Heart rate'],
      [form.systolicBp, 0, 300, 'Systolic BP'],
      [form.diastolicBp, 0, 200, 'Diastolic BP'],
      [form.temperature, 30, 45, 'Temperature'],
      [form.respiratoryRate, 0, 60, 'Respiratory rate'],
      [form.gcsEye, 1, 4, 'GCS eye response'],
      [form.gcsVerbal, 1, 5, 'GCS verbal response'],
      [form.gcsMotor, 1, 6, 'GCS motor response'],
    ];

    for (const [value, min, max, label] of limits) {
      if (!value.trim()) {
        continue;
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        return `${label} must be between ${min} and ${max}.`;
      }
    }

    return null;
  }

  async function handleSaveTriage() {
    const validationError = validateForm();
    if (validationError) {
      Alert.alert('Invalid triage data', validationError);
      return;
    }

    try {
      await createTriageMutation.mutateAsync();
    } catch (error) {
      Alert.alert('Unable to save triage', error instanceof Error ? error.message : 'Triage save failed.');
    }
  }

  if (encounterQuery.isLoading || triageQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading triage workflow..." />
      </ScreenContainer>
    );
  }

  if (!encounterQuery.data) {
    return (
      <ScreenContainer>
        <LoadingState message="Encounter not found for triage." />
      </ScreenContainer>
    );
  }

  const existingTriage = triageQuery.data;

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Triage"
        title={encounterQuery.data.patient_name || encounterQuery.data.patient_mrn || `Encounter #${encounterId}`}
        description="Capture KETA acuity, initial vitals, and routing from the encounter detail flow."
      >
        <Pill label={existingTriage ? existingTriage.triage_category : 'Pending triage'} tone={existingTriage ? 'danger' : 'warning'} />
      </HeroCard>

      {existingTriage ? (
        <SectionCard title="Existing triage assessment" subtitle="This encounter already has a triage record.">
          <Text style={styles.title}>{existingTriage.chief_complaint}</Text>
          <Text style={styles.helperText}>Category {existingTriage.triage_category} · Wait {existingTriage.wait_time_minutes ?? 0} min · Started {formatDateTime(existingTriage.triage_start_time)}</Text>
          {existingTriage.alerts.map((alert) => (
            <Text key={alert.id} style={styles.alertText}>{alert.message}</Text>
          ))}
          {!existingTriage.triage_end_time ? (
            <AppButton
              label={completeTriageMutation.isPending ? 'Completing triage...' : 'Complete triage'}
              onPress={async () => {
                try {
                  await completeTriageMutation.mutateAsync(existingTriage.id);
                } catch (error) {
                  Alert.alert('Unable to complete triage', error instanceof Error ? error.message : 'Completion failed.');
                }
              }}
              disabled={completeTriageMutation.isPending}
            />
          ) : (
            <Text style={styles.helperText}>Completed {formatDateTime(existingTriage.triage_end_time)}</Text>
          )}
          <AppButton label="Back to encounter" variant="secondary" onPress={() => router.replace(`/encounters/${encounterId}` as never)} />
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Assessment" subtitle="Capture KETA triage details before consultation starts.">
            <AppTextInput label="Chief complaint" value={form.chiefComplaint} onChangeText={(value) => setForm((current) => ({ ...current, chiefComplaint: value }))} multiline />
            <AppPicker label="Complaint category" selectedValue={form.chiefComplaintCategory} onValueChange={(value) => setForm((current) => ({ ...current, chiefComplaintCategory: value }))} items={complaintCategoryItems as unknown as { label: string; value: string }[]} />
            <AppPicker label="Mental status (AVPU)" selectedValue={form.mentalStatus} onValueChange={(value) => setForm((current) => ({ ...current, mentalStatus: value as TriageMentalStatus }))} items={mentalStatusItems as unknown as { label: string; value: string }[]} />
            <AppPicker label="Mobility" selectedValue={form.mobility} onValueChange={(value) => setForm((current) => ({ ...current, mobility: value }))} items={mobilityItems as unknown as { label: string; value: string }[]} />
            <AppPicker label="Arrival mode" selectedValue={form.arrivalMode} onValueChange={(value) => setForm((current) => ({ ...current, arrivalMode: value }))} items={arrivalModeItems as unknown as { label: string; value: string }[]} />
            {form.arrivalMode === 'REFERRAL' ? <AppTextInput label="Referring facility" value={form.referringFacilityName} onChangeText={(value) => setForm((current) => ({ ...current, referringFacilityName: value }))} /> : null}
            <AppTextInput label="Pain score (0-10)" value={form.painScore} onChangeText={(value) => setForm((current) => ({ ...current, painScore: value }))} keyboardType="numeric" autoCapitalize="none" />
            <AppTextInput label="Allergies noted" value={form.allergiesNoted} onChangeText={(value) => setForm((current) => ({ ...current, allergiesNoted: value }))} multiline />
          </SectionCard>

          <SectionCard title="Vitals and routing" subtitle="These ranges match the backend triage serializer validations.">
            <View style={styles.inlineRow}>
              <View style={styles.inlineField}>
                <AppTextInput label="SpO2" value={form.spo2} onChangeText={(value) => setForm((current) => ({ ...current, spo2: value }))} keyboardType="numeric" autoCapitalize="none" />
              </View>
              <View style={styles.inlineField}>
                <AppTextInput label="Heart rate" value={form.heartRate} onChangeText={(value) => setForm((current) => ({ ...current, heartRate: value }))} keyboardType="numeric" autoCapitalize="none" />
              </View>
            </View>
            <View style={styles.inlineRow}>
              <View style={styles.inlineField}>
                <AppTextInput label="Systolic BP" value={form.systolicBp} onChangeText={(value) => setForm((current) => ({ ...current, systolicBp: value }))} keyboardType="numeric" autoCapitalize="none" />
              </View>
              <View style={styles.inlineField}>
                <AppTextInput label="Diastolic BP" value={form.diastolicBp} onChangeText={(value) => setForm((current) => ({ ...current, diastolicBp: value }))} keyboardType="numeric" autoCapitalize="none" />
              </View>
            </View>
            <View style={styles.inlineRow}>
              <View style={styles.inlineField}>
                <AppTextInput label="Temperature" value={form.temperature} onChangeText={(value) => setForm((current) => ({ ...current, temperature: value }))} keyboardType="numeric" autoCapitalize="none" />
              </View>
              <View style={styles.inlineField}>
                <AppTextInput label="Respiratory rate" value={form.respiratoryRate} onChangeText={(value) => setForm((current) => ({ ...current, respiratoryRate: value }))} keyboardType="numeric" autoCapitalize="none" />
              </View>
            </View>
            <View style={styles.inlineRow}>
              <View style={styles.inlineField}>
                <AppTextInput label="Weight" value={form.weight} onChangeText={(value) => setForm((current) => ({ ...current, weight: value }))} keyboardType="numeric" autoCapitalize="none" />
              </View>
              <View style={styles.inlineField}>
                <AppTextInput label="Height" value={form.height} onChangeText={(value) => setForm((current) => ({ ...current, height: value }))} keyboardType="numeric" autoCapitalize="none" />
              </View>
            </View>
            <View style={styles.inlineRow}>
              <View style={styles.inlineField}>
                <AppTextInput label="GCS eye" value={form.gcsEye} onChangeText={(value) => setForm((current) => ({ ...current, gcsEye: value }))} keyboardType="numeric" autoCapitalize="none" />
              </View>
              <View style={styles.inlineField}>
                <AppTextInput label="GCS verbal" value={form.gcsVerbal} onChangeText={(value) => setForm((current) => ({ ...current, gcsVerbal: value }))} keyboardType="numeric" autoCapitalize="none" />
              </View>
            </View>
            <AppTextInput label="GCS motor" value={form.gcsMotor} onChangeText={(value) => setForm((current) => ({ ...current, gcsMotor: value }))} keyboardType="numeric" autoCapitalize="none" />
            <AppPicker label="Suggested/final triage category" selectedValue={form.triageCategory} onValueChange={(value) => setForm((current) => ({ ...current, triageCategory: value as TriageLevel | '' }))} items={triageCategoryItems as unknown as { label: string; value: string }[]} />
            {form.triageCategory ? <AppTextInput label="Override reason (required if category differs from auto-calc)" value={form.categoryOverrideReason} onChangeText={(value) => setForm((current) => ({ ...current, categoryOverrideReason: value }))} multiline /> : null}
            <AppPicker label="Assigned area" selectedValue={form.assignedArea} onValueChange={(value) => setForm((current) => ({ ...current, assignedArea: value as TriageAssignedArea }))} items={assignedAreaItems as unknown as { label: string; value: string }[]} />
            <AppButton label={createTriageMutation.isPending ? 'Saving triage...' : 'Save triage assessment'} onPress={handleSaveTriage} disabled={createTriageMutation.isPending} />
            <AppButton label="Back to encounter" variant="secondary" onPress={() => router.replace(`/encounters/${encounterId}` as never)} />
          </SectionCard>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  inlineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineField: {
    flex: 1,
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  helperText: {
    color: appTheme.colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  alertText: {
    color: appTheme.colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
});