import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, DataRow, EmptyState, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { getEncounterPillTone, getEncounterStatusLabel } from '@/lib/encounters';
import { useLocalEncounters } from '@/lib/hooks/use-local-encounters';
import { useLocalPatient } from '@/lib/hooks/use-local-patients';
import { useAppTheme } from '@/lib/theme/theme-context';
import { buildPatientName, formatDate, formatGender } from '@/lib/utils/format';

export default function PatientDetailScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{ id: string }>();
  const patientId = Number(params.id);

  const patientQuery = useLocalPatient(patientId);
  const encountersQuery = useLocalEncounters({ patientId });

  if (patientQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading patient record..." />
      </ScreenContainer>
    );
  }

  if (!patientQuery.patient) {
    return (
      <ScreenContainer>
        <EmptyState title="Patient not found" description="This record is not available in the local cache yet." />
      </ScreenContainer>
    );
  }

  const patient = patientQuery.patient;

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Patient record"
        title={buildPatientName(patient)}
        description={`${patient.mrn} · ${formatGender(patient.gender)} · DOB ${formatDate(patient.date_of_birth)}`}
      >
        <View style={styles.heroPills}>
          {patient.sync_state !== 'synced' ? <Pill label="Pending sync" tone={patient.sync_state === 'conflict' ? 'danger' : 'warning'} /> : null}
          {patient.is_sensitive ? <Pill label="Sensitive patient" tone="danger" /> : null}
        </View>
      </HeroCard>

      <SectionCard title="Encounter actions" subtitle="Continue reviewing this patient or start a new visit from the bedside.">
        <AppButton label="Start consultation" onPress={() => router.push(`/checkin?patientId=${patient.id}` as never)} />
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
        {encountersQuery.encounters.length === 0 ? (
          <EmptyState title="No encounters" description="This patient does not have encounter history yet." />
        ) : (
          encountersQuery.encounters.map((encounter) => (
            <Pressable
              key={encounter.id}
              onPress={() => router.push(`/encounters/${encounter.id}` as never)}
              style={({ pressed }) => [styles.encounterItem, pressed && styles.encounterPressed]}
            >
              <View style={styles.encounterHeader}>
                <Text style={styles.encounterType}>{encounter.encounter_type}</Text>
                <View style={styles.encounterPills}>
                  {encounter.sync_state !== 'synced' ? <Pill label="Queued" tone={encounter.sync_state === 'conflict' ? 'danger' : 'warning'} /> : null}
                  <Pill label={getEncounterStatusLabel(encounter.status)} tone={getEncounterPillTone(encounter)} />
                </View>
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

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  heroPills: {
    gap: 8,
  },
  encounterItem: {
    borderBottomColor: theme.colors.border,
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
  encounterPills: {
    alignItems: 'flex-end',
    gap: 6,
  },
  encounterType: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  encounterComplaint: {
    color: theme.colors.text,
    fontSize: 14,
  },
  encounterMeta: {
    color: theme.colors.mutedText,
    fontSize: 12,
  },
  });
}