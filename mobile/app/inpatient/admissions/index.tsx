import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { inpatientApi } from '@/lib/api/inpatient';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { Admission, AdmissionStatus } from '@/lib/types/inpatient';

const STATUS_TONE: Record<AdmissionStatus, 'primary' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'primary',
  DISCHARGED: 'neutral',
  TRANSFERRED_OUT: 'warning',
  DECEASED: 'danger',
  ABSCONDED: 'danger',
};

export default function AdmissionsListScreen() {
  const params = useLocalSearchParams<{ ward?: string }>();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const admissionsQuery = useQuery({
    queryKey: ['inpatient', 'admissions', params.ward],
    queryFn: () =>
      inpatientApi.listAdmissions({
        ward: params.ward ? Number(params.ward) : undefined,
        admission_status: 'ACTIVE',
        page_size: 50,
      }),
  });

  const admissions = admissionsQuery.data?.results ?? [];

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="Inpatient"
        title="Admissions"
        description="Active admissions. Tap a patient to view details, round notes, and manage discharge."
      />

      {admissionsQuery.isLoading && <LoadingState message="Loading admissions..." />}

      {admissionsQuery.isError && (
        <EmptyState title="Failed to load" description="Check your connection and try again." />
      )}

      {!admissionsQuery.isLoading && admissions.length === 0 && (
        <EmptyState title="No active admissions" description="This ward has no currently admitted patients." />
      )}

      {admissions.length > 0 && (
        <SectionCard title="Active patients" subtitle={`${admissions.length} patient(s)`}>
          {admissions.map((admission) => (
            <AdmissionRow key={admission.id} admission={admission} styles={styles} theme={theme} />
          ))}
        </SectionCard>
      )}
    </ScreenContainer>
  );
}

function AdmissionRow({ admission, styles, theme }: { admission: Admission; styles: ReturnType<typeof createStyles>; theme: AppTheme }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => router.push(`/inpatient/admissions/${admission.id}` as never)}
    >
      <View style={styles.rowContent}>
        <View style={styles.rowHeader}>
          <Text style={styles.patientName}>{admission.patient_name ?? `Patient #${admission.patient}`}</Text>
          <Pill label={admission.admission_status_display ?? admission.admission_status} tone={STATUS_TONE[admission.admission_status]} />
        </View>
        <Text style={styles.rowMeta}>
          {admission.admission_number} · {admission.ward_name ?? 'Unknown ward'}
          {admission.bed_number ? ` · Bed ${admission.bed_number}` : ''}
        </Text>
        <Text style={styles.rowMeta}>
          Admitted: {admission.admission_date}
          {admission.length_of_stay != null ? ` · ${admission.length_of_stay} day(s)` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedText} />
    </Pressable>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    row: {
      alignItems: 'center',
      borderBottomColor: theme.colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.md,
    },
    rowPressed: {
      opacity: 0.7,
    },
    rowContent: {
      flex: 1,
      gap: 4,
    },
    rowHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    patientName: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
    },
    rowMeta: {
      color: theme.colors.mutedText,
      fontSize: 12,
    },
  });
}
