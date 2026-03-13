import NetInfo from '@react-native-community/netinfo';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppPicker, AppTextInput, DataRow, EmptyState, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { ancVisitsApi } from '@/lib/api/mch';
import { queueOfflineANCVisitCreate, upsertANCVisits, upsertMCHRegistrations } from '@/lib/db';
import { useLocalANCVisits, useLocalMCHRegistration } from '@/lib/hooks/use-local-mch';
import { useLocalPatient } from '@/lib/hooks/use-local-patients';
import { deriveRiskFactors } from '@/lib/mch/risk';
import { useAppTheme } from '@/lib/theme/theme-context';
import { formatDate } from '@/lib/utils/format';

const urineOptions = [
  { label: 'Negative', value: 'NEGATIVE' },
  { label: 'Trace', value: 'TRACE' },
  { label: '1+', value: '1+' },
  { label: '2+', value: '2+' },
  { label: '3+', value: '3+' },
  { label: '4+', value: '4+' },
] as const;

function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildMobileNotes(input: { notes: string; bloodGroup: string; gestationWeeks: string }) {
  return [
    input.notes.trim(),
    input.bloodGroup.trim() ? `Blood group: ${input.bloodGroup.trim()}` : '',
    input.gestationWeeks.trim() ? `Mobile gestational age capture: ${input.gestationWeeks.trim()} weeks` : '',
  ].filter(Boolean).join('\n');
}

export default function ANCRegistrationScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{ id: string }>();
  const registrationId = Number(params.id);
  const registrationQuery = useLocalMCHRegistration(registrationId);
  const visitsQuery = useLocalANCVisits(registrationId);
  const patientQuery = useLocalPatient(registrationQuery.registration?.mother ?? NaN);

  const [form, setForm] = useState({
    gestationWeeks: '',
    weight: '',
    bloodPressure: '',
    fundalHeight: '',
    fetalHeartRate: '',
    urineProtein: 'NEGATIVE',
    urineGlucose: 'NEGATIVE',
    bloodGroup: '',
    tetanusDose: '',
    notes: '',
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        registration: registrationId,
        visit_date: new Date().toISOString().slice(0, 10),
        visit_number: (visitsQuery.count || 0) + 1,
        weight: toOptionalNumber(form.weight),
        blood_pressure: form.bloodPressure.trim() || undefined,
        fundal_height: toOptionalNumber(form.fundalHeight),
        fetal_heart_rate: toOptionalNumber(form.fetalHeartRate),
        urine_protein: form.urineProtein as 'NEGATIVE' | 'TRACE' | '1+' | '2+' | '3+' | '4+',
        urine_glucose: form.urineGlucose as 'NEGATIVE' | 'TRACE' | '1+' | '2+' | '3+' | '4+',
        tetanus_toxoid_dose: toOptionalNumber(form.tetanusDose),
        notes: buildMobileNotes(form) || undefined,
      };

      const netState = await NetInfo.fetch();
      const isOnline = Boolean(netState.isConnected && netState.isInternetReachable !== false);

      if (!isOnline) {
        return queueOfflineANCVisitCreate(payload);
      }

      return ancVisitsApi.create(payload);
    },
    onSuccess: async (visit) => {
      await upsertANCVisits([visit], new Date().toISOString());
      if (registrationQuery.registration) {
        await upsertMCHRegistrations([
          {
            ...registrationQuery.registration,
            anc_visit_count: registrationQuery.registration.anc_visit_count + 1,
          },
        ]);
      }
      Alert.alert('ANC visit saved', 'The antenatal visit has been stored and will sync if needed.');
      setForm({
        gestationWeeks: '',
        weight: '',
        bloodPressure: '',
        fundalHeight: '',
        fetalHeartRate: '',
        urineProtein: 'NEGATIVE',
        urineGlucose: 'NEGATIVE',
        bloodGroup: '',
        tetanusDose: '',
        notes: '',
      });
    },
  });

  if (registrationQuery.isLoading || visitsQuery.isLoading || patientQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading ANC workflow..." />
      </ScreenContainer>
    );
  }

  if (!registrationQuery.registration) {
    return (
      <ScreenContainer>
        <EmptyState title="MCH registration not found" description="This pregnancy is not yet cached on the device. Run a sync while online and retry." />
      </ScreenContainer>
    );
  }

  const registration = registrationQuery.registration;
  const patient = patientQuery.patient;
  const riskFactors = deriveRiskFactors({
    patient,
    isHighRisk: registration.is_high_risk,
    isMultiplePregnancy: registration.is_multiple_pregnancy,
    riskFactorsText: registration.risk_factors,
  });

  async function handleSave() {
    if (!form.bloodPressure.trim()) {
      Alert.alert('Blood pressure required', 'Enter blood pressure for this ANC visit.');
      return;
    }

    try {
      await saveMutation.mutateAsync();
    } catch (error) {
      Alert.alert('Unable to save ANC visit', error instanceof Error ? error.message : 'ANC save failed.');
    }
  }

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="ANC"
        title={registration.mother_name}
        description={`${registration.mch_number} · ${registration.gestation_display} · EDD ${formatDate(registration.edd)}`}
      >
        <View style={styles.heroPills}>
          {riskFactors.length > 0 ? <Pill label="High risk" tone="danger" /> : <Pill label="Routine follow-up" tone="primary" />}
          <Pill label={`Visit ${visitsQuery.count + 1}`} tone="neutral" />
        </View>
      </HeroCard>

      <SectionCard title="Pregnancy risk" subtitle="Risk flags are derived from the stored pregnancy record and maternal age.">
        {riskFactors.length === 0 ? <Text style={styles.helperText}>No high-risk flags are currently detected from cached data.</Text> : riskFactors.map((riskFactor) => <Pill key={riskFactor.code} label={riskFactor.label} tone={riskFactor.severity} />)}
      </SectionCard>

      <SectionCard title="Pregnancy summary">
        <DataRow label="Mother MRN" value={registration.mother_mrn} />
        <DataRow label="Gestation" value={registration.gestation_display} />
        <DataRow label="Trimester" value={registration.trimester != null ? String(registration.trimester) : null} />
        <DataRow label="Recorded ANC visits" value={String(registration.anc_visit_count)} />
      </SectionCard>

      <SectionCard title="Capture ANC visit" subtitle="Structured fields map to the backend ANC payload. Mobile-only blood group and gestational-age notes are appended into the visit notes.">
        <AppTextInput label="Gestational age (weeks)" value={form.gestationWeeks} onChangeText={(value) => setForm((current) => ({ ...current, gestationWeeks: value }))} keyboardType="numeric" autoCapitalize="none" placeholder={registration.current_gestation_weeks != null ? String(registration.current_gestation_weeks) : '28'} />
        <AppTextInput label="Weight (kg)" value={form.weight} onChangeText={(value) => setForm((current) => ({ ...current, weight: value }))} keyboardType="numeric" autoCapitalize="none" />
        <AppTextInput label="Blood pressure" value={form.bloodPressure} onChangeText={(value) => setForm((current) => ({ ...current, bloodPressure: value }))} autoCapitalize="none" placeholder="120/80" />
        <AppTextInput label="Fundal height (cm)" value={form.fundalHeight} onChangeText={(value) => setForm((current) => ({ ...current, fundalHeight: value }))} keyboardType="numeric" autoCapitalize="none" />
        <AppTextInput label="Fetal heart rate" value={form.fetalHeartRate} onChangeText={(value) => setForm((current) => ({ ...current, fetalHeartRate: value }))} keyboardType="numeric" autoCapitalize="none" placeholder="140" />
        <AppPicker label="Urine protein" selectedValue={form.urineProtein} onValueChange={(value) => setForm((current) => ({ ...current, urineProtein: value }))} items={urineOptions.map((option) => ({ label: option.label, value: option.value }))} />
        <AppPicker label="Urine glucose" selectedValue={form.urineGlucose} onValueChange={(value) => setForm((current) => ({ ...current, urineGlucose: value }))} items={urineOptions.map((option) => ({ label: option.label, value: option.value }))} />
        <AppTextInput label="Blood group" value={form.bloodGroup} onChangeText={(value) => setForm((current) => ({ ...current, bloodGroup: value }))} autoCapitalize="characters" placeholder="O+" />
        <AppTextInput label="TT dose number" value={form.tetanusDose} onChangeText={(value) => setForm((current) => ({ ...current, tetanusDose: value }))} keyboardType="numeric" autoCapitalize="none" />
        <AppTextInput label="Clinical notes" value={form.notes} onChangeText={(value) => setForm((current) => ({ ...current, notes: value }))} multiline placeholder="Symptoms, counselling, or risk observations" />
        <AppButton label={saveMutation.isPending ? 'Saving visit...' : 'Save ANC visit'} onPress={() => void handleSave()} disabled={saveMutation.isPending} />
      </SectionCard>

      <SectionCard title="Visit timeline" subtitle="Latest ANC visits stored on this device.">
        {visitsQuery.visits.length === 0 ? (
          <EmptyState title="No ANC visits yet" description="Capture the first visit for this pregnancy from mobile." />
        ) : (
          visitsQuery.visits.map((visit) => (
            <View key={visit.id} style={styles.timelineCard}>
              <View style={styles.timelineTopRow}>
                <Text style={styles.timelineTitle}>Visit {visit.visit_number}</Text>
                {visit.sync_state !== 'synced' ? <Pill label="Queued" tone={visit.sync_state === 'conflict' ? 'danger' : 'warning'} /> : null}
              </View>
              <Text style={styles.helperText}>{formatDate(visit.visit_date)} · BP {visit.blood_pressure || 'n/a'} · Weight {visit.weight ?? 'n/a'} kg</Text>
              <Text style={styles.helperText}>FHR {visit.fetal_heart_rate ?? 'n/a'} · Fundal height {visit.fundal_height ?? 'n/a'} cm</Text>
              {visit.alerts.length > 0 ? <View style={styles.alertRow}>{visit.alerts.map((alert) => <Pill key={`${visit.id}-${alert}`} label={alert} tone="warning" />)}</View> : null}
              {visit.notes ? <Text style={styles.noteText}>{visit.notes}</Text> : null}
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="Next step" subtitle="Open maternal immunization and dose tracking for this patient.">
        <AppButton label="Open immunization schedule" onPress={() => router.push(`/mch/immunization?patientId=${registration.mother}&registrationId=${registration.id}` as never)} variant="secondary" />
      </SectionCard>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    alertRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    helperText: {
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 18,
    },
    heroPills: {
      gap: 8,
    },
    noteText: {
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
    },
    timelineCard: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      gap: 8,
      padding: 14,
    },
    timelineTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    timelineTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
  });
}