import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppPicker, AppTextInput, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { toApiError } from '@/lib/api/client';
import { encountersApi } from '@/lib/api/encounters';
import { notifyErrorHaptic, notifySuccessHaptic, notifyWarningHaptic } from '@/lib/haptics';
import { laboratoryApi } from '@/lib/api/laboratory';
import { patientsApi } from '@/lib/api/patients';
import { queryClient } from '@/lib/query/client';
import type { LabOrderCreateData, LabPriority, LabTest } from '@/lib/types/laboratory';
import { useAppTheme } from '@/lib/theme/theme-context';
import { buildPatientName } from '@/lib/utils/format';

type SelectedTest = {
  test_code: string;
  name: string;
  special_instructions: string;
};

const ORDER_TYPE_OPTIONS = [
  { label: 'In-house processing', value: 'IN_HOUSE' },
  { label: 'External lab referral', value: 'EXTERNAL' },
] as const;

const PRIORITY_OPTIONS = [
  { label: 'Routine', value: 'ROUTINE' },
  { label: 'Urgent', value: 'URGENT' },
  { label: 'STAT', value: 'STAT' },
] as const;

export default function NewLaboratoryOrderScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{ encounterId?: string; patientId?: string }>();
  const encounterId = params.encounterId ? Number(params.encounterId) : 0;
  const initialPatientId = params.patientId ? Number(params.patientId) : 0;
  const [patientId, setPatientId] = useState(initialPatientId || 0);
  const [orderType, setOrderType] = useState<(typeof ORDER_TYPE_OPTIONS)[number]['value']>('IN_HOUSE');
  const [priority, setPriority] = useState<LabPriority>('ROUTINE');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [externalLab, setExternalLab] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedTests, setSelectedTests] = useState<SelectedTest[]>([]);

  const encounterQuery = useQuery({
    queryKey: ['laboratory-order-encounter', encounterId],
    queryFn: () => encountersApi.get(encounterId),
    enabled: Boolean(encounterId),
  });

  const patientsQuery = useQuery({
    queryKey: ['laboratory-order-patients'],
    queryFn: () => patientsApi.list({ page: 1, page_size: 100, ordering: '-created_at' }),
  });

  const testsQuery = useQuery({
    queryKey: ['laboratory-tests', searchTerm, selectedCategory],
    queryFn: () =>
      laboratoryApi.listTests({
        search: searchTerm.trim() || undefined,
        category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
      }),
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

  const categoryOptions = useMemo(() => {
    const categories = Array.from(
      new Set((testsQuery.data ?? []).map((test) => test.category).filter(Boolean))
    ) as string[];
    return [{ label: 'All categories', value: 'ALL' }, ...categories.map((category) => ({ label: category.replace(/_/g, ' '), value: category }))];
  }, [testsQuery.data]);

  const createMutation = useMutation({
    mutationFn: (payload: LabOrderCreateData) => laboratoryApi.createOrder(payload),
    onSuccess: async (order) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lab-orders'] }),
        order.encounter ? queryClient.invalidateQueries({ queryKey: ['encounter-lab-orders', order.encounter] }) : Promise.resolve(),
      ]);
      router.replace(`/laboratory/${encodeURIComponent(order.order_number)}` as never);
    },
  });

  function toggleTest(test: LabTest) {
    setSelectedTests((current) => {
      const exists = current.some((entry) => entry.test_code === test.code);
      if (exists) {
        return current.filter((entry) => entry.test_code !== test.code);
      }
      return [...current, { test_code: test.code, name: test.name, special_instructions: '' }];
    });
  }

  function updateSelectedTest(testCode: string, nextInstructions: string) {
    setSelectedTests((current) =>
      current.map((entry) =>
        entry.test_code === testCode ? { ...entry, special_instructions: nextInstructions } : entry
      )
    );
  }

  async function handleCreateOrder() {
    const resolvedPatientId = encounterQuery.data?.patient || patientId;

    if (!resolvedPatientId) {
      await notifyWarningHaptic();
      Alert.alert('Patient required', 'Select the patient linked to this laboratory order.');
      return;
    }

    if (selectedTests.length === 0) {
      await notifyWarningHaptic();
      Alert.alert('Tests required', 'Select at least one test from the laboratory catalog.');
      return;
    }

    try {
      await createMutation.mutateAsync({
        patient: resolvedPatientId,
        encounter: encounterId || undefined,
        order_type: orderType,
        external_lab: orderType === 'EXTERNAL' ? externalLab.trim() || undefined : undefined,
        priority,
        clinical_notes: clinicalNotes.trim() || undefined,
        items: selectedTests.map((test) => ({
          test_code: test.test_code,
          special_instructions: test.special_instructions.trim() || undefined,
        })),
      });
      await notifySuccessHaptic();
    } catch (error) {
      await notifyErrorHaptic();
      Alert.alert('Unable to create lab order', toApiError(error).message);
    }
  }

  if (patientsQuery.isLoading || encounterQuery.isLoading) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState message="Preparing laboratory order form..." fullScreen />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="New lab order"
        title="Request laboratory tests"
        description="Select tests from the catalog, add clinical context, and link the order to an encounter when needed."
      />

      <SectionCard title="Order details">
        <AppPicker
          label="Patient"
          selectedValue={encounterQuery.data?.patient || patientId}
          onValueChange={(value) => setPatientId(value)}
          items={patientOptions}
          enabled={!encounterQuery.data}
        />
        <AppPicker label="Order type" selectedValue={orderType} onValueChange={(value) => setOrderType(value as (typeof ORDER_TYPE_OPTIONS)[number]['value'])} items={ORDER_TYPE_OPTIONS as unknown as { label: string; value: string }[]} />
        {orderType === 'EXTERNAL' ? (
          <AppTextInput label="External lab" value={externalLab} onChangeText={setExternalLab} placeholder="e.g. KEMRI Reference Lab" />
        ) : null}
        <AppPicker label="Priority" selectedValue={priority} onValueChange={(value) => setPriority(value as LabPriority)} items={PRIORITY_OPTIONS as unknown as { label: string; value: string }[]} />
        <AppTextInput label="Clinical notes" value={clinicalNotes} onChangeText={setClinicalNotes} placeholder="Reason for ordering, symptoms, relevant findings" multiline />
      </SectionCard>

      <SectionCard title="Find tests" subtitle="Search the test catalog and add one or more tests to this order.">
        <AppTextInput label="Search tests" value={searchTerm} onChangeText={setSearchTerm} placeholder="FBC, malaria, chemistry panel" />
        <AppPicker label="Category" selectedValue={selectedCategory} onValueChange={(value) => setSelectedCategory(value as string)} items={categoryOptions} />
        {testsQuery.isLoading ? (
          <LoadingState message="Loading available tests..." />
        ) : (
          (testsQuery.data ?? []).slice(0, 20).map((test) => {
            const selected = selectedTests.some((entry) => entry.test_code === test.code);
            return (
              <Pressable key={test.code} onPress={() => toggleTest(test)} style={({ pressed }) => [styles.catalogCard, pressed && styles.cardPressed, selected && styles.catalogCardSelected]}>
                <View style={styles.rowBetween}>
                  <View style={styles.flexOne}>
                    <Text style={styles.cardTitle}>{test.name}</Text>
                    <Text style={styles.cardMeta}>{test.code} · {test.category || 'General'} · {test.specimen_type || 'Specimen TBD'}</Text>
                  </View>
                  <Pill label={selected ? 'Selected' : 'Add'} tone={selected ? 'primary' : 'neutral'} />
                </View>
              </Pressable>
            );
          })
        )}
      </SectionCard>

      <SectionCard title="Selected tests" subtitle="Add any test-specific collection notes before submitting the order.">
        {selectedTests.length === 0 ? (
          <Text style={styles.helperText}>No tests selected yet.</Text>
        ) : (
          selectedTests.map((test) => (
            <View key={test.test_code} style={styles.selectedCard}>
              <View style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>{test.name}</Text>
                  <Text style={styles.cardMeta}>{test.test_code}</Text>
                </View>
                <AppButton label="Remove" variant="ghost" onPress={() => setSelectedTests((current) => current.filter((entry) => entry.test_code !== test.test_code))} />
              </View>
              <AppTextInput
                label="Special instructions"
                value={test.special_instructions}
                onChangeText={(value) => updateSelectedTest(test.test_code, value)}
                placeholder="Fasting, timing, specimen notes"
                multiline
              />
            </View>
          ))
        )}
      </SectionCard>

      <AppButton label={createMutation.isPending ? 'Creating order...' : 'Create lab order'} onPress={handleCreateOrder} disabled={createMutation.isPending} />
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    catalogCard: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      padding: 14,
    },
    catalogCardSelected: {
      borderColor: theme.colors.primary,
    },
    selectedCard: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      gap: 10,
      padding: 14,
    },
    cardPressed: {
      opacity: 0.84,
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
      fontSize: 14,
    },
  });
}