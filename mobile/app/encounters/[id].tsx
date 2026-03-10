import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, DataRow, EmptyState, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import { appTheme } from '@/constants/theme';
import { encountersApi } from '@/lib/api/encounters';
import { getEncounterPillTone, getEncounterStatusLabel } from '@/lib/encounters';
import { formatDate, formatDateTime, formatGender } from '@/lib/utils/format';

export default function EncounterDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const encounterId = Number(params.id);

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

  if (encounterQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading encounter details..." />
      </ScreenContainer>
    );
  }

  if (!encounterQuery.data) {
    return (
      <ScreenContainer>
        <EmptyState title="Encounter not found" description="This encounter could not be loaded from the backend." />
      </ScreenContainer>
    );
  }

  const encounter = encounterQuery.data;

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Encounter"
        title={encounter.patient_name || encounter.patient_mrn || `Encounter #${encounter.id}`}
        description={`${encounter.encounter_type_display || encounter.encounter_type} · ${encounter.patient_mrn || 'MRN pending'} · ${formatDate(encounter.encounter_date)}`}
      >
        <Pill label={getEncounterStatusLabel(encounter.status)} tone={getEncounterPillTone(encounter)} />
      </HeroCard>

      <SectionCard title="Encounter actions" subtitle="Continue this visit by updating documentation, diagnoses, and the treatment plan.">
        <AppButton label="Edit encounter" onPress={() => router.push(`/encounters/${encounter.id}/edit` as never)} />
      </SectionCard>

      <SectionCard title="Summary">
        <DataRow label="Chief complaint" value={encounter.chief_complaint} />
        <DataRow label="Patient" value={encounter.patient_name} />
        <DataRow label="Gender" value={encounter.patient_gender ? formatGender(encounter.patient_gender) : null} />
        <DataRow label="Encounter date" value={formatDate(encounter.encounter_date)} />
        <DataRow label="Created at" value={formatDateTime(encounter.created_at)} />
        <DataRow label="Created by" value={encounter.created_by_name} />
        <DataRow label="Assigned clinician" value={encounter.assigned_clinician_name || encounter.assigned_clinician_username} />
      </SectionCard>

      <SectionCard title="Vitals" subtitle="Critical values and calculated vitals come straight from the encounter serializer.">
        <View style={styles.vitalsGrid}>
          <View style={styles.vitalsTile}>
            <Text style={styles.vitalsLabel}>Temperature</Text>
            <Text style={styles.vitalsValue}>{encounter.temperature != null ? `${encounter.temperature} °C` : 'Not recorded'}</Text>
          </View>
          <View style={styles.vitalsTile}>
            <Text style={styles.vitalsLabel}>Pulse</Text>
            <Text style={styles.vitalsValue}>{encounter.pulse != null ? `${encounter.pulse} bpm` : 'Not recorded'}</Text>
          </View>
          <View style={styles.vitalsTile}>
            <Text style={styles.vitalsLabel}>Blood pressure</Text>
            <Text style={styles.vitalsValue}>{encounter.blood_pressure || 'Not recorded'}</Text>
          </View>
          <View style={styles.vitalsTile}>
            <Text style={styles.vitalsLabel}>Respiratory rate</Text>
            <Text style={styles.vitalsValue}>{encounter.respiratory_rate != null ? `${encounter.respiratory_rate}/min` : 'Not recorded'}</Text>
          </View>
          <View style={styles.vitalsTile}>
            <Text style={styles.vitalsLabel}>SpO2</Text>
            <Text style={styles.vitalsValue}>{encounter.spo2 != null ? `${encounter.spo2}%` : 'Not recorded'}</Text>
          </View>
          <View style={styles.vitalsTile}>
            <Text style={styles.vitalsLabel}>BMI</Text>
            <Text style={styles.vitalsValue}>{encounter.bmi != null ? `${encounter.bmi}` : 'Not available'}</Text>
          </View>
        </View>
        {encounter.alerts ? <Text style={styles.alertText}>{encounter.alerts}</Text> : null}
      </SectionCard>

      <SectionCard title="Medical history">
        <DataRow label="Allergies" value={encounter.allergies} />
        <DataRow label="Chronic conditions" value={encounter.chronic_conditions} />
        <DataRow label="Current medications" value={encounter.current_medications} />
        <DataRow label="Past surgeries" value={encounter.past_surgeries} />
        <DataRow label="Family history" value={encounter.family_history} />
        <DataRow label="Social history" value={encounter.social_history} />
      </SectionCard>

      <SectionCard title="Clinical notes">
        <DataRow label="History of present illness" value={encounter.history_of_present_illness} />
        <DataRow label="Physical examination" value={encounter.physical_examination} />
        <DataRow label="Assessment" value={encounter.assessment} />
        <DataRow label="Notes" value={encounter.notes} />
      </SectionCard>

      <SectionCard title="Diagnoses" subtitle="Primary, secondary, and differential diagnoses recorded for this encounter.">
        {(diagnosesQuery.data ?? []).length === 0 ? (
          <EmptyState title="No diagnoses" description="No diagnoses have been recorded for this encounter yet." />
        ) : (
          (diagnosesQuery.data ?? []).map((diagnosis) => (
            <View key={diagnosis.id} style={styles.cardBlock}>
              <View style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>{diagnosis.icd10_description || diagnosis.free_text_diagnosis || 'Diagnosis'}</Text>
                  <Text style={styles.cardMeta}>
                    {diagnosis.icd10_code_display || diagnosis.icd11_code || 'Free text diagnosis'} · {diagnosis.certainty}
                  </Text>
                </View>
                <Pill label={diagnosis.diagnosis_type} tone={diagnosis.diagnosis_type === 'PRIMARY' ? 'primary' : 'neutral'} />
              </View>
              {diagnosis.notes ? <Text style={styles.bodyText}>{diagnosis.notes}</Text> : null}
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="Treatment plan" subtitle="Plan text, follow-up, and medication summary for this visit.">
        {!treatmentPlanQuery.data ? (
          <EmptyState title="No treatment plan" description="This encounter does not have a treatment plan yet." />
        ) : (
          <View style={styles.planStack}>
            <DataRow label="Clinical plan" value={treatmentPlanQuery.data.clinical_notes} />
            <DataRow label="Follow-up instructions" value={treatmentPlanQuery.data.follow_up_instructions} />
            <DataRow label="Follow-up date" value={formatDate(treatmentPlanQuery.data.follow_up_date)} />
            <DataRow label="Diet recommendations" value={treatmentPlanQuery.data.diet_recommendations} />
            <DataRow label="Activity restrictions" value={treatmentPlanQuery.data.activity_restrictions} />
            <DataRow label="Referral specialty" value={treatmentPlanQuery.data.referral_specialty} />
            <DataRow label="Referral notes" value={treatmentPlanQuery.data.referral_notes} />
            {(treatmentPlanQuery.data.medications ?? []).length > 0 ? (
              <View style={styles.planStack}>
                <Text style={styles.sectionLabel}>Medications</Text>
                {treatmentPlanQuery.data.medications.map((medication) => (
                  <View key={medication.id} style={styles.cardBlock}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.cardTitle}>{medication.name}</Text>
                      <Pill label={medication.route} tone="neutral" />
                    </View>
                    <Text style={styles.cardMeta}>{medication.dosage} · {medication.frequency} · {medication.duration}</Text>
                    {medication.instructions ? <Text style={styles.bodyText}>{medication.instructions}</Text> : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </SectionCard>

      <SectionCard title="Workflow">
        <DataRow label="Triage requirement" value={encounter.triage_requirement} />
        <DataRow label="Triage status" value={encounter.triage_status} />
        <DataRow label="Consultation status" value={encounter.consultation_status} />
        <DataRow label="Claimed at" value={formatDateTime(encounter.claimed_at)} />
        <DataRow label="Finalized at" value={formatDateTime(encounter.finalized_at)} />
      </SectionCard>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  vitalsTile: {
    backgroundColor: appTheme.colors.elevated,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    gap: 6,
    minWidth: '47%',
    padding: 12,
  },
  vitalsLabel: {
    color: appTheme.colors.mutedText,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  vitalsValue: {
    color: appTheme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  alertText: {
    color: appTheme.colors.danger,
    fontSize: 13,
    fontWeight: '700',
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
  cardBlock: {
    backgroundColor: appTheme.colors.elevated,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    gap: 6,
    padding: 12,
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
  planStack: {
    gap: 12,
  },
  sectionLabel: {
    color: appTheme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
});