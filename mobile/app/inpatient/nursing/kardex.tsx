import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppPicker,
  AppTextInput,
  DataRow,
  LoadingState,
  Pill,
  ScreenContainer,
  SectionCard,
} from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { nursingApi } from '@/lib/api/nursing';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { CarePlanStatus, KardexShiftNote, NursingCarePlanEntry } from '@/lib/types/inpatient';

const CARE_PLAN_STATUSES: { label: string; value: CarePlanStatus }[] = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Ongoing', value: 'ONGOING' },
  { label: 'Resolved', value: 'RESOLVED' },
];

export default function KardexScreen() {
  const { admission } = useLocalSearchParams<{ admission: string }>();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const kardexQuery = useQuery({
    queryKey: ['inpatient', 'kardex', admission],
    queryFn: () => nursingApi.getKardex(Number(admission)),
    enabled: !!admission,
  });

  // ── Shift note form ──
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteShift, setNoteShift] = useState<'DAY' | 'NIGHT'>('DAY');
  const [noteText, setNoteText] = useState('');

  const addNoteMutation = useMutation({
    mutationFn: () =>
      nursingApi.addShiftNote(kardexQuery.data!.id, { shift: noteShift, note: noteText }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'kardex', admission] });
      setNoteText('');
      setShowNoteForm(false);
      Alert.alert('Saved', 'Shift note added.');
    },
    onError: () => Alert.alert('Error', 'Failed to save shift note.'),
  });

  // ── Care plan form ──
  const [showCarePlan, setShowCarePlan] = useState(false);
  const [cpAssessment, setCpAssessment] = useState('');
  const [cpDiagnosis, setCpDiagnosis] = useState('');
  const [cpGoal, setCpGoal] = useState('');
  const [cpPlan, setCpPlan] = useState('');
  const [cpImplementation, setCpImplementation] = useState('');
  const [cpEvaluation, setCpEvaluation] = useState('');
  const [cpStatus, setCpStatus] = useState<CarePlanStatus>('ACTIVE');

  const addCarePlanMutation = useMutation({
    mutationFn: () =>
      nursingApi.addCarePlanEntry(kardexQuery.data!.id, {
        assessment: cpAssessment || undefined,
        nursing_diagnosis: cpDiagnosis || undefined,
        goal_and_outcome_criteria: cpGoal || undefined,
        plan_of_action: cpPlan || undefined,
        implementation: cpImplementation || undefined,
        evaluation: cpEvaluation || undefined,
        status: cpStatus,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'kardex', admission] });
      setCpAssessment('');
      setCpDiagnosis('');
      setCpGoal('');
      setCpPlan('');
      setCpImplementation('');
      setCpEvaluation('');
      setCpStatus('ACTIVE');
      setShowCarePlan(false);
      Alert.alert('Saved', 'Care plan entry added.');
    },
    onError: () => Alert.alert('Error', 'Failed to save care plan entry.'),
  });

  if (kardexQuery.isLoading) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState message="Loading kardex..." fullScreen />
      </ScreenContainer>
    );
  }

  const kardex = kardexQuery.data;

  if (!kardex) {
    return (
      <ScreenContainer>
        <SectionCard title="Kardex not found">
          <Text style={{ color: theme.colors.mutedText }}>No nursing kardex available for this admission.</Text>
        </SectionCard>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Patient info */}
      <SectionCard title={kardex.patient_name ?? 'Nursing Kardex'} subtitle={`${kardex.ward_name ?? ''} · Bed ${kardex.bed_number ?? '—'}`}>
        <DataRow label="Mobility" value={kardex.mobility_status} />
        <DataRow label="Diet" value={kardex.dietary_requirements} />
        <DataRow label="Allergies" value={kardex.allergies} />
        <DataRow label="IV access" value={kardex.iv_access} />
        <View style={styles.riskRow}>
          {kardex.fall_risk && (
            <Pill
              label={`Fall risk: ${kardex.fall_risk_display ?? kardex.fall_risk}`}
              tone={kardex.fall_risk === 'HIGH' ? 'danger' : kardex.fall_risk === 'MODERATE' ? 'warning' : 'neutral'}
            />
          )}
          {kardex.pressure_sore_risk && (
            <Pill
              label={`Pressure sore: ${kardex.pressure_sore_risk_display ?? kardex.pressure_sore_risk}`}
              tone={kardex.pressure_sore_risk === 'HIGH' ? 'danger' : kardex.pressure_sore_risk === 'MODERATE' ? 'warning' : 'neutral'}
            />
          )}
        </View>
        {kardex.isolation_required && (
          <Pill label={`Isolation: ${kardex.isolation_type ?? 'Required'}`} tone="danger" />
        )}
      </SectionCard>

      {/* Shift notes */}
      <SectionCard title="Shift notes" subtitle={`${kardex.shift_notes.length} note(s)`}>
        <AppButton
          label={showNoteForm ? 'Cancel' : 'Add shift note'}
          onPress={() => setShowNoteForm(!showNoteForm)}
          variant={showNoteForm ? 'ghost' : 'secondary'}
        />

        {showNoteForm && (
          <View style={styles.formBlock}>
            <AppPicker
              label="Shift"
              selectedValue={noteShift}
              items={[
                { label: 'Day', value: 'DAY' as const },
                { label: 'Night', value: 'NIGHT' as const },
              ]}
              onValueChange={setNoteShift}
            />
            <AppTextInput label="Note" value={noteText} onChangeText={setNoteText} placeholder="Enter nursing note..." multiline />
            <AppButton
              label={addNoteMutation.isPending ? 'Saving...' : 'Save note'}
              onPress={() => addNoteMutation.mutate()}
              disabled={addNoteMutation.isPending || !noteText.trim()}
            />
          </View>
        )}

        {kardex.shift_notes.map((note) => (
          <ShiftNoteCard key={note.id} note={note} styles={styles} theme={theme} />
        ))}
      </SectionCard>

      {/* Care plan */}
      <SectionCard title="Care plan (ADPIE)" subtitle={`${kardex.care_plan_entries.length} entries`}>
        <AppButton
          label={showCarePlan ? 'Cancel' : 'Add care plan entry'}
          onPress={() => setShowCarePlan(!showCarePlan)}
          variant={showCarePlan ? 'ghost' : 'secondary'}
        />

        {showCarePlan && (
          <View style={styles.formBlock}>
            <AppTextInput label="Assessment" value={cpAssessment} onChangeText={setCpAssessment} placeholder="Patient assessment..." multiline />
            <AppTextInput label="Nursing diagnosis" value={cpDiagnosis} onChangeText={setCpDiagnosis} placeholder="Nursing diagnosis..." multiline />
            <AppTextInput label="Goal/Outcome criteria" value={cpGoal} onChangeText={setCpGoal} placeholder="Expected outcome..." multiline />
            <AppTextInput label="Plan of action" value={cpPlan} onChangeText={setCpPlan} placeholder="Planned interventions..." multiline />
            <AppTextInput label="Implementation" value={cpImplementation} onChangeText={setCpImplementation} placeholder="Actions taken..." multiline />
            <AppTextInput label="Evaluation" value={cpEvaluation} onChangeText={setCpEvaluation} placeholder="Outcome evaluation..." multiline />
            <AppPicker label="Status" selectedValue={cpStatus} items={CARE_PLAN_STATUSES} onValueChange={setCpStatus} />
            <AppButton
              label={addCarePlanMutation.isPending ? 'Saving...' : 'Save entry'}
              onPress={() => addCarePlanMutation.mutate()}
              disabled={addCarePlanMutation.isPending}
            />
          </View>
        )}

        {kardex.care_plan_entries.map((entry) => (
          <CarePlanCard key={entry.id} entry={entry} styles={styles} theme={theme} />
        ))}
      </SectionCard>
    </ScreenContainer>
  );
}

function ShiftNoteCard({ note, styles, theme }: { note: KardexShiftNote; styles: ReturnType<typeof createStyles>; theme: AppTheme }) {
  return (
    <View style={styles.noteCard}>
      <View style={styles.noteHeader}>
        <Pill label={note.shift} tone={note.shift === 'DAY' ? 'primary' : 'neutral'} />
        <Text style={styles.noteTime}>{new Date(note.recorded_at).toLocaleString()}</Text>
      </View>
      <Text style={styles.noteText}>{note.note}</Text>
      {note.recorded_by_username && (
        <Text style={styles.noteAuthor}>— {note.recorded_by_username}</Text>
      )}
    </View>
  );
}

function CarePlanCard({ entry, styles, theme }: { entry: NursingCarePlanEntry; styles: ReturnType<typeof createStyles>; theme: AppTheme }) {
  return (
    <View style={styles.noteCard}>
      <View style={styles.noteHeader}>
        <Pill
          label={entry.status_display ?? entry.status}
          tone={entry.status === 'ACTIVE' ? 'primary' : entry.status === 'ONGOING' ? 'warning' : 'neutral'}
        />
        <Text style={styles.noteTime}>{new Date(entry.recorded_at).toLocaleString()}</Text>
      </View>
      {entry.assessment && <DataRow label="Assessment" value={entry.assessment} />}
      {entry.nursing_diagnosis && <DataRow label="Diagnosis" value={entry.nursing_diagnosis} />}
      {entry.goal_and_outcome_criteria && <DataRow label="Goal" value={entry.goal_and_outcome_criteria} />}
      {entry.plan_of_action && <DataRow label="Plan" value={entry.plan_of_action} />}
      {entry.implementation && <DataRow label="Implementation" value={entry.implementation} />}
      {entry.evaluation && <DataRow label="Evaluation" value={entry.evaluation} />}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    riskRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    formBlock: {
      backgroundColor: theme.colors.elevated,
      borderRadius: theme.radius.md,
      gap: theme.spacing.md,
      padding: theme.spacing.md,
    },
    noteCard: {
      borderBottomColor: theme.colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 6,
      paddingVertical: theme.spacing.md,
    },
    noteHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'space-between',
    },
    noteTime: {
      color: theme.colors.mutedText,
      fontSize: 11,
    },
    noteText: {
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
    },
    noteAuthor: {
      color: theme.colors.mutedText,
      fontSize: 12,
      fontStyle: 'italic',
    },
  });
}
