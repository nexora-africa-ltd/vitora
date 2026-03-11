import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, EmptyState, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import { SyncIndicator } from '@/components/sync-indicator';
import type { AppTheme } from '@/constants/theme';
import { getEncounterPillTone, getEncounterStatusLabel } from '@/lib/encounters';
import { useLocalEncounters } from '@/lib/hooks/use-local-encounters';
import { useAppTheme } from '@/lib/theme/theme-context';
import { formatDateTime } from '@/lib/utils/format';

export default function EncountersScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const encountersQuery = useLocalEncounters({ limit: 20 });

  if (encountersQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Fetching encounter activity..." />
      </ScreenContainer>
    );
  }

  const encounters = encountersQuery.encounters;

  return (
    <ScreenContainer>
      <SyncIndicator />

      <SectionCard title="Encounter actions" subtitle="Start a new visit or continue reviewing active ones.">
        <AppButton label="New encounter" onPress={() => router.push('/encounters/new' as never)} />
      </SectionCard>

      <SectionCard title="Encounters" subtitle="This view is now local-first and keeps queued offline visits visible until they reach the server.">
        {encounters.length === 0 ? (
          <EmptyState title="No encounters yet" description="Once clinicians create encounters from the backend, they will appear here." />
        ) : (
          encounters.map((encounter) => (
            <Pressable
              key={encounter.id}
              onPress={() => router.push(`/encounters/${encounter.id}` as never)}
              style={({ pressed }) => [styles.encounterCard, pressed && styles.cardPressed]}
            >
              <View style={styles.encounterTopRow}>
                <View style={styles.titleBlock}>
                  <Text style={styles.encounterTitle}>{encounter.patient_name || 'Unknown patient'}</Text>
                  <Text style={styles.encounterMeta}>{encounter.patient_mrn || 'MRN pending'} · {encounter.encounter_type}</Text>
                </View>
                <View style={styles.statusStack}>
                  {encounter.sync_state !== 'synced' ? <Pill label="Queued" tone={encounter.sync_state === 'conflict' ? 'danger' : 'warning'} /> : null}
                  <Pill label={getEncounterStatusLabel(encounter.status)} tone={getEncounterPillTone(encounter)} />
                </View>
              </View>
              {encounter.triage_category ? (
                <View style={styles.triageRow}>
                  <Pill label={`Triage ${encounter.triage_category}`} tone={encounter.triage_category === 'RED' || encounter.triage_category === 'ORANGE' ? 'danger' : encounter.triage_category === 'YELLOW' ? 'warning' : 'neutral'} />
                </View>
              ) : null}
              <Text style={styles.chiefComplaint}>{encounter.chief_complaint}</Text>
              {encounter.alerts ? <Text style={styles.alertText}>{encounter.alerts}</Text> : null}
              <Text style={styles.encounterMeta}>Created {formatDateTime(encounter.created_at)}</Text>
            </Pressable>
          ))
        )}
      </SectionCard>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  encounterCard: {
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  cardPressed: {
    opacity: 0.82,
  },
  encounterTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusStack: {
    alignItems: 'flex-end',
    gap: 6,
  },
  titleBlock: {
    flex: 1,
    marginRight: 12,
  },
  encounterTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  encounterMeta: {
    color: theme.colors.mutedText,
    fontSize: 12,
  },
  chiefComplaint: {
    color: theme.colors.text,
    fontSize: 14,
  },
  triageRow: {
    alignItems: 'flex-start',
  },
  alertText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  });
}