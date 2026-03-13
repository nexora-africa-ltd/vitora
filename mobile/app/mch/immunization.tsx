import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton, DataRow, EmptyState, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { immunizationsApi } from '@/lib/api/mch';
import { upsertImmunizationRecords } from '@/lib/db';
import { useLocalImmunizations, useLocalMCHRegistration } from '@/lib/hooks/use-local-mch';
import { useLocalPatient } from '@/lib/hooks/use-local-patients';
import { useAppTheme } from '@/lib/theme/theme-context';
import { formatDate } from '@/lib/utils/format';

function getImmunizationTone(status: string, isOverdue: boolean): 'primary' | 'warning' | 'danger' | 'neutral' {
  if (status === 'ADMINISTERED') {
    return 'primary';
  }
  if (isOverdue || status === 'MISSED') {
    return 'danger';
  }
  if (status === 'DEFERRED' || status === 'SCHEDULED') {
    return 'warning';
  }
  return 'neutral';
}

export default function ImmunizationScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{ patientId?: string; registrationId?: string }>();
  const patientId = Number(params.patientId);
  const registrationId = Number(params.registrationId);

  const patientQuery = useLocalPatient(patientId);
  const registrationQuery = useLocalMCHRegistration(registrationId);
  const immunizationQuery = useLocalImmunizations(patientId);

  const generateScheduleMutation = useMutation({
    mutationFn: async () => {
      const records = await immunizationsApi.generateSchedule(patientId);
      await upsertImmunizationRecords(records, new Date().toISOString());
      return records;
    },
    onSuccess: () => {
      Alert.alert('Schedule refreshed', 'The immunization schedule was generated from the backend and cached locally.');
    },
  });

  const administerMutation = useMutation({
    mutationFn: async (recordId: number) => {
      const response = await immunizationsApi.administer(recordId, {
        administered_date: new Date().toISOString().slice(0, 10),
        notes: 'Administered from the mobile outreach workflow.',
      });
      await upsertImmunizationRecords([response], new Date().toISOString());
      return response;
    },
  });

  if (patientQuery.isLoading || immunizationQuery.isLoading || registrationQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading immunization schedule..." />
      </ScreenContainer>
    );
  }

  const patient = patientQuery.patient;
  const registration = registrationQuery.registration;
  const records = immunizationQuery.records;
  const administeredCount = records.filter((record) => record.status === 'ADMINISTERED').length;
  const dueCount = records.filter((record) => record.status !== 'ADMINISTERED').length;

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Immunization"
        title={patient?.full_name ?? patient?.first_name ?? 'Patient immunization schedule'}
        description={patient ? `${patient.mrn} · ${records.length} doses cached locally` : 'Maternal immunization and dose tracking'}
      />

      <SectionCard title="Schedule actions" subtitle="Generate the latest due doses from the backend, then administer from mobile.">
        <AppButton label={generateScheduleMutation.isPending ? 'Refreshing schedule...' : 'Generate or refresh schedule'} onPress={() => void generateScheduleMutation.mutateAsync()} disabled={generateScheduleMutation.isPending || !Number.isFinite(patientId)} />
      </SectionCard>

      {registration ? (
        <SectionCard title="Pregnancy context">
          <DataRow label="MCH number" value={registration.mch_number} />
          <DataRow label="EDD" value={formatDate(registration.edd)} />
          <DataRow label="Gestation" value={registration.gestation_display} />
        </SectionCard>
      ) : null}

      <View style={styles.metricRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Administered</Text>
          <Text style={styles.metricValue}>{administeredCount}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Pending / due</Text>
          <Text style={styles.metricValue}>{dueCount}</Text>
        </View>
      </View>

      <SectionCard title="Dose tracking" subtitle="TT and other generated doses are stored here with due and administered dates.">
        {records.length === 0 ? (
          <EmptyState title="No immunization records" description="Generate the patient schedule first, then doses will appear here for offline review." />
        ) : (
          records.map((record) => (
            <View key={record.id} style={styles.recordCard}>
              <View style={styles.topRow}>
                <View style={styles.titleBlock}>
                  <Text style={styles.recordTitle}>{record.vaccine_name}</Text>
                  <Text style={styles.helperText}>{record.vaccine_code} · Dose {record.dose_number}</Text>
                </View>
                <Pill label={record.status.replace(/_/g, ' ')} tone={getImmunizationTone(record.status, record.is_overdue)} />
              </View>
              <Text style={styles.helperText}>Scheduled {formatDate(record.scheduled_date)}</Text>
              <Text style={styles.helperText}>{record.administered_date ? `Administered ${formatDate(record.administered_date)}` : `Due ${formatDate(record.next_dose_date ?? record.scheduled_date)}`}</Text>
              {record.is_overdue ? <Pill label={`Overdue${record.days_overdue ? ` ${record.days_overdue}d` : ''}`} tone="danger" /> : null}
              {record.status !== 'ADMINISTERED' ? (
                <AppButton label={administerMutation.isPending ? 'Saving dose...' : 'Mark administered today'} onPress={() => void administerMutation.mutateAsync(record.id)} disabled={administerMutation.isPending} variant="secondary" />
              ) : null}
            </View>
          ))
        )}
      </SectionCard>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    helperText: {
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 18,
    },
    metricCard: {
      backgroundColor: theme.colors.elevated,
      borderRadius: theme.radius.md,
      flex: 1,
      gap: 6,
      padding: 14,
    },
    metricLabel: {
      color: theme.colors.mutedText,
      fontSize: 12,
    },
    metricRow: {
      flexDirection: 'row',
      gap: 12,
    },
    metricValue: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: '800',
    },
    recordCard: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      gap: 8,
      padding: 14,
    },
    recordTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    titleBlock: {
      flex: 1,
      marginRight: 10,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
  });
}