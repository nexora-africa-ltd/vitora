import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, DataRow, EmptyState, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import { PatientQRCode } from '@/components/patient-qr-code';
import type { AppTheme } from '@/constants/theme';
import { toApiError } from '@/lib/api/client';
import { encountersApi } from '@/lib/api/encounters';
import { upsertEncounters } from '@/lib/db';
import { getEncounterPillTone, getEncounterStatusLabel } from '@/lib/encounters';
import { useLocalEncounters } from '@/lib/hooks/use-local-encounters';
import { useLocalPatient } from '@/lib/hooks/use-local-patients';
import { useCheckPatientSHAEligibility, usePatientSHAEligibility } from '@/lib/hooks/use-patient-sha-eligibility';
import { useAppTheme } from '@/lib/theme/theme-context';
import { getCoverageStatusLabel, getCoverageStatusTone } from '@/lib/types/sha';
import { buildPatientName, formatCurrency, formatDate, formatDateTime, formatGender } from '@/lib/utils/format';

export default function PatientDetailScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{ id: string }>();
  const patientId = Number(params.id);

  const patientQuery = useLocalPatient(patientId);
  const encountersQuery = useLocalEncounters({ patientId });
  const eligibilityQuery = usePatientSHAEligibility(patientId);
  const checkEligibilityMutation = useCheckPatientSHAEligibility(patientId);
  const quickConsultationMutation = useMutation({
    mutationFn: async () => {
      if (!patientQuery.patient) {
        throw new Error('Patient is not available.');
      }

      return encountersApi.quickConsultation({
        patient: patientQuery.patient.id,
        chief_complaint: '',
        encounter_type: 'OPD',
      });
    },
    onSuccess: async (encounter) => {
      await upsertEncounters([encounter]);
      router.push(`/encounters/${encounter.id}` as never);
    },
  });

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
  const coverageStatus = eligibilityQuery.data?.coverage_status ?? patient.sha_coverage_status ?? 'pending';

  async function handleCheckEligibility() {
    try {
      await checkEligibilityMutation.mutateAsync();
    } catch (error) {
      const apiError = toApiError(error);
      Alert.alert('Unable to verify SHA eligibility', apiError.message);
    }
  }

  async function handleStartConsultation() {
    if (patient.local_only || patient.id <= 0 || patient.sync_state !== 'synced') {
      Alert.alert('Patient awaiting sync', 'This patient must sync to the server before a consultation can start.');
      return;
    }

    if (coverageStatus === 'pending') {
      Alert.alert('Check SHA eligibility first', 'Verify this patient\'s SHA status before starting consultation.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Check now', onPress: () => void handleCheckEligibility() },
      ]);
      return;
    }

    if (coverageStatus === 'not_covered') {
      Alert.alert('Consultation blocked', patient.sha_ineligibility_reason || 'Patient is not SHA-covered. Resolve billing or alternate funding before starting consultation.');
      return;
    }

    try {
      await quickConsultationMutation.mutateAsync();
    } catch (error) {
      const apiError = toApiError(error);
      Alert.alert('Unable to start consultation', apiError.message);
    }
  }

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Patient record"
        title={buildPatientName(patient)}
        description={`${patient.mrn} · ${formatGender(patient.gender)} · DOB ${formatDate(patient.date_of_birth)}`}
      >
        <View style={styles.heroPills}>
          <Pill label={getCoverageStatusLabel(coverageStatus)} tone={getCoverageStatusTone(coverageStatus)} />
          {patient.sync_state !== 'synced' ? <Pill label="Pending sync" tone={patient.sync_state === 'conflict' ? 'danger' : 'warning'} /> : null}
          {patient.is_sensitive ? <Pill label="Sensitive patient" tone="danger" /> : null}
        </View>
      </HeroCard>

      <SectionCard title="Encounter actions" subtitle="Continue reviewing this patient or start a new visit from the bedside.">
        <AppButton label={quickConsultationMutation.isPending ? 'Starting consultation...' : 'Start consultation'} onPress={() => void handleStartConsultation()} disabled={quickConsultationMutation.isPending} />
        <AppButton label={checkEligibilityMutation.isPending ? 'Checking SHA eligibility...' : 'Check SHA eligibility'} onPress={() => void handleCheckEligibility()} variant="secondary" disabled={checkEligibilityMutation.isPending} />
        <AppButton label="View billing summary" onPress={() => router.push(`/billing?patientId=${patient.id}` as never)} variant="secondary" />
        <AppButton label="Open MCH workspace" onPress={() => router.push(`/mch/immunization?patientId=${patient.id}` as never)} variant="secondary" />
        <AppButton label="New community screening" onPress={() => router.push(`/screening/new?patientId=${patient.id}` as never)} variant="secondary" />
        <AppButton label="Check-in workflow" onPress={() => router.push(`/checkin?patientId=${patient.id}` as never)} variant="ghost" />
        <AppButton label="New encounter for this patient" onPress={() => router.push(`/encounters/new?patientId=${patient.id}` as never)} />
      </SectionCard>

      {coverageStatus === 'not_covered' ? (
        <SectionCard title="SHA warning" subtitle="Consultation is blocked until funding is confirmed.">
          <Text style={styles.alertText}>{patient.sha_ineligibility_reason || 'Patient is not SHA-covered. Confirm billing or alternate funding before starting a consultation.'}</Text>
        </SectionCard>
      ) : null}

      <SectionCard title="Patient QR Code" subtitle="Show this code at check-in for fast identification.">
        <PatientQRCode patientId={patient.id} mrn={patient.mrn} patientName={buildPatientName(patient)} />
      </SectionCard>

      <SectionCard title="Demographics">
        <DataRow label="Date of birth" value={formatDate(patient.date_of_birth)} />
        <DataRow label="Gender" value={formatGender(patient.gender)} />
        <DataRow label="Identification" value={patient.identification_number || null} />
      </SectionCard>

      <SectionCard title="SHA eligibility" subtitle="Coverage verification is cached on the device for offline review.">
        <DataRow label="Coverage status" value={getCoverageStatusLabel(coverageStatus)} />
        <DataRow label="Checked at" value={formatDateTime(patient.sha_checked_at)} />
        <DataRow label="Eligible until" value={formatDate(patient.sha_eligible_until)} />
        <DataRow label="Benefit balance" value={patient.sha_benefit_balance != null ? formatCurrency(patient.sha_benefit_balance) : null} />
        <DataRow label="Result" value={patient.sha_result} />
        <DataRow label="Reason" value={patient.sha_ineligibility_reason} />
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
    alertText: {
      color: theme.colors.danger,
      fontSize: 14,
      lineHeight: 20,
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