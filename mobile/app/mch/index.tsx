import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppTextInput, HeroCard, ListSkeleton, MetricCard, Pill, ScreenList, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { useLocalMCHRegistrations } from '@/lib/hooks/use-local-mch';
import { useRefreshQueries } from '@/lib/hooks/use-refresh-queries';
import { useAppTheme } from '@/lib/theme/theme-context';
import { formatDate } from '@/lib/utils/format';

export default function MCHScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [searchValue, setSearchValue] = useState('');
  const [highRiskOnly, setHighRiskOnly] = useState(false);
  const registrationsQuery = useLocalMCHRegistrations({ search: searchValue, highRiskOnly });
  const refreshKeys = useMemo(() => [['local-mch-registrations']] as const, []);
  const { isRefreshing, refresh } = useRefreshQueries(refreshKeys);

  if (registrationsQuery.isLoading) {
    return <ListSkeleton itemCount={4} showHero />;
  }

  const registrations = registrationsQuery.registrations;
  const highRiskCount = registrations.filter((registration) => registration.is_high_risk).length;

  return (
    <ScreenList
      contentContainerStyle={styles.listContent}
      data={registrations}
      emptyDescription="Run a sync while online or open the web MCH module to register the mother first."
      emptyTitle="No MCH records yet"
      estimatedItemHeight={162}
      header={
        <>
          <HeroCard
            eyebrow="MCH"
            title="Antenatal care"
            description="Track active pregnancies, capture ANC visits, and follow immunization schedules from the mobile field workflow."
          />

          <View style={styles.metricRow}>
            <MetricCard label="Pregnancies" value={String(registrations.length)} tone="primary" />
            <MetricCard label="High risk" value={String(highRiskCount)} tone="accent" />
            <MetricCard label="ANC visits" value={String(registrations.reduce((sum, item) => sum + item.anc_visit_count, 0))} tone="secondary" />
          </View>

          <SectionCard title="Search" subtitle="Filter by mother name, MRN, or MCH number.">
            <AppTextInput label="Search pregnancies" value={searchValue} onChangeText={setSearchValue} placeholder="Mother name, MRN, or MCH number" autoCapitalize="none" />
            <AppButton label={highRiskOnly ? 'Show all pregnancies' : 'Show high-risk only'} onPress={() => setHighRiskOnly((current) => !current)} variant="secondary" />
          </SectionCard>

          <SectionCard title="Registry" subtitle={`${registrationsQuery.count} pregnancies cached on this device.`}>
            <Text style={styles.registryHint}>Pull down to refresh after ANC sync finishes.</Text>
          </SectionCard>
        </>
      }
      keyExtractor={(registration) => String(registration.id)}
      onRefresh={() => void refresh()}
      refreshing={isRefreshing || registrationsQuery.isRefetching}
      renderItem={({ item: registration }) => (
        <Pressable
          onPress={() => router.push(`/mch/anc/${registration.id}` as never)}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.topRow}>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>{registration.mother_name}</Text>
              <Text style={styles.meta}>{registration.mother_mrn} · {registration.mch_number}</Text>
            </View>
            <View style={styles.pillColumn}>
              {registration.is_high_risk ? <Pill label="High risk" tone="danger" /> : <Pill label="Routine ANC" tone="primary" />}
              <Pill label={`ANC ${registration.anc_visit_count}`} tone="neutral" />
            </View>
          </View>
          <Text style={styles.summary}>Registered {formatDate(registration.registration_date)} · EDD {formatDate(registration.edd)}</Text>
          <Text style={styles.summary}>Gestation {registration.gestation_display} · Trimester {registration.trimester ?? 'n/a'}</Text>
          <View style={styles.actionRow}>
            <AppButton label="Open ANC" onPress={() => router.push(`/mch/anc/${registration.id}` as never)} />
            <AppButton label="Immunization" onPress={() => router.push(`/mch/immunization?patientId=${registration.mother}&registrationId=${registration.id}` as never)} variant="secondary" />
          </View>
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    card: {
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      gap: 10,
      padding: 14,
    },
    cardPressed: {
      opacity: 0.82,
    },
    metricRow: {
      flexDirection: 'row',
      gap: 12,
    },
    meta: {
      color: theme.colors.mutedText,
      fontSize: 12,
    },
    pillColumn: {
      alignItems: 'flex-end',
      gap: 6,
    },
    summary: {
      color: theme.colors.mutedText,
      fontSize: 14,
    },
    title: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '700',
    },
    titleBlock: {
      flex: 1,
      marginRight: 12,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    listContent: {
      paddingBottom: 28,
    },
    registryHint: {
      color: theme.colors.mutedText,
      fontSize: 13,
    },
    separator: {
      height: 12,
    },
  });
}