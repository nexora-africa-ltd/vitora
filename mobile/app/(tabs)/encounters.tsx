import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, EmptyState, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import { appTheme } from '@/constants/theme';
import { getEncounterPillTone, getEncounterStatusLabel } from '@/lib/encounters';
import { encountersApi } from '@/lib/api/encounters';
import { formatDateTime } from '@/lib/utils/format';

export default function EncountersScreen() {
  const encountersQuery = useQuery({
    queryKey: ['encounters'],
    queryFn: () => encountersApi.list({ page: 1, page_size: 20, ordering: '-encounter_date' }),
  });

  if (encountersQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Fetching encounter activity..." />
      </ScreenContainer>
    );
  }

  const encounters = encountersQuery.data?.results ?? [];

  return (
    <ScreenContainer>
      <SectionCard title="Encounter actions" subtitle="Start a new visit or continue reviewing active ones.">
        <AppButton label="New encounter" onPress={() => router.push('/encounters/new' as never)} />
      </SectionCard>

      <SectionCard title="Encounters" subtitle="This view is fed directly from /api/encounters/ and highlights active clinical work.">
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
                <Pill label={getEncounterStatusLabel(encounter.status)} tone={getEncounterPillTone(encounter)} />
              </View>
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

const styles = StyleSheet.create({
  encounterCard: {
    backgroundColor: appTheme.colors.elevated,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
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
  titleBlock: {
    flex: 1,
    marginRight: 12,
  },
  encounterTitle: {
    color: appTheme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  encounterMeta: {
    color: appTheme.colors.mutedText,
    fontSize: 12,
  },
  chiefComplaint: {
    color: appTheme.colors.text,
    fontSize: 14,
  },
  alertText: {
    color: appTheme.colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
});