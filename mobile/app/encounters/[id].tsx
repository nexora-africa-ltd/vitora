import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { DataRow, EmptyState, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
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
});