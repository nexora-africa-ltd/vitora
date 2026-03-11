import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, EmptyState, LoadingState, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { inpatientApi } from '@/lib/api/inpatient';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { Bed, BedStatus } from '@/lib/types/inpatient';

const STATUS_COLORS: Record<BedStatus, { bg: string; text: string; bgDark: string }> = {
  AVAILABLE: { bg: '#D1FAE5', text: '#065F46', bgDark: '#064E3B' },
  OCCUPIED: { bg: '#DBEAFE', text: '#1E40AF', bgDark: '#1E3A5F' },
  MAINTENANCE: { bg: '#FEF3C7', text: '#92400E', bgDark: '#78350F' },
  RESERVED: { bg: '#EDE9FE', text: '#5B21B6', bgDark: '#4C1D95' },
};

export default function BedBoardScreen() {
  const { wardId } = useLocalSearchParams<{ wardId: string }>();
  const { isDarkMode, theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [filter, setFilter] = useState<BedStatus | 'ALL'>('ALL');

  const wardQuery = useQuery({
    queryKey: ['inpatient', 'ward', wardId],
    queryFn: () => inpatientApi.getWard(Number(wardId)),
    enabled: !!wardId,
  });

  const bedsQuery = useQuery({
    queryKey: ['inpatient', 'ward', wardId, 'beds'],
    queryFn: () => inpatientApi.getWardBeds(Number(wardId)),
    enabled: !!wardId,
  });

  const allBeds = bedsQuery.data?.results ?? [];
  const beds = filter === 'ALL' ? allBeds : allBeds.filter((b) => b.status === filter);
  const ward = wardQuery.data;

  const counts: Record<BedStatus, number> = {
    AVAILABLE: allBeds.filter((b) => b.status === 'AVAILABLE').length,
    OCCUPIED: allBeds.filter((b) => b.status === 'OCCUPIED').length,
    MAINTENANCE: allBeds.filter((b) => b.status === 'MAINTENANCE').length,
    RESERVED: allBeds.filter((b) => b.status === 'RESERVED').length,
  };

  return (
    <ScreenContainer>
      <SectionCard
        title={ward?.name ?? 'Ward'}
        subtitle={ward ? `${ward.ward_type_display ?? ward.ward_type} · Capacity: ${ward.capacity}` : undefined}
      >
        {/* Filter chips */}
        <View style={styles.filtersRow}>
          <FilterChip
            label={`All (${allBeds.length})`}
            active={filter === 'ALL'}
            onPress={() => setFilter('ALL')}
            theme={theme}
          />
          {(['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'RESERVED'] as BedStatus[]).map((status) => (
            <FilterChip
              key={status}
              label={`${status.charAt(0)}${status.slice(1).toLowerCase()} (${counts[status]})`}
              active={filter === status}
              onPress={() => setFilter(status)}
              theme={theme}
              color={STATUS_COLORS[status][isDarkMode ? 'bgDark' : 'bg']}
            />
          ))}
        </View>
      </SectionCard>

      {bedsQuery.isLoading && <LoadingState message="Loading beds..." />}

      {!bedsQuery.isLoading && beds.length === 0 && (
        <EmptyState title="No beds" description={filter === 'ALL' ? 'No beds configured for this ward.' : `No beds with status "${filter}".`} />
      )}

      {beds.length > 0 && (
        <SectionCard title="Bed board" subtitle={`${beds.length} bed(s)`}>
          <View style={styles.bedGrid}>
            {beds.map((bed) => (
              <BedCell key={bed.id} bed={bed} isDarkMode={isDarkMode} theme={theme} styles={styles} />
            ))}
          </View>
        </SectionCard>
      )}

      <SectionCard title="Admissions" subtitle="View patients admitted to this ward.">
        <AppButton
          label="View admissions"
          onPress={() => router.push(`/inpatient/admissions?ward=${wardId}` as never)}
          variant="secondary"
        />
      </SectionCard>
    </ScreenContainer>
  );
}

function FilterChip({ label, active, onPress, theme, color }: { label: string; active: boolean; onPress: () => void; theme: AppTheme; color?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: active ? theme.colors.primary : color ?? theme.colors.elevated,
        borderRadius: theme.radius.pill,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <Text style={{ color: active ? '#FFF' : theme.colors.text, fontSize: 12, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function BedCell({ bed, isDarkMode, theme, styles }: { bed: Bed; isDarkMode: boolean; theme: AppTheme; styles: ReturnType<typeof createStyles> }) {
  const colors = STATUS_COLORS[bed.status];
  const bgColor = isDarkMode ? colors.bgDark : colors.bg;
  const iconName: keyof typeof Ionicons.glyphMap =
    bed.status === 'AVAILABLE' ? 'checkmark-circle-outline' :
    bed.status === 'OCCUPIED' ? 'person-outline' :
    bed.status === 'MAINTENANCE' ? 'construct-outline' :
    'time-outline';

  return (
    <View style={[styles.bedCell, { backgroundColor: bgColor }]}>
      <View style={styles.bedCellHeader}>
        <Text style={[styles.bedNumber, { color: colors.text }]}>{bed.bed_number}</Text>
        <Ionicons name={iconName} size={16} color={colors.text} />
      </View>
      <Text style={[styles.bedStatus, { color: colors.text }]}>
        {bed.status_display ?? bed.status}
      </Text>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    filtersRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    bedGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    bedCell: {
      borderRadius: theme.radius.md,
      minWidth: 90,
      padding: theme.spacing.sm,
      flex: 1,
      maxWidth: '48%',
    },
    bedCellHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    bedNumber: {
      fontSize: 14,
      fontWeight: '700',
    },
    bedStatus: {
      fontSize: 11,
      fontWeight: '600',
      marginTop: 2,
    },
  });
}
