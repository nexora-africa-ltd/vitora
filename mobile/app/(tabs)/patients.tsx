import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppTextInput, EmptyState, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import { appTheme } from '@/constants/theme';
import { patientsApi } from '@/lib/api/patients';
import { buildPatientName, formatDate, formatGender } from '@/lib/utils/format';

export default function PatientsScreen() {
  const [searchInput, setSearchInput] = useState('');
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    const timeout = setTimeout(() => setSearchValue(searchInput.trim()), 250);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const patientQuery = useQuery({
    queryKey: ['patients', searchValue],
    queryFn: () => patientsApi.list({ page: 1, page_size: 20, search: searchValue || undefined, ordering: '-created_at' }),
  });

  if (patientQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Fetching patient records..." />
      </ScreenContainer>
    );
  }

  const patients = patientQuery.data?.results ?? [];

  return (
    <ScreenContainer>
      <SectionCard title="Patients" subtitle="Search by MRN, name, or ID using the same backend filters as the web client.">
        <AppTextInput label="Search patients" value={searchInput} onChangeText={setSearchInput} placeholder="MRN, name, ID, or phone" autoCapitalize="none" />
        <AppButton label="New patient" onPress={() => router.push('/patients/new' as never)} />
      </SectionCard>

      <SectionCard title="Registry" subtitle={`${patientQuery.data?.count ?? 0} patients available from the backend.`}>
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
                {patient.is_sensitive ? <Pill label="Sensitive" tone="danger" /> : null}
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

const styles = StyleSheet.create({
  patientCard: {
    backgroundColor: appTheme.colors.elevated,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
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
  patientTitleBlock: {
    flex: 1,
    marginRight: 12,
  },
  patientName: {
    color: appTheme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  patientMeta: {
    color: appTheme.colors.mutedText,
    fontSize: 12,
  },
  patientSummary: {
    color: appTheme.colors.mutedText,
    fontSize: 14,
  },
});