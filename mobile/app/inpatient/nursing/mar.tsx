import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppPicker,
  AppTextInput,
  EmptyState,
  LoadingState,
  Pill,
  ScreenContainer,
  SectionCard,
} from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { inpatientApi } from '@/lib/api/inpatient';
import { nursingApi } from '@/lib/api/nursing';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { MARStatus, MedicationAdministration } from '@/lib/types/inpatient';

const STATUS_TONE: Record<MARStatus, 'primary' | 'warning' | 'danger' | 'neutral'> = {
  SCHEDULED: 'neutral',
  GIVEN: 'primary',
  SKIPPED: 'warning',
  REFUSED: 'danger',
  HELD: 'warning',
  VOMITED: 'danger',
};

const ACTION_ITEMS: { label: string; value: MARStatus }[] = [
  { label: 'Given', value: 'GIVEN' },
  { label: 'Skipped', value: 'SKIPPED' },
  { label: 'Refused', value: 'REFUSED' },
  { label: 'Held', value: 'HELD' },
  { label: 'Vomited', value: 'VOMITED' },
];

export default function MARScreen() {
  const { admission: admissionId } = useLocalSearchParams<{ admission: string }>();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const admissionQuery = useQuery({
    queryKey: ['inpatient', 'admission', admissionId],
    queryFn: () => inpatientApi.getAdmission(Number(admissionId)),
    enabled: !!admissionId,
  });

  const marQuery = useQuery({
    queryKey: ['inpatient', 'mar', admissionId],
    queryFn: () => nursingApi.listMedicationAdministrations({ admission: Number(admissionId), page_size: 100 }),
    enabled: !!admissionId,
  });

  const admission = admissionQuery.data;
  const entries = marQuery.data?.results ?? [];
  const scheduledEntries = entries.filter((e) => e.status === 'SCHEDULED');
  const completedEntries = entries.filter((e) => e.status !== 'SCHEDULED');

  // ── Action state ──
  const [actionEntry, setActionEntry] = useState<MedicationAdministration | null>(null);
  const [actionStatus, setActionStatus] = useState<MARStatus>('GIVEN');
  const [actionDose, setActionDose] = useState('');
  const [actionNotes, setActionNotes] = useState('');

  const recordMutation = useMutation({
    mutationFn: () => {
      if (!actionEntry) return Promise.reject(new Error('No entry selected'));
      return nursingApi.recordAdministration(actionEntry.id, {
        status: actionStatus as 'GIVEN' | 'SKIPPED' | 'REFUSED' | 'HELD' | 'VOMITED',
        dose_given: actionDose || undefined,
        notes: actionNotes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'mar', admissionId] });
      setActionEntry(null);
      setActionDose('');
      setActionNotes('');
      Alert.alert('Recorded', 'Medication administration updated.');
    },
    onError: () => Alert.alert('Error', 'Failed to record administration.'),
  });

  if (admissionQuery.isLoading || marQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading medications..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <SectionCard
        title="Medication Administration"
        subtitle={admission?.patient_name ?? `Admission #${admissionId}`}
      >
        <View style={styles.summaryRow}>
          <Pill label={`${scheduledEntries.length} scheduled`} tone="neutral" />
          <Pill label={`${completedEntries.length} recorded`} tone="primary" />
          {entries.filter((e) => e.is_overdue).length > 0 && (
            <Pill label={`${entries.filter((e) => e.is_overdue).length} overdue`} tone="danger" />
          )}
        </View>
      </SectionCard>

      {/* Action dialog */}
      {actionEntry && (
        <SectionCard title="Record administration" subtitle={actionEntry.drug_name || `Item #${actionEntry.prescription_item}`}>
          <Text style={styles.actionSchedule}>
            Scheduled: {new Date(actionEntry.scheduled_time).toLocaleString()}
          </Text>
          <AppPicker
            label="Status"
            selectedValue={actionStatus}
            items={ACTION_ITEMS}
            onValueChange={(v) => setActionStatus(v as MARStatus)}
          />
          {actionStatus === 'GIVEN' && (
            <AppTextInput
              label="Dose given"
              value={actionDose}
              onChangeText={setActionDose}
              placeholder="e.g. 500mg"
            />
          )}
          <AppTextInput
            label="Notes (optional)"
            value={actionNotes}
            onChangeText={setActionNotes}
            placeholder="Reason for skipping, patient response..."
            multiline
          />
          <View style={styles.actionButtons}>
            <AppButton
              label="Cancel"
              onPress={() => setActionEntry(null)}
              variant="ghost"
            />
            <AppButton
              label={recordMutation.isPending ? 'Saving...' : 'Confirm'}
              onPress={() => recordMutation.mutate()}
              disabled={recordMutation.isPending}
            />
          </View>
        </SectionCard>
      )}

      {/* Scheduled medications */}
      <SectionCard title="Scheduled" subtitle={`${scheduledEntries.length} pending dose(s)`}>
        {scheduledEntries.length === 0 && (
          <EmptyState
            title="No scheduled doses"
            description="MAR entries appear here when medications are scheduled for this admission via the pharmacy module."
          />
        )}
        {scheduledEntries.map((entry) => (
          <MAREntryRow
            key={entry.id}
            entry={entry}
            styles={styles}
            theme={theme}
            onAction={() => {
              setActionEntry(entry);
              setActionStatus('GIVEN');
              setActionDose(entry.dose_given || '');
              setActionNotes('');
            }}
          />
        ))}
      </SectionCard>

      {/* Completed medications */}
      {completedEntries.length > 0 && (
        <SectionCard title="Recorded" subtitle={`${completedEntries.length} administration(s)`}>
          {completedEntries.map((entry) => (
            <MAREntryRow key={entry.id} entry={entry} styles={styles} theme={theme} />
          ))}
        </SectionCard>
      )}
    </ScreenContainer>
  );
}

function MAREntryRow({
  entry,
  styles,
  theme,
  onAction,
}: {
  entry: MedicationAdministration;
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
  onAction?: () => void;
}) {
  const isScheduled = entry.status === 'SCHEDULED';

  return (
    <Pressable
      style={({ pressed }) => [styles.entryRow, pressed && isScheduled && styles.entryRowPressed]}
      onPress={isScheduled ? onAction : undefined}
      disabled={!isScheduled}
    >
      <View style={styles.entryContent}>
        <View style={styles.entryHeader}>
          <Text style={styles.drugName}>{entry.drug_name || `Rx item #${entry.prescription_item}`}</Text>
          <Pill label={entry.status_display ?? entry.status} tone={STATUS_TONE[entry.status]} />
        </View>
        <Text style={styles.entryMeta}>
          {entry.dose_given ? `${entry.dose_given}` : ''}
          {entry.route ? ` · ${entry.route}` : ''}
        </Text>
        <Text style={styles.entryTime}>
          Scheduled: {new Date(entry.scheduled_time).toLocaleString()}
          {entry.actual_time ? ` · Actual: ${new Date(entry.actual_time).toLocaleString()}` : ''}
        </Text>
        {entry.administered_by_username && (
          <Text style={styles.entryNurse}>By: {entry.administered_by_username}</Text>
        )}
        {entry.notes ? <Text style={styles.entryNotes}>{entry.notes}</Text> : null}
        {entry.is_prn && <Pill label="PRN" tone="warning" />}
        {entry.is_overdue && <Pill label="Overdue" tone="danger" />}
      </View>
    </Pressable>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    summaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    actionSchedule: {
      color: theme.colors.mutedText,
      fontSize: 13,
    },
    actionButtons: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      justifyContent: 'flex-end',
    },
    entryRow: {
      borderBottomColor: theme.colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingVertical: theme.spacing.md,
    },
    entryRowPressed: {
      opacity: 0.7,
    },
    entryContent: {
      gap: 4,
    },
    entryHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    drugName: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
    },
    entryMeta: {
      color: theme.colors.text,
      fontSize: 13,
    },
    entryTime: {
      color: theme.colors.mutedText,
      fontSize: 12,
    },
    entryNurse: {
      color: theme.colors.mutedText,
      fontSize: 12,
    },
    entryNotes: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontStyle: 'italic',
    },
  });
}
