import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppButton, AppPicker, AppTextInput, HeroCard, LoadingState, ScreenContainer, SectionCard } from '@/components/app-ui';
import { toApiError } from '@/lib/api/client';
import { locationsApi } from '@/lib/api/locations';
import { patientsApi } from '@/lib/api/patients';
import { getOfflineCounties, getOfflineSubCounties, getOfflineWards, queueOfflinePatientCreate, upsertPatients, upsertReferenceData } from '@/lib/db';
import { notifyErrorHaptic, notifySuccessHaptic, notifyWarningHaptic } from '@/lib/haptics';
import { queryClient } from '@/lib/query/client';
import { isOfflineSyncError } from '@/lib/sync/conflicts';

type FormState = {
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'M' | 'F' | 'O';
  phoneNumber: string;
  identificationType: string;
  identificationNumber: string;
  county: number;
  subCounty: number;
  ward: number;
  village: string;
  referralSource: 'self' | 'clinic' | 'other_facility';
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
};

const initialFormState: FormState = {
  firstName: '',
  middleName: '',
  lastName: '',
  dateOfBirth: '',
  gender: 'M',
  phoneNumber: '',
  identificationType: 'national_id',
  identificationNumber: '',
  county: 0,
  subCounty: 0,
  ward: 0,
  village: '',
  referralSource: 'self',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelationship: '',
};

export default function NewPatientScreen() {
  const [form, setForm] = useState<FormState>(initialFormState);

  const countiesQuery = useQuery({
    queryKey: ['counties'],
    queryFn: async () => {
      const cached = await getOfflineCounties();
      if (cached.length > 0) {
        return cached;
      }

      const remote = await locationsApi.getCounties();
      await upsertReferenceData({ counties: remote });
      return remote;
    },
  });

  const subCountiesQuery = useQuery({
    queryKey: ['sub-counties', form.county],
    queryFn: async () => {
      const cached = await getOfflineSubCounties(form.county);
      if (cached.length > 0) {
        return cached;
      }

      const remote = await locationsApi.getSubCounties(form.county);
      await upsertReferenceData({ subCounties: remote });
      return remote;
    },
    enabled: Boolean(form.county),
  });

  const wardsQuery = useQuery({
    queryKey: ['wards', form.subCounty],
    queryFn: async () => {
      const cached = await getOfflineWards(form.subCounty);
      if (cached.length > 0) {
        return cached;
      }

      const remote = await locationsApi.getWards(form.subCounty);
      await upsertReferenceData({ wards: remote });
      return remote;
    },
    enabled: Boolean(form.subCounty),
  });

  useEffect(() => {
    setForm((current) => ({ ...current, subCounty: 0, ward: 0 }));
  }, [form.county]);

  useEffect(() => {
    setForm((current) => ({ ...current, ward: 0 }));
  }, [form.subCounty]);

  const createPatientMutation = useMutation({
    mutationFn: () =>
      patientsApi.create({
        first_name: form.firstName.trim(),
        middle_name: form.middleName.trim() || undefined,
        last_name: form.lastName.trim(),
        date_of_birth: form.dateOfBirth.trim(),
        gender: form.gender,
        phone_number: form.phoneNumber.trim() || undefined,
        identification_type: form.identificationType || undefined,
        identification_number: form.identificationNumber.trim() || undefined,
        county: form.county,
        sub_county: form.subCounty,
        ward: form.ward || undefined,
        village: form.village.trim() || undefined,
        referral_source: form.referralSource,
        emergency_contact_name: form.emergencyContactName.trim() || undefined,
        emergency_contact_phone: form.emergencyContactPhone.trim() || undefined,
        emergency_contact_relationship: form.emergencyContactRelationship.trim() || undefined,
      }),
    onSuccess: async (patient) => {
      await upsertPatients([patient]);
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      router.replace(`/patients/${patient.id}` as never);
    },
  });

  const countyItems = useMemo(
    () => [{ label: 'Select county', value: 0 }, ...(countiesQuery.data ?? []).map((county) => ({ label: county.name, value: county.id }))],
    [countiesQuery.data]
  );

  const subCountyItems = useMemo(
    () => [{ label: 'Select sub-county', value: 0 }, ...(subCountiesQuery.data ?? []).map((subCounty) => ({ label: subCounty.name, value: subCounty.id }))],
    [subCountiesQuery.data]
  );

  const wardItems = useMemo(
    () => [{ label: 'Optional ward', value: 0 }, ...(wardsQuery.data ?? []).map((ward) => ({ label: ward.name, value: ward.id }))],
    [wardsQuery.data]
  );

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleCreatePatient() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.dateOfBirth.trim() || !form.county || !form.subCounty) {
      await notifyWarningHaptic();
      Alert.alert('Missing required fields', 'First name, last name, date of birth, county, and sub-county are required.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth.trim())) {
      await notifyWarningHaptic();
      Alert.alert('Invalid date', 'Use YYYY-MM-DD for date of birth.');
      return;
    }

    try {
      await createPatientMutation.mutateAsync();
      await notifySuccessHaptic();
    } catch (error) {
      const apiError = toApiError(error);
      if (isOfflineSyncError(apiError)) {
        const queuedPatient = await queueOfflinePatientCreate({
          first_name: form.firstName.trim(),
          middle_name: form.middleName.trim() || undefined,
          last_name: form.lastName.trim(),
          date_of_birth: form.dateOfBirth.trim(),
          gender: form.gender,
          phone_number: form.phoneNumber.trim() || undefined,
          identification_type: form.identificationType || undefined,
          identification_number: form.identificationNumber.trim() || undefined,
          county: form.county,
          sub_county: form.subCounty,
          ward: form.ward || undefined,
          village: form.village.trim() || undefined,
          referral_source: form.referralSource,
          emergency_contact_name: form.emergencyContactName.trim() || undefined,
          emergency_contact_phone: form.emergencyContactPhone.trim() || undefined,
          emergency_contact_relationship: form.emergencyContactRelationship.trim() || undefined,
        });
        await notifySuccessHaptic();
        Alert.alert('Saved offline', 'The patient was stored on this device and will sync automatically when connectivity returns.');
        router.replace(`/patients/${queuedPatient.id}` as never);
        return;
      }

      await notifyErrorHaptic();
      Alert.alert('Unable to create patient', apiError.message || 'The backend rejected the registration payload.');
    }
  }

  if (countiesQuery.isLoading) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState message="Loading Kenya location data..." fullScreen />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="New registration"
        title="Create patient record"
        description="This mobile form now stores patients locally first when needed, then syncs them to /api/patients/ once connectivity returns."
      />

      <SectionCard title="Identity">
        <AppTextInput label="First name" value={form.firstName} onChangeText={(value) => updateField('firstName', value)} placeholder="Jane" />
        <AppTextInput label="Middle name" value={form.middleName} onChangeText={(value) => updateField('middleName', value)} placeholder="Wanjiku" />
        <AppTextInput label="Last name" value={form.lastName} onChangeText={(value) => updateField('lastName', value)} placeholder="Mwangi" />
        <AppTextInput label="Date of birth" value={form.dateOfBirth} onChangeText={(value) => updateField('dateOfBirth', value)} placeholder="1990-01-01" autoCapitalize="none" />
        <AppPicker label="Gender" selectedValue={form.gender} onValueChange={(value) => updateField('gender', value)} items={[
          { label: 'Male', value: 'M' },
          { label: 'Female', value: 'F' },
          { label: 'Other', value: 'O' },
        ]} />
        <AppPicker label="Identification type" selectedValue={form.identificationType} onValueChange={(value) => updateField('identificationType', value)} items={[
          { label: 'National ID', value: 'national_id' },
          { label: 'Passport', value: 'passport' },
          { label: 'Birth certificate', value: 'birth_certificate' },
          { label: 'Temporary ID', value: 'temporary_id' },
        ]} />
        <AppTextInput label="Identification number" value={form.identificationNumber} onChangeText={(value) => updateField('identificationNumber', value)} placeholder="12345678" autoCapitalize="none" />
      </SectionCard>

      <SectionCard title="Contact and location">
        <AppTextInput label="Phone number" value={form.phoneNumber} onChangeText={(value) => updateField('phoneNumber', value)} placeholder="0712345678" keyboardType="phone-pad" autoCapitalize="none" />
        <AppPicker label="County" selectedValue={form.county} onValueChange={(value) => updateField('county', value)} items={countyItems} />
        <AppPicker label="Sub-county" selectedValue={form.subCounty} onValueChange={(value) => updateField('subCounty', value)} items={subCountyItems} enabled={Boolean(form.county)} />
        <AppPicker label="Ward" selectedValue={form.ward} onValueChange={(value) => updateField('ward', value)} items={wardItems} enabled={Boolean(form.subCounty)} />
        <AppTextInput label="Village" value={form.village} onChangeText={(value) => updateField('village', value)} placeholder="Village or landmark" />
        <AppPicker label="Referral source" selectedValue={form.referralSource} onValueChange={(value) => updateField('referralSource', value)} items={[
          { label: 'Self', value: 'self' },
          { label: 'Clinic', value: 'clinic' },
          { label: 'Other facility', value: 'other_facility' },
        ]} />
      </SectionCard>

      <SectionCard title="Emergency contact">
        <AppTextInput label="Contact name" value={form.emergencyContactName} onChangeText={(value) => updateField('emergencyContactName', value)} placeholder="Contact full name" />
        <AppTextInput label="Contact phone" value={form.emergencyContactPhone} onChangeText={(value) => updateField('emergencyContactPhone', value)} placeholder="0700000000" keyboardType="phone-pad" autoCapitalize="none" />
        <AppTextInput label="Relationship" value={form.emergencyContactRelationship} onChangeText={(value) => updateField('emergencyContactRelationship', value)} placeholder="Sister" />
      </SectionCard>

      <View style={styles.actions}>
        <AppButton label={createPatientMutation.isPending ? 'Creating patient...' : 'Create patient'} onPress={handleCreatePatient} disabled={createPatientMutation.isPending} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  actions: {
    paddingBottom: 24,
  },
});
