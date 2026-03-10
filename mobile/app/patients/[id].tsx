import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, DataRow, EmptyState, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import { appTheme } from '@/constants/theme';
import { getEncounterPillTone, getEncounterStatusLabel } from '@/lib/encounters';
import { patientsApi } from '@/lib/api/patients';
import { buildPatientName, formatDate, formatGender } from '@/lib/utils/format';

export default function PatientDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const patientId = Number(params.id);

  const patientQuery = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => patientsApi.get(patientId),
    enabled: Number.isFinite(patientId),
  });

  const encountersQuery = useQuery({
    queryKey: ['patient-encounters', patientId],
    queryFn: () => patientsApi.getEncounters(patientId),
    enabled: Number.isFinite(patientId),
  });

  if (patientQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading patient record..." />
      </ScreenContainer>
    );
  }

  if (!patientQuery.data) {
    return (
      <ScreenContainer>
        <EmptyState title="Patient not found" description="This record could not be loaded from the backend." />
      </ScreenContainer>
    );
  }

  const patient = patientQuery.data;

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Patient record"
        title={buildPatientName(patient)}
        description={`${patient.mrn} · ${formatGender(patient.gender)} · DOB ${formatDate(patient.date_of_birth)}`}
      >
        {patient.is_sensitive ? <Pill label="Sensitive patient" tone="danger" /> : null}
      </HeroCard>

      <SectionCard title="Encounter actions" subtitle="Continue reviewing this patient or start a new visit from the bedside.">
        <AppButton label="New encounter for this patient" onPress={() => router.push(`/encounters/new?patientId=${patient.id}` as never)} />
      </SectionCard>

      <SectionCard title="Demographics">
        <DataRow label="Date of birth" value={formatDate(patient.date_of_birth)} />
        <DataRow label="Gender" value={formatGender(patient.gender)} />
        <DataRow label="Identification" value={patient.identification_number || null} />
      </SectionCard>

      <SectionCard title="Contact and location">
        <DataRow label="Phone" value={patient.phone_number} />
        <DataRow label="County" value={patient.county_name} />
        <DataRow label="Sub-county" value={patient.sub_county_name} />
        <DataRow label="Ward" value={patient.ward_name} />
        <DataRow label="Village" value={patient.village} />
      </SectionCard>

      <SectionCard title="Emergency contact">
        <DataRow label="Name" value={patient.emergency_contact_name} />
        <DataRow label="Phone" value={patient.emergency_contact_phone} />
        <DataRow label="Relationship" value={patient.emergency_contact_relationship} />
      </SectionCard>

      <SectionCard title="Encounter history" subtitle="Recent encounter activity linked to this patient.">
        {(encountersQuery.data ?? []).length === 0 ? (
          <EmptyState title="No encounters" description="This patient does not have encounter history yet." />
        ) : (
          (encountersQuery.data ?? []).map((encounter) => (
            <Pressable
              key={encounter.id}
              onPress={() => router.push(`/encounters/${encounter.id}` as never)}
              style={({ pressed }) => [styles.encounterItem, pressed && styles.encounterPressed]}
            >
              <View style={styles.encounterHeader}>
                <Text style={styles.encounterType}>{encounter.encounter_type}</Text>
                <Pill label={getEncounterStatusLabel(encounter.status)} tone={getEncounterPillTone(encounter)} />
              </View>
              <Text style={styles.encounterComplaint}>{encounter.chief_complaint}</Text>
              <Text style={styles.encounterMeta}>{formatDate(encounter.encounter_date)}</Text>
            </Pressable>
          ))
        )}
      </SectionCard>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  encounterItem: {
    borderBottomColor: appTheme.colors.border,
    borderBottomWidth: 1,
    gap: 4,
    paddingBottom: 12,
  },
  encounterPressed: {
    opacity: 0.8,
  },
  encounterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  encounterType: {
    color: appTheme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  encounterComplaint: {
    color: appTheme.colors.text,
    fontSize: 14,
  },
  encounterMeta: {
    color: appTheme.colors.mutedText,
    fontSize: 12,
  },
});