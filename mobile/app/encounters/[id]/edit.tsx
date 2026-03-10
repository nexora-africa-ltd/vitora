import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppPicker, AppTextInput, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import { appTheme } from '@/constants/theme';
import { encountersApi } from '@/lib/api/encounters';
import { buildBloodPressure, ENCOUNTER_TYPE_OPTIONS, getEncounterPillTone, getEncounterStatusLabel, splitBloodPressure } from '@/lib/encounters';
import { queryClient } from '@/lib/query/client';
import type { DiagnosisInput, TreatmentPlanInput } from '@/lib/types/encounter';
import { formatDate } from '@/lib/utils/format';

type EncounterFormState = {
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

type DiagnosisFormState = {
  id: number | null;
  diagnosisType: DiagnosisInput['diagnosis_type'];
  certainty: NonNullable<DiagnosisInput['certainty']>;
  freeTextDiagnosis: string;
  notes: string;
  isConfirmed: boolean;
};

type TreatmentPlanFormState = {
  clinicalNotes: string;
  followUpInstructions: string;
  followUpDate: string;
  dietRecommendations: string;
  activityRestrictions: string;
  referralNeeded: boolean;
  referralSpecialty: string;
  referralNotes: string;
  status: NonNullable<TreatmentPlanInput['status']>;
};

function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const emptyDiagnosisForm: DiagnosisFormState = {
  id: null,
  diagnosisType: 'PRIMARY',
  certainty: 'suspected',
  freeTextDiagnosis: '',
  notes: '',
  isConfirmed: false,
};

const emptyTreatmentPlanForm: TreatmentPlanFormState = {
  clinicalNotes: '',
  followUpInstructions: '',
  followUpDate: '',
  dietRecommendations: '',
  activityRestrictions: '',
  referralNeeded: false,
  referralSpecialty: '',
  referralNotes: '',
  status: 'DRAFT',
};

export default function EditEncounterScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const encounterId = Number(params.id);
  const [encounterForm, setEncounterForm] = useState<EncounterFormState | null>(null);
  const [diagnosisForm, setDiagnosisForm] = useState<DiagnosisFormState>(emptyDiagnosisForm);
  const [treatmentPlanForm, setTreatmentPlanForm] = useState<TreatmentPlanFormState>(emptyTreatmentPlanForm);

  const encounterQuery = useQuery({
    queryKey: ['encounter', encounterId],
    queryFn: () => encountersApi.get(encounterId),
    enabled: Number.isFinite(encounterId),
  });

  const diagnosesQuery = useQuery({
    queryKey: ['encounter-diagnoses', encounterId],
    queryFn: () => encountersApi.getDiagnoses(encounterId),
    enabled: Number.isFinite(encounterId),
  });

  const treatmentPlanQuery = useQuery({
    queryKey: ['encounter-treatment-plan', encounterId],
    queryFn: () => encountersApi.getTreatmentPlan(encounterId),
    enabled: Number.isFinite(encounterId),
  });

  useEffect(() => {
    if (!encounterQuery.data) {
      return;
    }

    const bp = splitBloodPressure(encounterQuery.data.blood_pressure);
    setEncounterForm({
      encounterType: encounterQuery.data.encounter_type,
      encounterDate: encounterQuery.data.encounter_date,
      chiefComplaint: encounterQuery.data.chief_complaint,
      temperature: encounterQuery.data.temperature != null ? String(encounterQuery.data.temperature) : '',
      pulse: encounterQuery.data.pulse != null ? String(encounterQuery.data.pulse) : '',
      bloodPressureSystolic: bp.systolic,
      bloodPressureDiastolic: bp.diastolic,
      respiratoryRate: encounterQuery.data.respiratory_rate != null ? String(encounterQuery.data.respiratory_rate) : '',
      spo2: encounterQuery.data.spo2 != null ? String(encounterQuery.data.spo2) : '',
      weight: encounterQuery.data.weight != null ? String(encounterQuery.data.weight) : '',
      height: encounterQuery.data.height != null ? String(encounterQuery.data.height) : '',
      allergies: encounterQuery.data.allergies ?? '',
      chronicConditions: encounterQuery.data.chronic_conditions ?? '',
      currentMedications: encounterQuery.data.current_medications ?? '',
      pastSurgeries: encounterQuery.data.past_surgeries ?? '',
      familyHistory: encounterQuery.data.family_history ?? '',
      socialHistory: encounterQuery.data.social_history ?? '',
      historyOfPresentIllness: encounterQuery.data.history_of_present_illness ?? '',
      physicalExamination: encounterQuery.data.physical_examination ?? '',
      assessment: encounterQuery.data.assessment ?? '',
      notes: encounterQuery.data.notes ?? '',
    });
  }, [encounterQuery.data]);

  useEffect(() => {
    if (!treatmentPlanQuery.data) {
      return;
    }

    setTreatmentPlanForm({
      clinicalNotes: treatmentPlanQuery.data.clinical_notes ?? '',
      followUpInstructions: treatmentPlanQuery.data.follow_up_instructions ?? '',
      followUpDate: treatmentPlanQuery.data.follow_up_date ?? '',
      dietRecommendations: treatmentPlanQuery.data.diet_recommendations ?? '',
      activityRestrictions: treatmentPlanQuery.data.activity_restrictions ?? '',
      referralNeeded: treatmentPlanQuery.data.referral_needed,
      referralSpecialty: treatmentPlanQuery.data.referral_specialty ?? '',
      referralNotes: treatmentPlanQuery.data.referral_notes ?? '',
      status: treatmentPlanQuery.data.status,
    });
  }, [treatmentPlanQuery.data]);

  const saveEncounterMutation = useMutation({
    mutationFn: async () => {
      if (!encounterForm) {
        throw new Error('Encounter form is not ready.');
      }

      return encountersApi.update(encounterId, {
        encounter_type: encounterForm.encounterType,
        encounter_date: encounterForm.encounterDate,
        chief_complaint: encounterForm.chiefComplaint.trim(),
        temperature: toOptionalNumber(encounterForm.temperature),
        pulse: toOptionalNumber(encounterForm.pulse),
        blood_pressure: buildBloodPressure(encounterForm.bloodPressureSystolic, encounterForm.bloodPressureDiastolic),
        respiratory_rate: toOptionalNumber(encounterForm.respiratoryRate),
        spo2: toOptionalNumber(encounterForm.spo2),
        weight: toOptionalNumber(encounterForm.weight),
        height: toOptionalNumber(encounterForm.height),
        allergies: encounterForm.allergies.trim() || undefined,
        chronic_conditions: encounterForm.chronicConditions.trim() || undefined,
        current_medications: encounterForm.currentMedications.trim() || undefined,
        past_surgeries: encounterForm.pastSurgeries.trim() || undefined,
        family_history: encounterForm.familyHistory.trim() || undefined,
        social_history: encounterForm.socialHistory.trim() || undefined,
        history_of_present_illness: encounterForm.historyOfPresentIllness.trim() || undefined,
        physical_examination: encounterForm.physicalExamination.trim() || undefined,
        assessment: encounterForm.assessment.trim() || undefined,
        notes: encounterForm.notes.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] }),
        queryClient.invalidateQueries({ queryKey: ['encounters'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      ]);
      Alert.alert('Encounter updated', 'Encounter notes and vitals have been saved.');
    },
  });

  const saveDiagnosisMutation = useMutation({
    mutationFn: async () => {
      const payload: DiagnosisInput = {
        diagnosis_type: diagnosisForm.diagnosisType,
        certainty: diagnosisForm.certainty,
        free_text_diagnosis: diagnosisForm.freeTextDiagnosis.trim(),
        notes: diagnosisForm.notes.trim(),
        is_confirmed: diagnosisForm.isConfirmed,
      };

      if (!payload.free_text_diagnosis) {
        throw new Error('A diagnosis description is required.');
      }

      if (diagnosisForm.id) {
        return encountersApi.updateDiagnosis(encounterId, diagnosisForm.id, payload);
      }

      return encountersApi.createDiagnosis(encounterId, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['encounter-diagnoses', encounterId] });
      setDiagnosisForm(emptyDiagnosisForm);
    },
  });

  const deleteDiagnosisMutation = useMutation({
    mutationFn: (diagnosisId: number) => encountersApi.deleteDiagnosis(encounterId, diagnosisId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['encounter-diagnoses', encounterId] });
    },
  });

  const saveTreatmentPlanMutation = useMutation({
    mutationFn: async () => {
      const payload: TreatmentPlanInput = {
        clinical_notes: treatmentPlanForm.clinicalNotes.trim(),
        follow_up_instructions: treatmentPlanForm.followUpInstructions.trim(),
        follow_up_date: treatmentPlanForm.followUpDate.trim() || null,
        diet_recommendations: treatmentPlanForm.dietRecommendations.trim(),
        activity_restrictions: treatmentPlanForm.activityRestrictions.trim(),
        referral_needed: treatmentPlanForm.referralNeeded,
        referral_specialty: treatmentPlanForm.referralSpecialty.trim(),
        referral_notes: treatmentPlanForm.referralNotes.trim(),
        status: treatmentPlanForm.status,
        medications_json: [],
        procedures_json: [],
      };

      if (treatmentPlanQuery.data) {
        return encountersApi.updateTreatmentPlan(encounterId, payload);
      }

      return encountersApi.createTreatmentPlan(encounterId, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['encounter-treatment-plan', encounterId] });
      Alert.alert('Treatment plan saved', 'Treatment plan changes have been recorded.');
    },
  });

  const diagnosisTypeItems = useMemo<{ label: string; value: DiagnosisFormState['diagnosisType'] }[]>(
    () => [
      { label: 'Primary', value: 'PRIMARY' as const },
      { label: 'Secondary', value: 'SECONDARY' as const },
      { label: 'Differential', value: 'DIFFERENTIAL' as const },
      { label: 'Working', value: 'WORKING' as const },
    ],
    []
  );

  const diagnosisCertaintyItems = useMemo<{ label: string; value: DiagnosisFormState['certainty'] }[]>(
    () => [
      { label: 'Suspected', value: 'suspected' as const },
      { label: 'Probable', value: 'probable' as const },
      { label: 'Confirmed', value: 'confirmed' as const },
      { label: 'Provisional', value: 'provisional' as const },
      { label: 'Ruled out', value: 'ruled_out' as const },
    ],
    []
  );

  const booleanItems = useMemo(
    () => [
      { label: 'No', value: 'false' },
      { label: 'Yes', value: 'true' },
    ],
    []
  );

  const treatmentPlanStatusItems = useMemo<{ label: string; value: TreatmentPlanFormState['status'] }[]>(
    () => [
      { label: 'Draft', value: 'DRAFT' as const },
      { label: 'Active', value: 'ACTIVE' as const },
      { label: 'Completed', value: 'COMPLETED' as const },
      { label: 'Discontinued', value: 'DISCONTINUED' as const },
    ],
    []
  );

  if (encounterQuery.isLoading || !encounterForm) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading encounter editor..." />
      </ScreenContainer>
    );
  }

  const encounter = encounterQuery.data;
  if (!encounter) {
    return (
      <ScreenContainer>
        <LoadingState message="Encounter not available." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Edit encounter"
        title={encounter.patient_name || encounter.patient_mrn || `Encounter #${encounter.id}`}
        description={`${encounter.encounter_type_display || encounter.encounter_type} · ${formatDate(encounter.encounter_date)}`}
      >
        <Pill label={getEncounterStatusLabel(encounter.status)} tone={getEncounterPillTone(encounter)} />
      </HeroCard>

      <SectionCard title="Encounter documentation" subtitle="Continue the visit by updating vitals, history, and clinician notes.">
        <AppPicker label="Encounter type" selectedValue={encounterForm.encounterType} onValueChange={(value) => setEncounterForm((current) => current ? { ...current, encounterType: value } : current)} items={ENCOUNTER_TYPE_OPTIONS} />
        <AppTextInput label="Encounter date" value={encounterForm.encounterDate} onChangeText={(value) => setEncounterForm((current) => current ? { ...current, encounterDate: value } : current)} autoCapitalize="none" />
        <AppTextInput label="Chief complaint" value={encounterForm.chiefComplaint} onChangeText={(value) => setEncounterForm((current) => current ? { ...current, chiefComplaint: value } : current)} multiline />
        <View style={styles.inlineRow}>
          <View style={styles.inlineField}>
            <AppTextInput label="Temperature" value={encounterForm.temperature} onChangeText={(value) => setEncounterForm((current) => current ? { ...current, temperature: value } : current)} keyboardType="numeric" autoCapitalize="none" />
          </View>
          <View style={styles.inlineField}>
            <AppTextInput label="Pulse" value={encounterForm.pulse} onChangeText={(value) => setEncounterForm((current) => current ? { ...current, pulse: value } : current)} keyboardType="numeric" autoCapitalize="none" />
          </View>
        </View>
        <View style={styles.inlineRow}>
          <View style={styles.inlineField}>
            <AppTextInput label="BP systolic" value={encounterForm.bloodPressureSystolic} onChangeText={(value) => setEncounterForm((current) => current ? { ...current, bloodPressureSystolic: value } : current)} keyboardType="numeric" autoCapitalize="none" />
          </View>
          <View style={styles.inlineField}>
            <AppTextInput label="BP diastolic" value={encounterForm.bloodPressureDiastolic} onChangeText={(value) => setEncounterForm((current) => current ? { ...current, bloodPressureDiastolic: value } : current)} keyboardType="numeric" autoCapitalize="none" />
          </View>
        </View>
        <View style={styles.inlineRow}>
          <View style={styles.inlineField}>
            <AppTextInput label="Respiratory rate" value={encounterForm.respiratoryRate} onChangeText={(value) => setEncounterForm((current) => current ? { ...current, respiratoryRate: value } : current)} keyboardType="numeric" autoCapitalize="none" />
          </View>
          <View style={styles.inlineField}>
            <AppTextInput label="SpO2" value={encounterForm.spo2} onChangeText={(value) => setEncounterForm((current) => current ? { ...current, spo2: value } : current)} keyboardType="numeric" autoCapitalize="none" />
          </View>
        </View>
        <AppTextInput label="History of present illness" value={encounterForm.historyOfPresentIllness} onChangeText={(value) => setEncounterForm((current) => current ? { ...current, historyOfPresentIllness: value } : current)} multiline />
        <AppTextInput label="Physical examination" value={encounterForm.physicalExamination} onChangeText={(value) => setEncounterForm((current) => current ? { ...current, physicalExamination: value } : current)} multiline />
        <AppTextInput label="Assessment" value={encounterForm.assessment} onChangeText={(value) => setEncounterForm((current) => current ? { ...current, assessment: value } : current)} multiline />
        <AppTextInput label="Notes" value={encounterForm.notes} onChangeText={(value) => setEncounterForm((current) => current ? { ...current, notes: value } : current)} multiline />
        <AppButton label={saveEncounterMutation.isPending ? 'Saving encounter...' : 'Save encounter updates'} onPress={async () => {
          try {
            await saveEncounterMutation.mutateAsync();
          } catch (error) {
            Alert.alert('Unable to save encounter', error instanceof Error ? error.message : 'Encounter update failed.');
          }
        }} disabled={saveEncounterMutation.isPending} />
      </SectionCard>

      <SectionCard title="Diagnoses" subtitle="Record or update working, differential, and confirmed diagnoses during the visit.">
        {(diagnosesQuery.data ?? []).map((diagnosis) => (
          <View key={diagnosis.id} style={styles.cardBlock}>
            <View style={styles.rowBetween}>
              <View style={styles.flexOne}>
                <Text style={styles.cardTitle}>{diagnosis.icd10_description || diagnosis.free_text_diagnosis || 'Diagnosis'}</Text>
                <Text style={styles.cardMeta}>{diagnosis.diagnosis_type} · {diagnosis.certainty}</Text>
              </View>
              <View style={styles.inlineButtonRow}>
                <AppButton
                  label="Edit"
                  variant="ghost"
                  onPress={() => setDiagnosisForm({
                    id: diagnosis.id,
                    diagnosisType: diagnosis.diagnosis_type,
                    certainty: diagnosis.certainty,
                    freeTextDiagnosis: diagnosis.free_text_diagnosis || diagnosis.icd10_description || '',
                    notes: diagnosis.notes || '',
                    isConfirmed: diagnosis.is_confirmed,
                  })}
                />
                <AppButton
                  label="Delete"
                  variant="danger"
                  onPress={async () => {
                    try {
                      await deleteDiagnosisMutation.mutateAsync(diagnosis.id);
                    } catch (error) {
                      Alert.alert('Unable to delete diagnosis', error instanceof Error ? error.message : 'Diagnosis deletion failed.');
                    }
                  }}
                />
              </View>
            </View>
            {diagnosis.notes ? <Text style={styles.bodyText}>{diagnosis.notes}</Text> : null}
          </View>
        ))}

        <AppPicker label="Diagnosis type" selectedValue={diagnosisForm.diagnosisType} onValueChange={(value) => setDiagnosisForm((current) => ({ ...current, diagnosisType: value }))} items={diagnosisTypeItems} />
        <AppPicker label="Certainty" selectedValue={diagnosisForm.certainty} onValueChange={(value) => setDiagnosisForm((current) => ({ ...current, certainty: value }))} items={diagnosisCertaintyItems} />
        <AppTextInput label="Diagnosis" value={diagnosisForm.freeTextDiagnosis} onChangeText={(value) => setDiagnosisForm((current) => ({ ...current, freeTextDiagnosis: value }))} placeholder="Free-text diagnosis or syndrome" multiline />
        <AppTextInput label="Diagnosis notes" value={diagnosisForm.notes} onChangeText={(value) => setDiagnosisForm((current) => ({ ...current, notes: value }))} multiline />
        <AppPicker label="Confirmed" selectedValue={diagnosisForm.isConfirmed ? 'true' : 'false'} onValueChange={(value) => setDiagnosisForm((current) => ({ ...current, isConfirmed: value === 'true' }))} items={booleanItems} />
        <View style={styles.inlineButtonRow}>
          <AppButton label={saveDiagnosisMutation.isPending ? 'Saving diagnosis...' : diagnosisForm.id ? 'Update diagnosis' : 'Add diagnosis'} onPress={async () => {
            try {
              await saveDiagnosisMutation.mutateAsync();
            } catch (error) {
              Alert.alert('Unable to save diagnosis', error instanceof Error ? error.message : 'Diagnosis save failed.');
            }
          }} disabled={saveDiagnosisMutation.isPending} />
          {diagnosisForm.id ? <AppButton label="Cancel edit" variant="ghost" onPress={() => setDiagnosisForm(emptyDiagnosisForm)} /> : null}
        </View>
      </SectionCard>

      <SectionCard title="Treatment plan" subtitle="Create or update the care plan without leaving the encounter.">
        <AppTextInput label="Clinical plan" value={treatmentPlanForm.clinicalNotes} onChangeText={(value) => setTreatmentPlanForm((current) => ({ ...current, clinicalNotes: value }))} multiline />
        <AppTextInput label="Follow-up instructions" value={treatmentPlanForm.followUpInstructions} onChangeText={(value) => setTreatmentPlanForm((current) => ({ ...current, followUpInstructions: value }))} multiline />
        <AppTextInput label="Follow-up date" value={treatmentPlanForm.followUpDate} onChangeText={(value) => setTreatmentPlanForm((current) => ({ ...current, followUpDate: value }))} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        <AppTextInput label="Diet recommendations" value={treatmentPlanForm.dietRecommendations} onChangeText={(value) => setTreatmentPlanForm((current) => ({ ...current, dietRecommendations: value }))} multiline />
        <AppTextInput label="Activity restrictions" value={treatmentPlanForm.activityRestrictions} onChangeText={(value) => setTreatmentPlanForm((current) => ({ ...current, activityRestrictions: value }))} multiline />
        <AppPicker label="Referral needed" selectedValue={treatmentPlanForm.referralNeeded ? 'true' : 'false'} onValueChange={(value) => setTreatmentPlanForm((current) => ({ ...current, referralNeeded: value === 'true' }))} items={booleanItems} />
        <AppTextInput label="Referral specialty" value={treatmentPlanForm.referralSpecialty} onChangeText={(value) => setTreatmentPlanForm((current) => ({ ...current, referralSpecialty: value }))} />
        <AppTextInput label="Referral notes" value={treatmentPlanForm.referralNotes} onChangeText={(value) => setTreatmentPlanForm((current) => ({ ...current, referralNotes: value }))} multiline />
        <AppPicker label="Plan status" selectedValue={treatmentPlanForm.status} onValueChange={(value) => setTreatmentPlanForm((current) => ({ ...current, status: value }))} items={treatmentPlanStatusItems} />
        <AppButton label={saveTreatmentPlanMutation.isPending ? 'Saving plan...' : treatmentPlanQuery.data ? 'Update treatment plan' : 'Create treatment plan'} onPress={async () => {
          try {
            await saveTreatmentPlanMutation.mutateAsync();
          } catch (error) {
            Alert.alert('Unable to save treatment plan', error instanceof Error ? error.message : 'Treatment plan save failed.');
          }
        }} disabled={saveTreatmentPlanMutation.isPending} />
      </SectionCard>

      <View style={styles.actions}>
        <AppButton label="Back to encounter" variant="secondary" onPress={() => router.replace(`/encounters/${encounterId}` as never)} />
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
  cardBlock: {
    backgroundColor: appTheme.colors.elevated,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    gap: 6,
    padding: 12,
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
    color: appTheme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  cardMeta: {
    color: appTheme.colors.mutedText,
    fontSize: 12,
  },
  bodyText: {
    color: appTheme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  inlineButtonRow: {
    gap: 8,
  },
});