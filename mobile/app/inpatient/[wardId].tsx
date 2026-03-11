import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppTextInput, EmptyState, LoadingState, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { inpatientApi } from '@/lib/api/inpatient';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { Bed, BedStatus } from '@/lib/types/inpatient';

const STATUS_COLORS: Record<BedStatus, { bg: string; text: string; bgDark: string; textDark: string }> = {
  AVAILABLE: { bg: '#D1FAE5', text: '#065F46', bgDark: '#064E3B', textDark: '#6EE7B7' },
  OCCUPIED: { bg: '#DBEAFE', text: '#1E40AF', bgDark: '#1E3A5F', textDark: '#93C5FD' },
  MAINTENANCE: { bg: '#FEF3C7', text: '#92400E', bgDark: '#78350F', textDark: '#FCD34D' },
  RESERVED: { bg: '#EDE9FE', text: '#5B21B6', bgDark: '#4C1D95', textDark: '#C4B5FD' },
};

export default function BedBoardScreen() {
  const { wardId } = useLocalSearchParams<{ wardId: string }>();
  const { isDarkMode, theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<BedStatus | 'ALL'>('ALL');

  // ── Bed swap state ──
  const [swapMode, setSwapMode] = useState(false);
  const [swapBedA, setSwapBedA] = useState<Bed | null>(null);
  const [swapBedB, setSwapBedB] = useState<Bed | null>(null);
  const [swapReason, setSwapReason] = useState('');

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

  const swapMutation = useMutation({
    mutationFn: () =>
      inpatientApi.swapBeds({
        bed_a: swapBedA!.id,
        bed_b: swapBedB!.id,
        reason: swapReason || undefined,
      }),
    onSuccess: (result) => {
      Alert.alert('Beds swapped', result.message);
      queryClient.invalidateQueries({ queryKey: ['inpatient'] });
      exitSwapMode();
    },
    onError: () => {
      Alert.alert('Error', 'Failed to swap beds. Please try again.');
    },
  });

  function exitSwapMode() {
    setSwapMode(false);
    setSwapBedA(null);
    setSwapBedB(null);
    setSwapReason('');
  }

  function handleBedPress(bed: Bed) {
    if (!swapMode) return;
    if (bed.status !== 'OCCUPIED') return;

    if (!swapBedA) {
      setSwapBedA(bed);
    } else if (bed.id === swapBedA.id) {
      setSwapBedA(null);
    } else {
      setSwapBedB(bed);
    }
  }

  const allBeds = bedsQuery.data?.results ?? [];
  const beds = filter === 'ALL' ? allBeds : allBeds.filter((b) => b.status === filter);
  const ward = wardQuery.data;
  const occupiedCount = allBeds.filter((b) => b.status === 'OCCUPIED').length;

  const counts: Record<BedStatus, number> = {
    AVAILABLE: allBeds.filter((b) => b.status === 'AVAILABLE').length,
    OCCUPIED: occupiedCount,
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
              <BedCell
                key={bed.id}
                bed={bed}
                isDarkMode={isDarkMode}
                theme={theme}
                styles={styles}
                swapMode={swapMode}
                isSwapSelected={swapBedA?.id === bed.id || swapBedB?.id === bed.id}
                onPress={() => handleBedPress(bed)}
              />
            ))}
          </View>
        </SectionCard>
      )}

      {/* Bed swap section */}
      {occupiedCount >= 2 && !swapMode && (
        <SectionCard title="Bed management">
          <AppButton
            label="Swap beds"
            onPress={() => setSwapMode(true)}
            variant="secondary"
          />
        </SectionCard>
      )}

      {swapMode && (
        <SectionCard title="Swap beds" subtitle="Select two occupied beds to swap their patient assignments.">
          <Text style={styles.swapInstruction}>
            {!swapBedA
              ? 'Tap the first occupied bed.'
              : !swapBedB
                ? `Selected: ${swapBedA.bed_number}. Tap the second occupied bed.`
                : `Swapping ${swapBedA.bed_number} ↔ ${swapBedB.bed_number}`}
          </Text>
          {swapBedA && swapBedB && (
            <>
              <AppTextInput
                label="Reason (optional)"
                value={swapReason}
                onChangeText={setSwapReason}
                placeholder="e.g. Patient preference, clinical need..."
              />
              <View style={styles.swapActions}>
                <AppButton
                  label="Cancel"
                  onPress={exitSwapMode}
                  variant="ghost"
                />
                <AppButton
                  label={swapMutation.isPending ? 'Swapping...' : 'Confirm swap'}
                  onPress={() => swapMutation.mutate()}
                  disabled={swapMutation.isPending}
                />
              </View>
            </>
          )}
          {!(swapBedA && swapBedB) && (
            <AppButton
              label="Cancel"
              onPress={exitSwapMode}
              variant="ghost"
            />
          )}
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

function BedCell({ bed, isDarkMode, theme, styles, swapMode, isSwapSelected, onPress }: { bed: Bed; isDarkMode: boolean; theme: AppTheme; styles: ReturnType<typeof createStyles>; swapMode?: boolean; isSwapSelected?: boolean; onPress?: () => void }) {
  const colors = STATUS_COLORS[bed.status];
  const bgColor = isDarkMode ? colors.bgDark : colors.bg;
  const textColor = isDarkMode ? colors.textDark : colors.text;
  const iconName: keyof typeof Ionicons.glyphMap =
    bed.status === 'AVAILABLE' ? 'checkmark-circle-outline' :
    bed.status === 'OCCUPIED' ? 'person-outline' :
    bed.status === 'MAINTENANCE' ? 'construct-outline' :
    'time-outline';

  const isSelectable = swapMode && bed.status === 'OCCUPIED';

  return (
    <Pressable
      style={[
        styles.bedCell,
        { backgroundColor: bgColor },
        isSwapSelected && styles.bedCellSelected,
        swapMode && !isSelectable && styles.bedCellDisabled,
      ]}
      onPress={isSelectable ? onPress : undefined}
      disabled={swapMode && !isSelectable}
    >
      <View style={styles.bedCellHeader}>
        <Text style={[styles.bedNumber, { color: textColor }]}>{bed.bed_number}</Text>
        {isSwapSelected ? (
          <Ionicons name="swap-horizontal" size={16} color={theme.colors.primary} />
        ) : (
          <Ionicons name={iconName} size={16} color={textColor} />
        )}
      </View>
      <Text style={[styles.bedStatus, { color: textColor }]}>
        {bed.status_display ?? bed.status}
      </Text>
    </Pressable>
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
    bedCellSelected: {
      borderWidth: 2,
      borderColor: theme.colors.primary,
    },
    bedCellDisabled: {
      opacity: 0.4,
    },
    swapInstruction: {
      color: theme.colors.text,
      fontSize: 14,
      marginBottom: theme.spacing.sm,
    },
    swapActions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      justifyContent: 'flex-end',
      marginTop: theme.spacing.sm,
    },
  });
}
