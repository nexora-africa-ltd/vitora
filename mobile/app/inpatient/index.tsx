import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, AppButton, HeroCard, LoadingState, MetricCard, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { inpatientApi } from '@/lib/api/inpatient';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { InpatientWard, WardType } from '@/lib/types/inpatient';

const WARD_TYPE_ICONS: Record<WardType, keyof typeof Ionicons.glyphMap> = {
  MEDICAL: 'medkit-outline',
  SURGICAL: 'cut-outline',
  PEDIATRIC: 'happy-outline',
  MATERNITY: 'heart-outline',
  ICU: 'pulse-outline',
  ISOLATION: 'shield-outline',
};

function occupancyTone(rate: number): 'primary' | 'warning' | 'danger' {
  if (rate >= 90) return 'danger';
  if (rate >= 70) return 'warning';
  return 'primary';
}

export default function WardListScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const wardsQuery = useQuery({
    queryKey: ['inpatient', 'wards'],
    queryFn: () => inpatientApi.listWards({ is_active: true, page_size: 50 }),
  });

  const wards = wardsQuery.data?.results ?? [];
  const totalBeds = wards.reduce((sum, w) => sum + w.total_beds, 0);
  const totalOccupied = wards.reduce((sum, w) => sum + w.occupied_beds, 0);
  const totalAvailable = wards.reduce((sum, w) => sum + w.available_beds, 0);

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Inpatient"
        title="Wards"
        description="View ward occupancy, bed availability, and manage admissions."
      />

      <View style={styles.topActions}>
        <AppButton
          label="Admit patient"
          onPress={() => router.push('/inpatient/admissions/new' as never)}
          variant="primary"
        />
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <MetricCard label="Total beds" value={String(totalBeds)} tone="secondary" />
        </View>
        <View style={styles.metricItem}>
          <MetricCard label="Occupied" value={String(totalOccupied)} tone="accent" />
        </View>
        <View style={styles.metricItem}>
          <MetricCard label="Available" value={String(totalAvailable)} tone="primary" />
        </View>
      </View>

      {wardsQuery.isLoading && <LoadingState message="Loading wards..." />}

      {wardsQuery.isError && (
        <EmptyState title="Failed to load wards" description="Check your connection and try again." />
      )}

      {!wardsQuery.isLoading && wards.length === 0 && (
        <EmptyState title="No wards found" description="No active wards are configured." />
      )}

      {wards.length > 0 && (
        <SectionCard title="Active wards" subtitle={`${wards.length} ward(s)`}>
          {wards.map((ward) => (
            <WardRow key={ward.id} ward={ward} styles={styles} theme={theme} />
          ))}
        </SectionCard>
      )}
    </ScreenContainer>
  );
}

function WardRow({ ward, styles, theme }: { ward: InpatientWard; styles: ReturnType<typeof createStyles>; theme: AppTheme }) {
  const icon = WARD_TYPE_ICONS[ward.ward_type] ?? 'bed-outline';
  const tone = occupancyTone(ward.occupancy_rate);
  const toneColor = tone === 'danger' ? theme.colors.danger : tone === 'warning' ? '#D97706' : theme.colors.primary;

  return (
    <Pressable
      style={({ pressed }) => [styles.wardRow, pressed && styles.wardRowPressed]}
      onPress={() => router.push(`/inpatient/${ward.id}` as never)}
    >
      <Ionicons name={icon} size={22} color={theme.colors.primary} />
      <View style={styles.wardInfo}>
        <Text style={styles.wardName}>{ward.name}</Text>
        <Text style={styles.wardMeta}>
          {ward.ward_type_display ?? ward.ward_type} · {ward.capacity} beds
        </Text>
      </View>
      <View style={styles.occupancyBadge}>
        <View style={[styles.occupancyDot, { backgroundColor: toneColor }]} />
        <Text style={[styles.occupancyText, { color: toneColor }]}>
          {ward.occupied_beds}/{ward.total_beds}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedText} />
    </Pressable>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    metricsRow: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    metricItem: {
      flex: 1,
    },
    topActions: {
      gap: theme.spacing.sm,
    },
    wardRow: {
      alignItems: 'center',
      borderBottomColor: theme.colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.md,
    },
    wardRowPressed: {
      opacity: 0.7,
    },
    wardInfo: {
      flex: 1,
      gap: 2,
    },
    wardName: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    wardMeta: {
      color: theme.colors.mutedText,
      fontSize: 12,
    },
    occupancyBadge: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 4,
    },
    occupancyDot: {
      borderRadius: 4,
      height: 8,
      width: 8,
    },
    occupancyText: {
      fontSize: 13,
      fontWeight: '700',
    },
  });
}
