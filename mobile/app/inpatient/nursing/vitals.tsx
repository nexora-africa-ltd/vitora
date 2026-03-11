import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppPicker,
  AppTextInput,
  LoadingState,
  MetricCard,
  Pill,
  ScreenContainer,
  SectionCard,
} from '@/components/app-ui';
import { VitalsChart } from '@/components/vitals-chart';
import type { AppTheme } from '@/constants/theme';
import { nursingApi } from '@/lib/api/nursing';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { FluidBalanceEntry, FluidEntryType } from '@/lib/types/inpatient';

const FLUID_ENTRY_TYPES: { label: string; value: FluidEntryType }[] = [
  { label: 'IV (Intravenous)', value: 'INTRAVENOUS' },
  { label: 'Oral (Alimentary)', value: 'ALIMENTARY' },
  { label: 'Other intake', value: 'OTHER_INTAKE' },
  { label: 'Urine', value: 'URINE' },
  { label: 'Vomit', value: 'VOMIT' },
  { label: 'Stool', value: 'STOOL' },
  { label: 'Nasogastric', value: 'NASOGASTRIC' },
  { label: 'Other output', value: 'OTHER_OUTPUT' },
];

const INTAKE_TYPES = new Set<FluidEntryType>(['INTRAVENOUS', 'ALIMENTARY', 'OTHER_INTAKE']);

export default function VitalsScreen() {
  const { admission } = useLocalSearchParams<{ admission: string }>();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  // ── Temperature readings ──
  const tprQuery = useQuery({
    queryKey: ['inpatient', 'tpr', admission],
    queryFn: () => nursingApi.listTemperatureReadings(Number(admission)),
    enabled: !!admission,
  });

  // ── Fluid balance ──
  const fluidQuery = useQuery({
    queryKey: ['inpatient', 'fluid', admission],
    queryFn: () => nursingApi.listFluidBalanceSheets(Number(admission)),
    enabled: !!admission,
  });

  // ── New TPR form ──
  const [showTpr, setShowTpr] = useState(false);
  const [temp, setTemp] = useState('');
  const [pulse, setPulse] = useState('');
  const [rr, setRr] = useState('');

  const tprMutation = useMutation({
    mutationFn: () =>
      nursingApi.createTemperatureReading({
        admission: Number(admission),
        temperature: parseFloat(temp),
        pulse: parseInt(pulse, 10),
        respiratory_rate: parseInt(rr, 10),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'tpr', admission] });
      setTemp('');
      setPulse('');
      setRr('');
      setShowTpr(false);
      Alert.alert('Saved', 'TPR reading recorded.');
    },
    onError: () => Alert.alert('Error', 'Failed to save reading.'),
  });

  // ── New fluid entry form ──
  const [showFluid, setShowFluid] = useState(false);
  const [fluidType, setFluidType] = useState<FluidEntryType>('INTRAVENOUS');
  const [fluidAmount, setFluidAmount] = useState('');
  const [fluidNotes, setFluidNotes] = useState('');

  const fluidMutation = useMutation({
    mutationFn: () => {
      const sheets = fluidQuery.data?.results ?? [];
      if (sheets.length === 0) {
        return Promise.reject(new Error('No fluid balance sheet exists for today.'));
      }
      return nursingApi.createFluidBalanceEntry({
        sheet: sheets[0].id,
        entry_type: fluidType,
        amount_ml: parseInt(fluidAmount, 10),
        notes: fluidNotes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'fluid', admission] });
      setFluidAmount('');
      setFluidNotes('');
      setShowFluid(false);
      Alert.alert('Saved', 'Fluid balance entry recorded.');
    },
    onError: (error: Error) => Alert.alert('Error', error.message || 'Failed to save entry.'),
  });

  const tprReadings = tprQuery.data?.results ?? [];
  const fluidSheets = fluidQuery.data?.results ?? [];
  const todaySheet = fluidSheets[0];

  const isLoading = tprQuery.isLoading || fluidQuery.isLoading;

  return (
    <ScreenContainer>
      {isLoading && <LoadingState message="Loading vitals..." />}

      {/* TPR Chart */}
      <SectionCard title="Temperature / Pulse / RR" subtitle="TPR trending over admission.">
        <AppButton
          label={showTpr ? 'Cancel' : 'Record TPR'}
          onPress={() => setShowTpr(!showTpr)}
          variant={showTpr ? 'ghost' : 'secondary'}
        />

        {showTpr && (
          <View style={styles.formBlock}>
            <AppTextInput label="Temperature (°C)" value={temp} onChangeText={setTemp} keyboardType="numeric" placeholder="e.g. 37.2" />
            <AppTextInput label="Pulse (BPM)" value={pulse} onChangeText={setPulse} keyboardType="numeric" placeholder="e.g. 80" />
            <AppTextInput label="Respiratory rate" value={rr} onChangeText={setRr} keyboardType="numeric" placeholder="e.g. 18" />
            <AppButton
              label={tprMutation.isPending ? 'Saving...' : 'Save TPR'}
              onPress={() => tprMutation.mutate()}
              disabled={tprMutation.isPending || !temp || !pulse || !rr}
            />
          </View>
        )}

        <VitalsChart readings={tprReadings} />
      </SectionCard>

      {/* Fluid Balance */}
      <SectionCard title="Fluid balance" subtitle="Intake and output monitoring.">
        {todaySheet && (
          <View style={styles.fluidSummaryRow}>
            <View style={styles.fluidMetric}>
              <MetricCard label="Intake (ml)" value={String(todaySheet.total_intake)} tone="primary" />
            </View>
            <View style={styles.fluidMetric}>
              <MetricCard label="Output (ml)" value={String(todaySheet.total_output)} tone="accent" />
            </View>
            <View style={styles.fluidMetric}>
              <MetricCard
                label="Balance (ml)"
                value={`${todaySheet.balance >= 0 ? '+' : ''}${todaySheet.balance}`}
                tone={todaySheet.balance >= 0 ? 'primary' : 'secondary'}
              />
            </View>
          </View>
        )}

        <AppButton
          label={showFluid ? 'Cancel' : 'Add fluid entry'}
          onPress={() => setShowFluid(!showFluid)}
          variant={showFluid ? 'ghost' : 'secondary'}
        />

        {showFluid && (
          <View style={styles.formBlock}>
            <AppPicker label="Type" selectedValue={fluidType} items={FLUID_ENTRY_TYPES} onValueChange={setFluidType} />
            <AppTextInput label="Amount (ml)" value={fluidAmount} onChangeText={setFluidAmount} keyboardType="numeric" placeholder="e.g. 500" />
            <AppTextInput label="Notes (optional)" value={fluidNotes} onChangeText={setFluidNotes} placeholder="Additional notes..." />
            <AppButton
              label={fluidMutation.isPending ? 'Saving...' : 'Save entry'}
              onPress={() => fluidMutation.mutate()}
              disabled={fluidMutation.isPending || !fluidAmount}
            />
          </View>
        )}

        {todaySheet && todaySheet.entries.length > 0 && (
          <View style={styles.entriesList}>
            {todaySheet.entries.map((entry) => (
              <FluidEntryRow key={entry.id} entry={entry} styles={styles} theme={theme} />
            ))}
          </View>
        )}

        {(!todaySheet || todaySheet.entries.length === 0) && !isLoading && (
          <Text style={styles.emptyText}>No fluid balance entries for today.</Text>
        )}
      </SectionCard>
    </ScreenContainer>
  );
}

function FluidEntryRow({ entry, styles, theme }: { entry: FluidBalanceEntry; styles: ReturnType<typeof createStyles>; theme: AppTheme }) {
  const isIntake = INTAKE_TYPES.has(entry.entry_type);
  return (
    <View style={styles.entryRow}>
      <Pill label={isIntake ? 'IN' : 'OUT'} tone={isIntake ? 'primary' : 'warning'} />
      <View style={styles.entryInfo}>
        <Text style={styles.entryType}>{entry.entry_type_display ?? entry.entry_type}</Text>
        <Text style={styles.entryTime}>{new Date(entry.time_recorded).toLocaleTimeString()}</Text>
      </View>
      <Text style={styles.entryAmount}>{entry.amount_ml} ml</Text>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    formBlock: {
      backgroundColor: theme.colors.elevated,
      borderRadius: theme.radius.md,
      gap: theme.spacing.md,
      padding: theme.spacing.md,
    },
    fluidSummaryRow: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    fluidMetric: {
      flex: 1,
    },
    entriesList: {
      gap: 2,
    },
    entryRow: {
      alignItems: 'center',
      borderBottomColor: theme.colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 8,
      paddingVertical: theme.spacing.sm,
    },
    entryInfo: {
      flex: 1,
      gap: 2,
    },
    entryType: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    entryTime: {
      color: theme.colors.mutedText,
      fontSize: 11,
    },
    entryAmount: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    emptyText: {
      color: theme.colors.mutedText,
      fontSize: 14,
    },
  });
}
