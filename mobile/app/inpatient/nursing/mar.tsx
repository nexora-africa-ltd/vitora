import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { inpatientApi } from '@/lib/api/inpatient';
import { useAppTheme } from '@/lib/theme/theme-context';

/**
 * Medication Administration Record (MAR) screen.
 *
 * Currently read-only — displays prescribed medications from the admission's
 * linked encounter. A dedicated MAR backend with scheduled doses and
 * administration tracking (GIVEN / SKIPPED / REFUSED) is planned.
 */
export default function MARScreen() {
  const { admission: admissionId } = useLocalSearchParams<{ admission: string }>();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const admissionQuery = useQuery({
    queryKey: ['inpatient', 'admission', admissionId],
    queryFn: () => inpatientApi.getAdmission(Number(admissionId)),
    enabled: !!admissionId,
  });

  const admission = admissionQuery.data;

  if (admissionQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading medications..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <SectionCard
        title="Medication Administration"
        subtitle={admission?.patient_name ?? `Admission #${admissionId}`}
      >
        <Pill label="Read-only preview" tone="warning" />
        <Text style={styles.notice}>
          Medication tracking is currently informational. A dedicated MAR backend
          with scheduled doses and administration status (Given / Skipped / Refused)
          is planned for a future sprint.
        </Text>
      </SectionCard>

      <SectionCard title="Current medications" subtitle="From admission and encounter records.">
        {admission?.admitting_diagnosis_text ? (
          <View style={styles.medCard}>
            <Text style={styles.medName}>Admitting diagnosis</Text>
            <Text style={styles.medDetail}>{admission.admitting_diagnosis_text}</Text>
          </View>
        ) : null}

        <EmptyState
          title="No MAR data available"
          description="Medication administration records will appear here once the MAR backend is implemented. Check the pharmacy module for current prescriptions and dispensing."
        />
      </SectionCard>

      <SectionCard title="Planned features">
        <View style={styles.featureList}>
          <FeatureItem label="Scheduled medication times" styles={styles} />
          <FeatureItem label="Mark as Given / Skipped / Refused / Held" styles={styles} />
          <FeatureItem label="Dose tracking and alerts" styles={styles} />
          <FeatureItem label="PRN medication logging" styles={styles} />
          <FeatureItem label="Nurse signature capture" styles={styles} />
        </View>
      </SectionCard>
    </ScreenContainer>
  );
}

function FeatureItem({ label, styles }: { label: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureBullet}>•</Text>
      <Text style={styles.featureText}>{label}</Text>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    notice: {
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 19,
    },
    medCard: {
      borderBottomColor: theme.colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 4,
      paddingVertical: theme.spacing.sm,
    },
    medName: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    medDetail: {
      color: theme.colors.mutedText,
      fontSize: 13,
    },
    featureList: {
      gap: 8,
    },
    featureItem: {
      flexDirection: 'row',
      gap: 6,
    },
    featureBullet: {
      color: theme.colors.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    featureText: {
      color: theme.colors.mutedText,
      fontSize: 13,
      flex: 1,
    },
  });
}
