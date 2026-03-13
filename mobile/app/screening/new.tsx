import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppPicker, AppSearchablePicker, AppTextInput, HeroCard, LoadingState, ScreenContainer, SectionCard } from '@/components/app-ui';
import { CameraCapture } from '@/components/camera-capture';
import type { AppTheme } from '@/constants/theme';
import { screeningApi } from '@/lib/api/screening';
import { useLocalPatient, useLocalPatients } from '@/lib/hooks/use-local-patients';
import { notifyErrorHaptic, notifySuccessHaptic } from '@/lib/haptics';
import { captureCurrentLocation } from '@/lib/location';
import type { CommunityScreeningType, MalariaRdtResult, ScreeningPhotoAttachment } from '@/lib/types/screening';
import { useAppTheme } from '@/lib/theme/theme-context';
import { buildPatientName } from '@/lib/utils/format';

function toOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function NewScreeningScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{ patientId?: string }>();
  const initialPatientId = params.patientId ? Number(params.patientId) : 0;
  const patientsQuery = useLocalPatients({ limit: 100 });
  const selectedPatientQuery = useLocalPatient(initialPatientId);

  const [patientId, setPatientId] = useState(initialPatientId || 0);
  const [screeningType, setScreeningType] = useState<CommunityScreeningType>('MALNUTRITION');
  const [chuName, setChuName] = useState('');
  const [territory, setTerritory] = useState('');
  const [muacMm, setMuacMm] = useState('');
  const [edemaPresent, setEdemaPresent] = useState<'yes' | 'no'>('no');
  const [coughDurationDays, setCoughDurationDays] = useState('');
  const [householdContactName, setHouseholdContactName] = useState('');
  const [tbReferralMade, setTbReferralMade] = useState<'yes' | 'no'>('no');
  const [feverPresent, setFeverPresent] = useState<'yes' | 'no'>('yes');
  const [malariaRdtResult, setMalariaRdtResult] = useState<MalariaRdtResult>('not_done');
  const [malariaTreatmentReferred, setMalariaTreatmentReferred] = useState<'yes' | 'no'>('no');
  const [notes, setNotes] = useState('');
  const [locationLabel, setLocationLabel] = useState('No coordinates captured yet');
  const [location, setLocation] = useState<Awaited<ReturnType<typeof captureCurrentLocation>> | null>(null);
  const [photo, setPhoto] = useState<ScreeningPhotoAttachment | null>(null);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const selectedPatient = useLocalPatient(patientId).patient ?? selectedPatientQuery.patient;

  const patientItems = useMemo(
    () => [{ label: 'Unlinked field client', value: 0 }, ...patientsQuery.patients.map((patient) => ({ label: `${buildPatientName(patient)} · ${patient.mrn}`, value: patient.id }))],
    [patientsQuery.patients]
  );

  async function handleCaptureLocation() {
    setIsCapturingLocation(true);
    try {
      const capturedLocation = await captureCurrentLocation();
      setLocation(capturedLocation);
      setLocationLabel(`${capturedLocation.latitude.toFixed(5)}, ${capturedLocation.longitude.toFixed(5)}`);
    } catch (error) {
      Alert.alert('Unable to capture location', error instanceof Error ? error.message : 'Location capture failed.');
    } finally {
      setIsCapturingLocation(false);
    }
  }

  async function handleSaveScreening() {
    try {
      const record = await screeningApi.createScreening({
        chu_name: chuName,
        territory,
        patient: patientId || null,
        patient_mrn: selectedPatient?.mrn ?? null,
        patient_name: selectedPatient ? buildPatientName(selectedPatient) : null,
        screening_type: screeningType,
        location,
        photo,
        notes,
        muac_mm: screeningType === 'MALNUTRITION' ? toOptionalNumber(muacMm) : null,
        edema_present: screeningType === 'MALNUTRITION' ? edemaPresent === 'yes' : null,
        cough_duration_days: screeningType === 'TB_CONTACT' ? toOptionalNumber(coughDurationDays) : null,
        household_contact_name: screeningType === 'TB_CONTACT' ? householdContactName : '',
        tb_referral_made: screeningType === 'TB_CONTACT' ? tbReferralMade === 'yes' : null,
        fever_present: screeningType === 'MALARIA_RDT' ? feverPresent === 'yes' : null,
        malaria_rdt_result: screeningType === 'MALARIA_RDT' ? malariaRdtResult : null,
        malaria_treatment_referred: screeningType === 'MALARIA_RDT' ? malariaTreatmentReferred === 'yes' : null,
      });

      await notifySuccessHaptic();
      Alert.alert(
        record.sync_status === 'uploaded' ? 'Screening uploaded' : 'Screening saved offline',
        record.sync_status === 'uploaded'
          ? 'The field screening was sent to the HMIS backend and stored in the local cache.'
          : 'The field screening was saved on the device and queued for upload when connectivity returns.'
      );
      router.replace('/screening' as never);
      return record;
    } catch (error) {
      await notifyErrorHaptic();
      Alert.alert('Unable to save screening', error instanceof Error ? error.message : 'Screening save failed.');
    }
  }

  if (patientsQuery.isLoading) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState message="Preparing screening form..." fullScreen />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Field outreach"
        title="Community screening"
        description="Capture malnutrition, TB contact tracing, or malaria RDT findings while fully offline."
      />

      <SectionCard title="Visit context">
        <AppSearchablePicker label="Patient" selectedValue={patientId} onValueChange={setPatientId} items={patientItems} placeholder="Search by name or MRN…" />
        <AppPicker label="Screening type" selectedValue={screeningType} onValueChange={(value) => setScreeningType(value)} items={[
          { label: 'Malnutrition screening', value: 'MALNUTRITION' },
          { label: 'TB contact tracing', value: 'TB_CONTACT' },
          { label: 'Malaria RDT', value: 'MALARIA_RDT' },
        ]} />
        <AppTextInput label="Community Health Unit (CHU)" value={chuName} onChangeText={setChuName} placeholder="Kayole CHU 4" />
        <AppTextInput label="Territory / village" value={territory} onChangeText={setTerritory} placeholder="Village, landmark, or cluster" />
      </SectionCard>

      {screeningType === 'MALNUTRITION' ? (
        <SectionCard title="Malnutrition screening">
          <AppTextInput label="MUAC (mm)" value={muacMm} onChangeText={setMuacMm} keyboardType="numeric" autoCapitalize="none" />
          <AppPicker label="Bilateral edema present" selectedValue={edemaPresent} onValueChange={(value) => setEdemaPresent(value)} items={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]} />
        </SectionCard>
      ) : null}

      {screeningType === 'TB_CONTACT' ? (
        <SectionCard title="TB contact tracing">
          <AppTextInput label="Cough duration (days)" value={coughDurationDays} onChangeText={setCoughDurationDays} keyboardType="numeric" autoCapitalize="none" />
          <AppTextInput label="Index contact / household contact" value={householdContactName} onChangeText={setHouseholdContactName} placeholder="Name or household reference" />
          <AppPicker label="Referral made" selectedValue={tbReferralMade} onValueChange={(value) => setTbReferralMade(value)} items={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]} />
        </SectionCard>
      ) : null}

      {screeningType === 'MALARIA_RDT' ? (
        <SectionCard title="Malaria RDT screening">
          <AppPicker label="Fever present" selectedValue={feverPresent} onValueChange={(value) => setFeverPresent(value)} items={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]} />
          <AppPicker label="RDT result" selectedValue={malariaRdtResult} onValueChange={(value) => setMalariaRdtResult(value)} items={[
            { label: 'Not done', value: 'not_done' },
            { label: 'Positive', value: 'positive' },
            { label: 'Negative', value: 'negative' },
            { label: 'Invalid', value: 'invalid' },
          ]} />
          <AppPicker label="Treatment or referral made" selectedValue={malariaTreatmentReferred} onValueChange={(value) => setMalariaTreatmentReferred(value)} items={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]} />
        </SectionCard>
      ) : null}

      <SectionCard title="GPS capture" subtitle="Attach field coordinates to the screening submission.">
        <AppButton label={isCapturingLocation ? 'Capturing GPS...' : 'Capture location'} onPress={() => void handleCaptureLocation()} disabled={isCapturingLocation} />
        <View style={styles.locationShell}>
          <Text style={styles.helperText}>{locationLabel}</Text>
        </View>
      </SectionCard>

      <CameraCapture value={photo} onChange={setPhoto} />

      <SectionCard title="Notes">
        <AppTextInput label="Field notes" value={notes} onChangeText={setNotes} multiline placeholder="Symptoms, referral notes, household context, or follow-up plan" />
        <AppButton label="Save screening offline" onPress={() => void handleSaveScreening()} />
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
    locationShell: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      padding: 12,
    },
  });
}