import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { AppButton, AppPicker, AppTextInput, HeroCard, LoadingState, ScreenContainer, SectionCard } from '@/components/app-ui';
import { encountersApi } from '@/lib/api/encounters';
import { patientsApi } from '@/lib/api/patients';
import { buildBloodPressure, ENCOUNTER_TYPE_OPTIONS } from '@/lib/encounters';
import { queryClient } from '@/lib/query/client';
import { buildPatientName, formatDate } from '@/lib/utils/format';

type FormState = {
  patient: number;
  encounterType: (typeof ENCOUNTER_TYPE_OPTIONS)[number]['value'];
  encounterDate: string;
  chiefComplaint: string;
  temperature: string;
  pulse: string;
  bloodPressureSystolic: string;
  bloodPressureDiastolic: string;
  respiratoryRate: string;
  spo2: string;
  weight: string;
  height: string;
  allergies: string;
  chronicConditions: string;
  currentMedications: string;
  pastSurgeries: string;
  familyHistory: string;
  socialHistory: string;
  historyOfPresentIllness: string;
  physicalExamination: string;
  assessment: string;
  notes: string;
};

function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function NewEncounterScreen() {
  const params = useLocalSearchParams<{ patientId?: string }>();
  const preselectedPatientId = params.patientId ? Number(params.patientId) : 0;
  const today = new Date().toISOString().split('T')[0] ?? '';

  const [form, setForm] = useState<FormState>({
    patient: Number.isFinite(preselectedPatientId) ? preselectedPatientId : 0,
    encounterType: 'OPD',
    encounterDate: today,
    chiefComplaint: '',
    temperature: '',
    pulse: '',
    bloodPressureSystolic: '',
    bloodPressureDiastolic: '',
    respiratoryRate: '',
    spo2: '',
    weight: '',
    height: '',
    allergies: '',
    chronicConditions: '',
    currentMedications: '',
    pastSurgeries: '',
    familyHistory: '',
    socialHistory: '',
    historyOfPresentIllness: '',
    physicalExamination: '',
    assessment: '',
    notes: '',
  });

  const patientsQuery = useQuery({
    queryKey: ['encounter-form-patients'],
    queryFn: () => patientsApi.list({ page: 1, page_size: 100, ordering: '-created_at' }),
  });

  const preselectedPatientQuery = useQuery({
    queryKey: ['encounter-form-patient', preselectedPatientId],
    queryFn: () => patientsApi.get(preselectedPatientId),
    enabled: Boolean(preselectedPatientId),
  });

  const patientOptions = useMemo(() => {
    const entries = new Map<number, { label: string; value: number }>();
    entries.set(0, { label: 'Select patient', value: 0 });

    if (preselectedPatientQuery.data) {
      entries.set(preselectedPatientQuery.data.id, {
        label: `${buildPatientName(preselectedPatientQuery.data)} · ${preselectedPatientQuery.data.mrn}`,
        value: preselectedPatientQuery.data.id,
      });
    }

    for (const patient of patientsQuery.data?.results ?? []) {
      entries.set(patient.id, {
        label: `${buildPatientName(patient)} · ${patient.mrn}`,
        value: patient.id,
      });
    }

    return Array.from(entries.values());
  }, [patientsQuery.data?.results, preselectedPatientQuery.data]);

  const createEncounterMutation = useMutation({
    mutationFn: () =>
      encountersApi.create({
        patient: form.patient,
        encounter_type: form.encounterType,
        encounter_date: form.encounterDate,
        chief_complaint: form.chiefComplaint.trim(),
        temperature: toOptionalNumber(form.temperature),
        pulse: toOptionalNumber(form.pulse),
        blood_pressure: buildBloodPressure(form.bloodPressureSystolic, form.bloodPressureDiastolic),
        respiratory_rate: toOptionalNumber(form.respiratoryRate),
        spo2: toOptionalNumber(form.spo2),
        weight: toOptionalNumber(form.weight),
        height: toOptionalNumber(form.height),
        allergies: form.allergies.trim() || undefined,
        chronic_conditions: form.chronicConditions.trim() || undefined,
        current_medications: form.currentMedications.trim() || undefined,
        past_surgeries: form.pastSurgeries.trim() || undefined,
        family_history: form.familyHistory.trim() || undefined,
        social_history: form.socialHistory.trim() || undefined,
        history_of_present_illness: form.historyOfPresentIllness.trim() || undefined,
        physical_examination: form.physicalExamination.trim() || undefined,
        assessment: form.assessment.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: async (encounter) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['encounters'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['patient-encounters', encounter.patient] }),
      ]);
      router.replace(`/encounters/${encounter.id}` as never);
    },
  });

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleCreateEncounter() {
    if (!form.patient) {
      Alert.alert('Patient required', 'Select the patient for this encounter.');
      return;
    }

    if (!form.chiefComplaint.trim()) {
      Alert.alert('Chief complaint required', 'Enter the primary complaint for the encounter.');
      return;
    }

    if ((form.bloodPressureSystolic.trim() && !form.bloodPressureDiastolic.trim()) || (!form.bloodPressureSystolic.trim() && form.bloodPressureDiastolic.trim())) {
      Alert.alert('Incomplete blood pressure', 'Enter both systolic and diastolic values, or leave both blank.');
      return;
    }

    try {
      await createEncounterMutation.mutateAsync();
    } catch (error) {
      Alert.alert('Unable to create encounter', error instanceof Error ? error.message : 'The backend rejected the encounter payload.');
    }
  }

  if (patientsQuery.isLoading || preselectedPatientQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Preparing encounter form..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="New encounter"
        title="Capture bedside consultation"
        description={`This creates a real encounter through /api/encounters/ using the same core fields as the web workflow. Date: ${formatDate(form.encounterDate)}`}
      />

      <SectionCard title="Core details" subtitle="These fields match the first steps of the web encounter flow.">
        <AppPicker label="Patient" selectedValue={form.patient} onValueChange={(value) => updateField('patient', value)} items={patientOptions} />
        <AppPicker label="Encounter type" selectedValue={form.encounterType} onValueChange={(value) => updateField('encounterType', value)} items={ENCOUNTER_TYPE_OPTIONS} />
        <AppTextInput label="Encounter date" value={form.encounterDate} onChangeText={(value) => updateField('encounterDate', value)} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        <AppTextInput label="Chief complaint" value={form.chiefComplaint} onChangeText={(value) => updateField('chiefComplaint', value)} placeholder="Reason for visit" multiline />
      </SectionCard>

      <SectionCard title="Vitals">
        <AppTextInput label="Temperature (°C)" value={form.temperature} onChangeText={(value) => updateField('temperature', value)} keyboardType="numeric" autoCapitalize="none" />
        <AppTextInput label="Pulse (bpm)" value={form.pulse} onChangeText={(value) => updateField('pulse', value)} keyboardType="numeric" autoCapitalize="none" />
        <View style={styles.inlineRow}>
          <View style={styles.inlineField}>
            <AppTextInput label="BP systolic" value={form.bloodPressureSystolic} onChangeText={(value) => updateField('bloodPressureSystolic', value)} keyboardType="numeric" autoCapitalize="none" />
          </View>
          <View style={styles.inlineField}>
            <AppTextInput label="BP diastolic" value={form.bloodPressureDiastolic} onChangeText={(value) => updateField('bloodPressureDiastolic', value)} keyboardType="numeric" autoCapitalize="none" />
          </View>
        </View>
        <AppTextInput label="Respiratory rate (/min)" value={form.respiratoryRate} onChangeText={(value) => updateField('respiratoryRate', value)} keyboardType="numeric" autoCapitalize="none" />
        <AppTextInput label="SpO2 (%)" value={form.spo2} onChangeText={(value) => updateField('spo2', value)} keyboardType="numeric" autoCapitalize="none" />
        <View style={styles.inlineRow}>
          <View style={styles.inlineField}>
            <AppTextInput label="Weight (kg)" value={form.weight} onChangeText={(value) => updateField('weight', value)} keyboardType="numeric" autoCapitalize="none" />
          </View>
          <View style={styles.inlineField}>
            <AppTextInput label="Height (cm)" value={form.height} onChangeText={(value) => updateField('height', value)} keyboardType="numeric" autoCapitalize="none" />
          </View>
        </View>
      </SectionCard>

      <SectionCard title="History and notes">
        <AppTextInput label="Allergies" value={form.allergies} onChangeText={(value) => updateField('allergies', value)} multiline />
        <AppTextInput label="Chronic conditions" value={form.chronicConditions} onChangeText={(value) => updateField('chronicConditions', value)} multiline />
        <AppTextInput label="Current medications" value={form.currentMedications} onChangeText={(value) => updateField('currentMedications', value)} multiline />
        <AppTextInput label="Past surgeries" value={form.pastSurgeries} onChangeText={(value) => updateField('pastSurgeries', value)} multiline />
        <AppTextInput label="Family history" value={form.familyHistory} onChangeText={(value) => updateField('familyHistory', value)} multiline />
        <AppTextInput label="Social history" value={form.socialHistory} onChangeText={(value) => updateField('socialHistory', value)} multiline />
        <AppTextInput label="History of present illness" value={form.historyOfPresentIllness} onChangeText={(value) => updateField('historyOfPresentIllness', value)} multiline />
        <AppTextInput label="Physical examination" value={form.physicalExamination} onChangeText={(value) => updateField('physicalExamination', value)} multiline />
        <AppTextInput label="Assessment" value={form.assessment} onChangeText={(value) => updateField('assessment', value)} multiline />
        <AppTextInput label="Additional notes" value={form.notes} onChangeText={(value) => updateField('notes', value)} multiline />
      </SectionCard>

      <View style={styles.actions}>
        <AppButton label={createEncounterMutation.isPending ? 'Creating encounter...' : 'Create encounter'} onPress={handleCreateEncounter} disabled={createEncounterMutation.isPending} />
      </View>
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
  actions: {
    paddingBottom: 28,
  },
});