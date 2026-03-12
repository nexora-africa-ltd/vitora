import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppTextInput, EmptyState, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import { SyncIndicator } from '@/components/sync-indicator';
import type { AppTheme } from '@/constants/theme';
import { useLocalPatients } from '@/lib/hooks/use-local-patients';
import { useAppTheme } from '@/lib/theme/theme-context';
import { getCoverageStatusLabel, getCoverageStatusTone } from '@/lib/types/sha';
import { buildPatientName, formatDate, formatGender } from '@/lib/utils/format';

export default function PatientsScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [searchInput, setSearchInput] = useState('');
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    const timeout = setTimeout(() => setSearchValue(searchInput.trim()), 250);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const patientQuery = useLocalPatients({ search: searchValue, limit: 20 });

  if (patientQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Fetching patient records..." />
      </ScreenContainer>
    );
  }

  const patients = patientQuery.patients;

  return (
    <ScreenContainer>
      <SyncIndicator />

      <SectionCard title="Patients" subtitle="Search the local registry by MRN, name, or ID. Online sync keeps this cache fresh in the background.">
        <AppTextInput label="Search patients" value={searchInput} onChangeText={setSearchInput} placeholder="MRN, name, ID, or phone" autoCapitalize="none" />
        <AppButton label="New patient" onPress={() => router.push('/patients/new' as never)} />
      </SectionCard>

      <SectionCard title="Registry" subtitle={`${patientQuery.count} patients cached on this device.`}>
        {patients.length === 0 ? (
          <EmptyState title="No patients found" description="Try a broader search, or register a new patient from this device." />
        ) : (
          patients.map((patient) => (
            <Pressable
              key={patient.id}
              onPress={() => router.push(`/patients/${patient.id}` as never)}
              style={({ pressed }) => [styles.patientCard, pressed && styles.cardPressed]}
            >
              <View style={styles.patientTopRow}>
                <View style={styles.patientTitleBlock}>
                  <Text style={styles.patientName}>{buildPatientName(patient)}</Text>
                  <Text style={styles.patientMeta}>{patient.mrn}</Text>
                </View>
                <View style={styles.pillRow}>
                  {patient.sha_coverage_status ? <Pill label={getCoverageStatusLabel(patient.sha_coverage_status)} tone={getCoverageStatusTone(patient.sha_coverage_status)} /> : <Pill label="SHA pending" tone="warning" />}
                  {patient.sync_state !== 'synced' ? <Pill label="Queued" tone={patient.sync_state === 'conflict' ? 'danger' : 'warning'} /> : null}
                  {patient.is_sensitive ? <Pill label="Sensitive" tone="danger" /> : null}
                </View>
              </View>
              <Text style={styles.patientSummary}>{formatGender(patient.gender)} · DOB {formatDate(patient.date_of_birth)}</Text>
              <Text style={styles.patientSummary}>{patient.county_name || 'County unavailable'} · {patient.phone_number || 'No phone recorded'}</Text>
            </Pressable>
          ))
        )}
      </SectionCard>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  patientCard: {
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  cardPressed: {
    opacity: 0.8,
  },
  patientTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pillRow: {
    alignItems: 'flex-end',
    gap: 6,
  },
  patientTitleBlock: {
    flex: 1,
    marginRight: 12,
  },
  patientName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  patientMeta: {
    color: theme.colors.mutedText,
    fontSize: 12,
  },
  patientSummary: {
    color: theme.colors.mutedText,
    fontSize: 14,
  },
  });
}