import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppPicker, AppTextInput, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { toApiError } from '@/lib/api/client';
import { encountersApi } from '@/lib/api/encounters';
import { notifyErrorHaptic, notifySuccessHaptic, notifyWarningHaptic } from '@/lib/haptics';
import { patientsApi } from '@/lib/api/patients';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { queryClient } from '@/lib/query/client';
import type { DrugProduct, PrescriptionCreateData, PrescriptionItemInput } from '@/lib/types/pharmacy';
import { useAppTheme } from '@/lib/theme/theme-context';
import { buildPatientName, formatDate } from '@/lib/utils/format';

type DraftItem = PrescriptionItemInput & { drugName: string };

function normalizeSearchValue(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

function pickBestDrugMatch(drugs: DrugProduct[], medicationName: string): DrugProduct | null {
  const normalizedMedicationName = normalizeSearchValue(medicationName);
  if (!normalizedMedicationName) {
    return null;
  }

  const exact = drugs.find((drug) =>
    [drug.generic_name, drug.display_name, drug.brand_names]
      .map((value) => normalizeSearchValue(value))
      .some((value) => value === normalizedMedicationName)
  );
  if (exact) {
    return exact;
  }

  const contains = drugs.find((drug) =>
    [drug.generic_name, drug.display_name, drug.brand_names]
      .map((value) => normalizeSearchValue(value))
      .some((value) => value.includes(normalizedMedicationName) || normalizedMedicationName.includes(value))
  );

  return contains || drugs[0] || null;
}

function toQuantity(value?: string | null): number {
  if (!value) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default function NewPrescriptionScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{ encounterId?: string; patientId?: string }>();
  const encounterId = params.encounterId ? Number(params.encounterId) : 0;
  const initialPatientId = params.patientId ? Number(params.patientId) : 0;
  const [patientId, setPatientId] = useState(initialPatientId || 0);
  const [validUntil, setValidUntil] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<DraftItem[]>([]);
  const [autofillState, setAutofillState] = useState<{ attempted: boolean; isRunning: boolean; matched: number; unmatched: string[] }>({
    attempted: false,
    isRunning: false,
    matched: 0,
    unmatched: [],
  });

  const encounterQuery = useQuery({
    queryKey: ['pharmacy-encounter', encounterId],
    queryFn: () => encountersApi.get(encounterId),
    enabled: Boolean(encounterId),
  });

  const treatmentPlanQuery = useQuery({
    queryKey: ['pharmacy-encounter-treatment-plan', encounterId],
    queryFn: () => encountersApi.getTreatmentPlan(encounterId),
    enabled: Boolean(encounterId),
  });

  const patientsQuery = useQuery({
    queryKey: ['pharmacy-patients'],
    queryFn: () => patientsApi.list({ page: 1, page_size: 100, ordering: '-created_at' }),
  });

  const drugSearchQuery = useQuery({
    queryKey: ['pharmacy-drug-search', searchTerm],
    queryFn: () => pharmacyApi.searchDrugs(searchTerm),
    enabled: searchTerm.trim().length >= 2,
  });

  const patientOptions = useMemo(() => {
    const entries = new Map<number, { label: string; value: number }>();
    entries.set(0, { label: 'Select patient', value: 0 });

    if (encounterQuery.data) {
      entries.set(encounterQuery.data.patient, {
        label: `${encounterQuery.data.patient_name || 'Encounter patient'} · ${encounterQuery.data.patient_mrn || 'MRN pending'}`,
        value: encounterQuery.data.patient,
      });
    }

    for (const patient of patientsQuery.data?.results ?? []) {
      entries.set(patient.id, {
        label: `${buildPatientName(patient)} · ${patient.mrn}`,
        value: patient.id,
      });
    }

    return Array.from(entries.values());
  }, [encounterQuery.data, patientsQuery.data?.results]);

  const createMutation = useMutation({
    mutationFn: (payload: PrescriptionCreateData) => pharmacyApi.createPrescription(payload),
    onSuccess: async (prescription) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['prescriptions'] }),
        prescription.encounter
          ? queryClient.invalidateQueries({ queryKey: ['encounter-prescriptions', prescription.encounter] })
          : Promise.resolve(),
      ]);
      router.replace(`/pharmacy/${prescription.id}` as never);
    },
  });

  useEffect(() => {
    let active = true;

    async function hydrateFromTreatmentPlan() {
      const medications = treatmentPlanQuery.data?.medications ?? [];
      if (!encounterId || autofillState.attempted || medications.length === 0 || selectedItems.length > 0) {
        return;
      }

      setAutofillState((current) => ({ ...current, attempted: true, isRunning: true }));

      if (!clinicalNotes.trim() && treatmentPlanQuery.data?.clinical_notes) {
        setClinicalNotes(treatmentPlanQuery.data.clinical_notes);
      }

      const draftItems: DraftItem[] = [];
      const unmatched: string[] = [];

      for (const medication of medications) {
        try {
          const drugs = await pharmacyApi.searchDrugs(medication.name);
          const match = pickBestDrugMatch(drugs, medication.name);

          if (!match) {
            unmatched.push(medication.name);
            continue;
          }

          if (draftItems.some((item) => item.drug === match.id)) {
            continue;
          }

          draftItems.push({
            drug: match.id,
            drugName: match.display_name,
            quantity: toQuantity(medication.quantity),
            dosage: medication.dosage || match.strength || '',
            frequency: medication.frequency || '',
            duration: medication.duration || '',
            route: medication.route || '',
            instructions: medication.instructions || '',
            is_substitutable: true,
          });
        } catch {
          unmatched.push(medication.name);
        }
      }

      if (!active) {
        return;
      }

      if (draftItems.length > 0) {
        setSelectedItems(draftItems);
      }

      setAutofillState({
        attempted: true,
        isRunning: false,
        matched: draftItems.length,
        unmatched,
      });
    }

    void hydrateFromTreatmentPlan();

    return () => {
      active = false;
    };
  }, [autofillState.attempted, clinicalNotes, encounterId, selectedItems.length, treatmentPlanQuery.data]);

  function addDrug(drug: DrugProduct) {
    setSelectedItems((current) => {
      if (current.some((item) => item.drug === drug.id)) {
        return current;
      }
      return [
        ...current,
        {
          drug: drug.id,
          drugName: drug.display_name,
          quantity: 1,
          dosage: drug.strength || '',
          frequency: '',
          duration: '',
          route: '',
          instructions: '',
          is_substitutable: true,
        },
      ];
    });
  }

  function updateItem(drugId: number, patch: Partial<DraftItem>) {
    setSelectedItems((current) =>
      current.map((item) => (item.drug === drugId ? { ...item, ...patch } : item))
    );
  }

  async function submitPrescription(acknowledgeWarnings = false) {
    const resolvedPatientId = encounterQuery.data?.patient || patientId;

    if (!resolvedPatientId) {
      await notifyWarningHaptic();
      Alert.alert('Patient required', 'Select the patient for this prescription.');
      return;
    }

    if (selectedItems.length === 0) {
      await notifyWarningHaptic();
      Alert.alert('Medication required', 'Add at least one drug to the prescription.');
      return;
    }

    const invalidItem = selectedItems.find(
      (item) => !item.quantity || !item.frequency.trim() || !item.duration.trim()
    );
    if (invalidItem) {
      await notifyWarningHaptic();
      Alert.alert('Incomplete medication item', 'Each medication needs quantity, frequency, and duration before saving.');
      return;
    }

    try {
      await createMutation.mutateAsync({
        encounter: encounterId || undefined,
        patient: resolvedPatientId,
        valid_until: validUntil.trim() || undefined,
        clinical_notes: clinicalNotes.trim() || undefined,
        acknowledge_allergy_warnings: acknowledgeWarnings,
        items: selectedItems.map(({ drugName: _drugName, ...item }) => item),
      });
      await notifySuccessHaptic();
    } catch (error) {
      const apiError = toApiError(error);
      const details = apiError.details as { allergy_warnings?: unknown[]; message?: string } | undefined;
      if (apiError.status === 400 && details?.allergy_warnings?.length) {
        await notifyWarningHaptic();
        Alert.alert(
          'Allergy warning',
          details.message || 'A recorded patient allergy may conflict with this prescription. Proceed only if clinically appropriate.',
          [
            { text: 'Review items', style: 'cancel' },
            {
              text: 'Proceed anyway',
              onPress: () => {
                void submitPrescription(true);
              },
            },
          ]
        );
        return;
      }

      await notifyErrorHaptic();
      Alert.alert('Unable to create prescription', apiError.message);
    }
  }

  if (patientsQuery.isLoading || encounterQuery.isLoading || treatmentPlanQuery.isLoading) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState message="Preparing prescription form..." fullScreen />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="New prescription"
        title="Prescribe medications"
        description="Search the formulary, map treatment-plan intent to stocked drugs, and send the prescription straight into the dispensing queue."
      />

      <SectionCard title="Prescription details">
        <AppPicker
          label="Patient"
          selectedValue={encounterQuery.data?.patient || patientId}
          onValueChange={(value) => setPatientId(value)}
          items={patientOptions}
          enabled={!encounterQuery.data}
        />
        <AppTextInput label="Valid until" value={validUntil} onChangeText={setValidUntil} placeholder="YYYY-MM-DD (optional)" autoCapitalize="none" />
        <AppTextInput label="Clinical notes" value={clinicalNotes} onChangeText={setClinicalNotes} placeholder="Counselling notes, medication context, allergy handling" multiline />
      </SectionCard>

      {treatmentPlanQuery.data ? (
        <SectionCard title="Treatment plan context" subtitle="These medications were documented in the encounter plan and can guide your formulary search.">
          {autofillState.isRunning ? <Text style={styles.helperText}>Matching treatment-plan medications to stocked drugs...</Text> : null}
          {!autofillState.isRunning && autofillState.attempted && autofillState.matched > 0 ? (
            <Text style={styles.helperText}>{autofillState.matched} medication draft{autofillState.matched === 1 ? '' : 's'} auto-populated from the treatment plan.</Text>
          ) : null}
          {!autofillState.isRunning && autofillState.unmatched.length > 0 ? (
            <Text style={styles.helperText}>No formulary match found yet for: {autofillState.unmatched.join(', ')}.</Text>
          ) : null}
          {(treatmentPlanQuery.data.medications ?? []).length === 0 ? (
            <Text style={styles.helperText}>No medications are recorded on the encounter treatment plan yet.</Text>
          ) : (
            treatmentPlanQuery.data.medications.map((medication) => (
              <View key={medication.id} style={styles.planMedication}>
                <Text style={styles.cardTitle}>{medication.name}</Text>
                <Text style={styles.cardMeta}>{medication.dosage} · {medication.frequency} · {medication.duration}</Text>
              </View>
            ))
          )}
        </SectionCard>
      ) : null}

      <SectionCard title="Find drugs" subtitle="Search by generic name, brand name, or code and add stocked drugs to the prescription.">
        <AppTextInput label="Drug search" value={searchTerm} onChangeText={setSearchTerm} placeholder="Paracetamol, amoxicillin, PCM500" />
        {searchTerm.trim().length < 2 ? (
          <Text style={styles.helperText}>Enter at least 2 characters to search the formulary.</Text>
        ) : drugSearchQuery.isLoading ? (
          <LoadingState message="Searching formulary..." />
        ) : (
          (drugSearchQuery.data ?? []).map((drug) => (
            <Pressable key={drug.id} onPress={() => addDrug(drug)} style={({ pressed }) => [styles.searchResultCard, pressed && styles.cardPressed]}>
              <View style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>{drug.display_name}</Text>
                  <Text style={styles.cardMeta}>{drug.code} · {drug.current_stock} in stock · {drug.category || 'General'}</Text>
                </View>
                <Pill label={selectedItems.some((item) => item.drug === drug.id) ? 'Added' : 'Add'} tone={selectedItems.some((item) => item.drug === drug.id) ? 'primary' : drug.current_stock > 0 ? 'neutral' : 'danger'} />
              </View>
            </Pressable>
          ))
        )}
      </SectionCard>

      <SectionCard title="Prescription items" subtitle="Enter dispensing-relevant details for every selected drug.">
        {selectedItems.length === 0 ? (
          <Text style={styles.helperText}>No drugs added yet.</Text>
        ) : (
          selectedItems.map((item) => (
            <View key={item.drug} style={styles.selectedCard}>
              <View style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>{item.drugName}</Text>
                  <Text style={styles.cardMeta}>Quantity {item.quantity}</Text>
                </View>
                <AppButton label="Remove" variant="ghost" onPress={() => setSelectedItems((current) => current.filter((entry) => entry.drug !== item.drug))} />
              </View>
              <AppTextInput label="Quantity" value={String(item.quantity)} onChangeText={(value) => updateItem(item.drug, { quantity: Number(value || '0') || 0 })} keyboardType="numeric" autoCapitalize="none" />
              <AppTextInput label="Dosage" value={item.dosage} onChangeText={(value) => updateItem(item.drug, { dosage: value })} placeholder="e.g. 500mg" />
              <AppTextInput label="Frequency" value={item.frequency} onChangeText={(value) => updateItem(item.drug, { frequency: value })} placeholder="e.g. TDS" />
              <AppTextInput label="Duration" value={item.duration} onChangeText={(value) => updateItem(item.drug, { duration: value })} placeholder="e.g. 5 days" />
              <AppTextInput label="Route" value={item.route || ''} onChangeText={(value) => updateItem(item.drug, { route: value })} placeholder="e.g. oral" />
              <AppTextInput label="Instructions" value={item.instructions || ''} onChangeText={(value) => updateItem(item.drug, { instructions: value })} placeholder="e.g. after meals" multiline />
            </View>
          ))
        )}
      </SectionCard>

      <Text style={styles.helperText}>If you leave valid until blank, the backend will default to 30 days from today ({formatDate(new Date().toISOString())}).</Text>
      <AppButton label={createMutation.isPending ? 'Creating prescription...' : 'Create prescription'} onPress={() => void submitPrescription()} disabled={createMutation.isPending} />
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    searchResultCard: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      padding: 14,
    },
    selectedCard: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      gap: 10,
      padding: 14,
    },
    planMedication: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      gap: 4,
      padding: 14,
    },
    rowBetween: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    flexOne: {
      flex: 1,
      marginRight: 12,
    },
    cardPressed: {
      opacity: 0.84,
    },
    cardTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '700',
    },
    cardMeta: {
      color: theme.colors.mutedText,
      fontSize: 12,
    },
    helperText: {
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 18,
    },
  });
}