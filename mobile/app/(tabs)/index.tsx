import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, HeroCard, LoadingState, MetricCard, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import { appTheme } from '@/constants/theme';
import { encountersApi } from '@/lib/api/encounters';
import { patientsApi } from '@/lib/api/patients';
import { useAuth } from '@/lib/auth/auth-context';
import { formatDateTime } from '@/lib/utils/format';

export default function DashboardScreen() {
  const { apiBaseUrl, user } = useAuth();

  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const [patients, encounters] = await Promise.all([
        patientsApi.list({ page: 1, page_size: 1 }),
        encountersApi.list({ page: 1, page_size: 5, ordering: '-encounter_date' }),
      ]);

      return {
        patientCount: patients.count,
        encounterCount: encounters.count,
        recentEncounters: encounters.results,
      };
    },
  });

  if (summaryQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading the mobile clinical dashboard..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Connected"
        title={`Hello ${user?.first_name || user?.username || 'Clinician'}`}
        description={user?.facility ? `${user.facility.name} is linked to this mobile workspace.` : 'No facility is attached to this account yet.'}
      >
        <View style={styles.heroMetaRow}>
          <Pill label={user?.role || 'Role pending'} tone="neutral" />
          <Text style={styles.connectionText}>{apiBaseUrl}</Text>
        </View>
      </HeroCard>

      <View style={styles.metricsRow}>
        <MetricCard label="Patients" value={String(summaryQuery.data?.patientCount ?? 0)} tone="primary" />
        <MetricCard label="Encounters" value={String(summaryQuery.data?.encounterCount ?? 0)} tone="accent" />
      </View>

      <SectionCard title="Quick actions" subtitle="Start from the highest-volume bedside tasks first.">
        <View style={styles.actionGrid}>
          <AppButton label="Check-in patient" onPress={() => router.push('/checkin' as never)} />
          <AppButton label="Register patient" onPress={() => router.push('/patients/new' as never)} />
          <AppButton label="Start encounter" onPress={() => router.push('/encounters/new' as never)} variant="secondary" />
          <AppButton label="Browse patients" onPress={() => router.push('/(tabs)/patients' as never)} variant="secondary" />
        </View>
      </SectionCard>

      <SectionCard title="Recent encounters" subtitle="The latest items come directly from /api/encounters/.">
        {(summaryQuery.data?.recentEncounters ?? []).length === 0 ? (
          <Text style={styles.emptyText}>No encounters have been recorded yet.</Text>
        ) : (
          (summaryQuery.data?.recentEncounters ?? []).map((encounter) => (
            <View key={encounter.id} style={styles.timelineItem}>
              <View style={styles.timelineTopRow}>
                <Text style={styles.timelineTitle}>{encounter.patient_name || 'Unknown patient'}</Text>
                <Pill label={encounter.status.replace(/_/g, ' ')} tone={encounter.has_critical_vitals ? 'danger' : 'primary'} />
              </View>
              <Text style={styles.timelineSubtitle}>{encounter.encounter_type} · {encounter.chief_complaint}</Text>
              <Text style={styles.timelineMeta}>{formatDateTime(encounter.created_at)}</Text>
            </View>
          ))
        )}
      </SectionCard>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heroMetaRow: {
    gap: 12,
  },
  connectionText: {
    color: '#F8EFE6',
    fontSize: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionGrid: {
    gap: 12,
  },
  emptyText: {
    color: appTheme.colors.mutedText,
    fontSize: 14,
  },
  timelineItem: {
    borderBottomColor: appTheme.colors.border,
    borderBottomWidth: 1,
    gap: 4,
    paddingBottom: 12,
  },
  timelineTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timelineTitle: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    marginRight: 12,
  },
  timelineSubtitle: {
    color: appTheme.colors.mutedText,
    fontSize: 14,
  },
  timelineMeta: {
    color: appTheme.colors.mutedText,
    fontSize: 12,
  },
});