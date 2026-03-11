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
import type { WardRound } from '@/lib/types/inpatient';

type ConditionStatus = 'STABLE' | 'IMPROVING' | 'DETERIORATING' | 'CRITICAL';

const CONDITION_STATUS_ITEMS: { label: string; value: ConditionStatus }[] = [
  { label: 'Stable', value: 'STABLE' },
  { label: 'Improving', value: 'IMPROVING' },
  { label: 'Deteriorating', value: 'DETERIORATING' },
  { label: 'Critical', value: 'CRITICAL' },
];

const CONDITION_TONE: Record<string, 'primary' | 'warning' | 'danger' | 'neutral'> = {
  STABLE: 'neutral',
  IMPROVING: 'primary',
  DETERIORATING: 'warning',
  CRITICAL: 'danger',
};

export default function WardRoundsScreen() {
  const { admission } = useLocalSearchParams<{ admission: string }>();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const roundsQuery = useQuery({
    queryKey: ['inpatient', 'ward-rounds', admission],
    queryFn: () => nursingApi.listWardRounds({ admission: Number(admission) }),
    enabled: !!admission,
  });

  // ── New round form ──
  const [showForm, setShowForm] = useState(false);
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [conditionStatus, setConditionStatus] = useState<ConditionStatus>('STABLE');

  const createMutation = useMutation({
    mutationFn: () =>
      nursingApi.createWardRound({
        admission: Number(admission),
        round_date: new Date().toISOString().slice(0, 10),
        round_time: new Date().toTimeString().slice(0, 5),
        subjective: subjective || undefined,
        objective: objective || undefined,
        assessment: assessment || undefined,
        plan: plan || undefined,
        condition_status: conditionStatus,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inpatient', 'ward-rounds', admission] });
      setSubjective('');
      setObjective('');
      setAssessment('');
      setPlan('');
      setShowForm(false);
      Alert.alert('Saved', 'Ward round notes recorded.');
    },
    onError: () => Alert.alert('Error', 'Failed to save ward round.'),
  });

  const rounds = roundsQuery.data?.results ?? [];

  return (
    <ScreenContainer>
      <SectionCard title="Ward rounds" subtitle="SOAP-format ward round documentation.">
        <AppButton
          label={showForm ? 'Cancel' : 'New ward round'}
          onPress={() => setShowForm(!showForm)}
          variant={showForm ? 'ghost' : 'primary'}
        />
      </SectionCard>

      {showForm && (
        <SectionCard title="New round" subtitle="Record your clinical findings using SOAP format.">
          <AppTextInput label="Subjective" value={subjective} onChangeText={setSubjective} placeholder="Patient's reported symptoms..." multiline />
          <AppTextInput label="Objective" value={objective} onChangeText={setObjective} placeholder="Clinical findings, vitals, exam..." multiline />
          <AppTextInput label="Assessment" value={assessment} onChangeText={setAssessment} placeholder="Clinical assessment..." multiline />
          <AppTextInput label="Plan" value={plan} onChangeText={setPlan} placeholder="Treatment plan, orders, follow-up..." multiline />
          <AppPicker
            label="Condition status"
            selectedValue={conditionStatus}
            items={CONDITION_STATUS_ITEMS}
            onValueChange={setConditionStatus}
          />
          <AppButton
            label={createMutation.isPending ? 'Saving...' : 'Save round'}
            onPress={() => createMutation.mutate()}
            disabled={createMutation.isPending || (!subjective.trim() && !objective.trim() && !assessment.trim() && !plan.trim())}
          />
        </SectionCard>
      )}

      {roundsQuery.isLoading && <LoadingState message="Loading rounds..." />}

      {rounds.length === 0 && !roundsQuery.isLoading && (
        <SectionCard title="No rounds">
          <Text style={{ color: theme.colors.mutedText }}>No ward rounds recorded for this admission.</Text>
        </SectionCard>
      )}

      {rounds.map((round) => (
        <RoundCard key={round.id} round={round} styles={styles} theme={theme} />
      ))}
    </ScreenContainer>
  );
}

function RoundCard({ round, styles, theme }: { round: WardRound; styles: ReturnType<typeof createStyles>; theme: AppTheme }) {
  return (
    <SectionCard title={`${round.round_date}${round.round_time ? ` at ${round.round_time}` : ''}`}>
      {round.conducted_by_username && (
        <Text style={styles.doctor}>Dr. {round.conducted_by_username}</Text>
      )}
      {round.subjective && <DataRow label="S — Subjective" value={round.subjective} />}
      {round.objective && <DataRow label="O — Objective" value={round.objective} />}
      {round.assessment && <DataRow label="A — Assessment" value={round.assessment} />}
      {round.plan && <DataRow label="P — Plan" value={round.plan} />}
      {round.condition_status && (
        <View style={styles.conditionRow}>
          <Text style={styles.conditionLabel}>Condition</Text>
          <Pill label={round.condition_status} tone={CONDITION_TONE[round.condition_status] ?? 'neutral'} />
        </View>
      )}
    </SectionCard>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    doctor: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: '600',
    },
    conditionRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingTop: 4,
    },
    conditionLabel: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: '500',
    },
  });
}
