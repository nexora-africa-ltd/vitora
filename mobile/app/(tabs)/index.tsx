import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppButton, HeroCard, LoadingState, MetricCard, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import { SyncIndicator } from '@/components/sync-indicator';
import type { AppTheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';
import { listLocalEncounters, listLocalPatients } from '@/lib/db';
import { useAppTheme } from '@/lib/theme/theme-context';
import { formatDateTime } from '@/lib/utils/format';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getCurrentDateLabel(): string {
  return new Intl.DateTimeFormat('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const { isDarkMode, theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const [patients, encounters] = await Promise.all([
        listLocalPatients(),
        listLocalEncounters({ limit: 5 }),
      ]);

      return {
        patientCount: patients.count,
        encounterCount: encounters.count,
        recentEncounters: encounters.records,
      };
    },
  });

  if (summaryQuery.isLoading) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState message="Loading the mobile clinical dashboard..." fullScreen />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow={getCurrentDateLabel()}
        title={`${getGreeting()}, ${user?.first_name || user?.username || 'Clinician'}`}
        titleAccessory={
          <MaterialCommunityIcons
            color={isDarkMode ? '#F8FAFC' : '#7A4A2A'}
            name="hand-wave"
            size={28}
          />
        }
        description={[user?.role, user?.facility?.name].filter(Boolean).join(' · ') || 'No facility linked'}
      >
        <View style={styles.heroMetaRow}>
          <Text style={styles.heroStat}>
            <Text style={styles.heroStatBold}>{summaryQuery.data?.encounterCount ?? 0}</Text>
            {' '}{(summaryQuery.data?.encounterCount ?? 0) === 1 ? 'encounter' : 'encounters'} today
          </Text>
          <Text style={styles.heroStat}>
            <Text style={styles.heroStatBold}>{summaryQuery.data?.patientCount ?? 0}</Text>
            {' '}{(summaryQuery.data?.patientCount ?? 0) === 1 ? 'patient' : 'patients'} registered
          </Text>
        </View>
      </HeroCard>

      <SyncIndicator />

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

      <SectionCard title="Recent encounters" subtitle="This feed now renders from the local mobile cache and refreshes through the sync engine.">
        {(summaryQuery.data?.recentEncounters ?? []).length === 0 ? (
          <Text style={styles.emptyText}>No encounters have been recorded yet.</Text>
        ) : (
          (summaryQuery.data?.recentEncounters ?? []).map((encounter) => (
            <Pressable key={encounter.id} onPress={() => router.push(`/encounters/${encounter.id}` as never)} style={({ pressed }) => [styles.timelineItem, pressed && styles.timelineItemPressed]}>
              <View style={styles.timelineTopRow}>
                <Text style={styles.timelineTitle}>{encounter.patient_name || 'Unknown patient'}</Text>
                <Pill label={encounter.status.replace(/_/g, ' ')} tone={encounter.has_critical_vitals ? 'danger' : 'primary'} />
              </View>
              <Text style={styles.timelineSubtitle}>{encounter.encounter_type} · {encounter.chief_complaint}</Text>
              <Text style={styles.timelineMeta}>{formatDateTime(encounter.created_at)}</Text>
            </Pressable>
          ))
        )}
      </SectionCard>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  heroMetaRow: {
    gap: 4,
  },
  heroStat: {
    color: 'rgba(248, 250, 252, 0.78)',
    fontSize: 13,
  },
  heroStatBold: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionGrid: {
    gap: 12,
  },
  emptyText: {
    color: theme.colors.mutedText,
    fontSize: 14,
  },
  timelineItem: {
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    borderRadius: 8,
    gap: 4,
    paddingBottom: 12,
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  timelineItemPressed: {
    backgroundColor: theme.colors.border,
    opacity: 0.8,
  },
  timelineTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timelineTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    marginRight: 12,
  },
  timelineSubtitle: {
    color: theme.colors.mutedText,
    fontSize: 14,
  },
  timelineMeta: {
    color: theme.colors.mutedText,
    fontSize: 12,
  },
  });
}
