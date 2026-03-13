import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppPicker, AppTextInput, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import { QRScannerDialog } from '@/components/qr-scanner-dialog';
import type { AppTheme } from '@/constants/theme';
import { checkinApi } from '@/lib/api/checkin';
import { clinicsApi } from '@/lib/api/clinics';
import { queryClient } from '@/lib/query/client';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { CheckInIdentityMethod, CheckInPatientLookup, CheckInPatientSearchResult, CheckInRoutingMode, CheckInVisitReason, CheckInVisitType } from '@/lib/types/checkin';
import { formatDate } from '@/lib/utils/format';

type CheckInFormState = {
  routingMode: CheckInRoutingMode;
  clinicId: string;
  visitType: CheckInVisitType;
  visitReason: CheckInVisitReason;
  identityMethod: CheckInIdentityMethod;
  chiefComplaint: string;
  notes: string;
  openTriageAfterCheckin: boolean;
};

const visitTypeItems: { label: string; value: CheckInVisitType }[] = [
  { label: 'New patient', value: 'NEW' },
  { label: 'Returning patient', value: 'RETURN' },
  { label: 'Follow-up visit', value: 'FOLLOW_UP' },
  { label: 'Emergency visit', value: 'EMERGENCY' },
  { label: 'Scheduled visit', value: 'SCHEDULED' },
];

const visitReasonItems: { label: string; value: CheckInVisitReason }[] = [
  { label: 'New complaint', value: 'NEW_COMPLAINT' },
  { label: 'Follow-up', value: 'FOLLOW_UP' },
  { label: 'Chronic care review', value: 'CHRONIC_CARE' },
  { label: 'Post-procedure review', value: 'PROCEDURE_REVIEW' },
  { label: 'Medication refill only', value: 'REFILL_ONLY' },
  { label: 'Lab results review', value: 'LAB_REVIEW' },
  { label: 'Referral visit', value: 'REFERRAL_VISIT' },
  { label: 'Other', value: 'OTHER' },
];

const identityMethodItems: { label: string; value: CheckInIdentityMethod }[] = [
  { label: 'MRN', value: 'MRN' },
  { label: 'National ID', value: 'NATIONAL_ID' },
  { label: 'Phone number', value: 'PHONE' },
  { label: 'Biometric', value: 'BIOMETRIC' },
  { label: 'Manual verification', value: 'MANUAL' },
];

const routingModeItems: { label: string; value: CheckInRoutingMode }[] = [
  { label: 'Send to triage', value: 'TRIAGE' },
  { label: 'Route directly to clinic', value: 'CLINIC' },
];

const booleanItems = [
  { label: 'Yes', value: 'true' },
  { label: 'No', value: 'false' },
] as const;

export default function CheckInScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{ patientId?: string }>();
  const initialPatientId = params.patientId ? Number(params.patientId) : null;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<CheckInPatientLookup | null>(null);
  const [isLookingUpPatient, setIsLookingUpPatient] = useState(false);
  const [form, setForm] = useState<CheckInFormState>({
    routingMode: 'TRIAGE',
    clinicId: '',
    visitType: 'RETURN',
    visitReason: 'NEW_COMPLAINT',
    identityMethod: 'MRN',
    chiefComplaint: '',
    notes: '',
    openTriageAfterCheckin: true,
  });

  const searchResultsQuery = useQuery({
    queryKey: ['checkin-patient-search', searchQuery.trim()],
    queryFn: () => checkinApi.searchPatients(searchQuery.trim()),
    enabled: searchQuery.trim().length >= 2,
  });

  const preselectedPatientQuery = useQuery({
    queryKey: ['checkin-preselected-patient', initialPatientId],
    queryFn: () => checkinApi.lookupPatient(String(initialPatientId)),
    enabled: Boolean(initialPatientId),
  });

  const clinicsQuery = useQuery({
    queryKey: ['active-clinics-for-checkin'],
    queryFn: () => clinicsApi.list({ page: 1, page_size: 100, status: 'ACTIVE' }),
  });

  useEffect(() => {
    if (!preselectedPatientQuery.data) {
      return;
    }

    setSelectedPatient(preselectedPatientQuery.data);
    setSearchQuery(preselectedPatientQuery.data.full_name);
    setForm((current) => ({
      ...current,
      visitType: preselectedPatientQuery.data.suggested_visit_type ?? current.visitType,
      visitReason: preselectedPatientQuery.data.suggested_visit_reason ?? current.visitReason,
    }));
  }, [preselectedPatientQuery.data]);

  const createCheckInMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) {
        throw new Error('Select a patient before checking in.');
      }

      if (form.routingMode === 'CLINIC' && !form.clinicId) {
        throw new Error('Choose a destination clinic for direct clinic routing.');
      }

      return checkinApi.create(selectedPatient.id, {
        destination: form.routingMode === 'CLINIC' ? form.clinicId : 'TRIAGE',
        visit_type: form.visitType,
        visit_reason: form.visitReason,
        chief_complaint: form.chiefComplaint.trim(),
        notes: form.notes.trim(),
        linked_encounter_id: selectedPatient.linkable_encounter_id ?? null,
        identity_method: form.identityMethod,
        skip_triage: form.routingMode === 'CLINIC',
      });
    },
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['encounters'] }),
        selectedPatient ? queryClient.invalidateQueries({ queryKey: ['patient-encounters', selectedPatient.id] }) : Promise.resolve(),
        response.encounter_id ? queryClient.invalidateQueries({ queryKey: ['encounter', response.encounter_id] }) : Promise.resolve(),
      ]);

      if (response.warning) {
        Alert.alert('Check-in completed with warning', response.warning);
      }

      if (form.routingMode === 'TRIAGE' && form.openTriageAfterCheckin && response.encounter_id) {
        router.replace(`/encounters/${response.encounter_id}/triage` as never);
        return;
      }

      if (response.encounter_id) {
        router.replace(`/encounters/${response.encounter_id}` as never);
        return;
      }

      router.back();
    },
  });

  const searchResults = useMemo(() => {
    if (selectedPatient && searchQuery.trim() === selectedPatient.full_name) {
      return [];
    }
    return searchResultsQuery.data ?? [];
  }, [searchQuery, searchResultsQuery.data, selectedPatient]);

  const clinicItems = useMemo(() => {
    const base = [{ label: 'Select clinic', value: '' }];
    const clinics = (clinicsQuery.data?.results ?? []).map((clinic) => ({
      label: `${clinic.name} · ${clinic.clinic_type_display || clinic.clinic_type}`,
      value: String(clinic.id),
    }));

    return [...base, ...clinics];
  }, [clinicsQuery.data?.results]);

  async function handleSelectPatient(result: CheckInPatientSearchResult) {
    try {
      setIsLookingUpPatient(true);
      const lookup = await checkinApi.lookupPatient(String(result.id));
      setSelectedPatient(lookup);
      setSearchQuery(lookup.full_name);
      setForm((current) => ({
        ...current,
        visitType: lookup.suggested_visit_type ?? current.visitType,
        visitReason: lookup.suggested_visit_reason ?? current.visitReason,
      }));
    } catch (error) {
      Alert.alert('Unable to load patient', error instanceof Error ? error.message : 'Patient lookup failed.');
    } finally {
      setIsLookingUpPatient(false);
    }
  }

  async function handleCheckIn() {
    if (!selectedPatient) {
      Alert.alert('Patient required', 'Search for and select a patient before checking in.');
      return;
    }

    if (!form.chiefComplaint.trim()) {
      Alert.alert('Chief complaint required', 'Capture the reason for visit before check-in.');
      return;
    }

    if (form.routingMode === 'CLINIC' && !form.clinicId) {
      Alert.alert('Clinic required', 'Select an active clinic when routing directly to clinic.');
      return;
    }

    try {
      await createCheckInMutation.mutateAsync();
    } catch (error) {
      Alert.alert('Unable to check in patient', error instanceof Error ? error.message : 'Check-in failed.');
    }
  }

  if (preselectedPatientQuery.isLoading) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState message="Loading patient for check-in..." fullScreen />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Check-in"
        title="Register patient arrival"
        description="Search the patient, confirm visit context, create the encounter, and optionally jump straight into triage from mobile."
      >
        <Pill label={selectedPatient ? 'Patient selected' : 'Awaiting patient'} tone={selectedPatient ? 'primary' : 'warning'} />
      </HeroCard>

      <SectionCard title="Find patient" subtitle="Search by MRN, ID, phone number, or name — or scan a QR code.">
        <AppTextInput label="Search patient" value={searchQuery} onChangeText={setSearchQuery} placeholder="Jane Doe, MRN-..., 07..." autoCapitalize="words" />
        <QRScannerDialog label="Scan patient QR code" onScan={(mrn) => setSearchQuery(mrn)} />

        {searchResultsQuery.isFetching || isLookingUpPatient ? <Text style={styles.helperText}>Searching patient records…</Text> : null}

        {searchResults.map((patient) => (
          <Pressable key={patient.id} onPress={() => void handleSelectPatient(patient)} style={({ pressed }) => [styles.resultCard, pressed && styles.resultCardPressed]}>
            <Text style={styles.resultTitle}>{patient.full_name}</Text>
            <Text style={styles.resultMeta}>{patient.mrn} · {patient.gender} · Last visit {patient.last_visit_date ? formatDate(patient.last_visit_date) : 'Not available'}</Text>
          </Pressable>
        ))}
      </SectionCard>

      {selectedPatient ? (
        <SectionCard title="Selected patient" subtitle="Clinical snapshot comes from the check-in workflow endpoints.">
          <Text style={styles.patientTitle}>{selectedPatient.full_name}</Text>
          <Text style={styles.helperText}>{selectedPatient.mrn} · Last encounter {selectedPatient.last_encounter_date ? formatDate(selectedPatient.last_encounter_date) : 'Not available'}</Text>
          {selectedPatient.clinical_snapshot.alerts.length > 0 ? (
            <View style={styles.stack}>
              {selectedPatient.clinical_snapshot.alerts.map((alert, index) => (
                <Text key={`${alert}-${index}`} style={styles.alertText}>{alert}</Text>
              ))}
            </View>
          ) : null}
          <Text style={styles.helperText}>Allergies: {selectedPatient.clinical_snapshot.allergies.join(', ') || 'None recorded'}</Text>
          <Text style={styles.helperText}>Active conditions: {selectedPatient.clinical_snapshot.active_conditions.join(', ') || 'None recorded'}</Text>
          <Text style={styles.helperText}>Current medications: {selectedPatient.clinical_snapshot.current_medications.join(', ') || 'None recorded'}</Text>
        </SectionCard>
      ) : null}

      <SectionCard title="Visit context" subtitle="These values are posted to the check-in API and influence routing and follow-up linkage.">
        <AppPicker label="Routing destination" selectedValue={form.routingMode} onValueChange={(value) => setForm((current) => ({ ...current, routingMode: value as CheckInRoutingMode }))} items={routingModeItems} />
        {form.routingMode === 'CLINIC' ? (
          <>
            <AppPicker label="Clinic" selectedValue={form.clinicId} onValueChange={(value) => setForm((current) => ({ ...current, clinicId: value }))} items={clinicItems} />
            <Text style={styles.helperText}>Direct clinic routing skips triage and creates a clinic queue visit using the selected clinic ID.</Text>
          </>
        ) : null}
        <AppPicker label="Visit type" selectedValue={form.visitType} onValueChange={(value) => setForm((current) => ({ ...current, visitType: value }))} items={visitTypeItems} />
        <AppPicker label="Visit reason" selectedValue={form.visitReason} onValueChange={(value) => setForm((current) => ({ ...current, visitReason: value }))} items={visitReasonItems} />
        <AppPicker label="Identity verification" selectedValue={form.identityMethod} onValueChange={(value) => setForm((current) => ({ ...current, identityMethod: value }))} items={identityMethodItems} />
        <AppTextInput label="Chief complaint" value={form.chiefComplaint} onChangeText={(value) => setForm((current) => ({ ...current, chiefComplaint: value }))} multiline />
        <AppTextInput label="Check-in notes" value={form.notes} onChangeText={(value) => setForm((current) => ({ ...current, notes: value }))} multiline />
        {form.routingMode === 'TRIAGE' ? <AppPicker label="Open triage immediately after check-in" selectedValue={form.openTriageAfterCheckin ? 'true' : 'false'} onValueChange={(value) => setForm((current) => ({ ...current, openTriageAfterCheckin: value === 'true' }))} items={booleanItems as unknown as { label: string; value: string }[]} /> : null}
        <AppButton label={createCheckInMutation.isPending ? 'Checking in patient...' : 'Check in patient'} onPress={handleCheckIn} disabled={createCheckInMutation.isPending} />
      </SectionCard>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  resultCard: {
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  resultCardPressed: {
    opacity: 0.82,
  },
  resultTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  resultMeta: {
    color: theme.colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  patientTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  helperText: {
    color: theme.colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  alertText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  stack: {
    gap: 6,
  },
  });
}