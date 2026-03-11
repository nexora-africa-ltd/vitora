import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '@/constants/theme';
import { aiApi } from '@/lib/api/ai';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { AILabInterpretResponse, AILabResultItem } from '@/lib/types/ai';
import type { LabOrderItem } from '@/lib/types/laboratory';

// ──────────────────── Severity styles ────────────────────

const SEVERITY_TONES: Record<string, { bg: string; text: string }> = {
  normal: { bg: '#D1FAE5', text: '#065F46' },
  mild: { bg: '#FEF3C7', text: '#92400E' },
  moderate: { bg: '#FED7AA', text: '#9A3412' },
  severe: { bg: '#FECACA', text: '#991B1B' },
  critical: { bg: '#FCA5A5', text: '#7F1D1D' },
};

// ──────────────────── Helpers ────────────────────

function buildLabItems(items: LabOrderItem[]): AILabResultItem[] {
  const labItems: AILabResultItem[] = [];
  for (const item of items) {
    if (!item.result) continue;
    const result = item.result;
    const numericValue = result.numeric_value ?? (result.formatted_value ? parseFloat(result.formatted_value) : NaN);
    if (Number.isNaN(numericValue)) continue;
    labItems.push({
      test_name: item.test_name || item.test_code || 'Unknown',
      value: numericValue,
      unit: result.result_unit || '',
      reference_low: result.reference_low ?? undefined,
      reference_high: result.reference_high ?? undefined,
    });
  }
  return labItems;
}

// ──────────────────── Component ────────────────────

interface LabInterpretCardProps {
  orderItems: LabOrderItem[];
  patientAge?: number;
  patientSex?: string;
  clinicalContext?: string;
}

export function LabInterpretCard({ orderItems, patientAge, patientSex, clinicalContext }: LabInterpretCardProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [interpretation, setInterpretation] = useState<AILabInterpretResponse | null>(null);

  const labItems = useMemo(() => buildLabItems(orderItems), [orderItems]);
  const hasResults = labItems.length > 0;

  const interpretMutation = useMutation({
    mutationFn: () =>
      aiApi.interpretLab({
        lab_results: labItems,
        patient_age: patientAge!,
        patient_sex: patientSex!,
        clinical_context: clinicalContext,
      }),
    onSuccess: (data) => {
      if (data.error) {
        setInterpretation(null);
      } else {
        setInterpretation(data);
      }
    },
  });

  if (!hasResults || patientAge == null || !patientSex) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={18} color={theme.colors.primary} />
        <Text style={styles.title}>AI Lab Interpretation</Text>
      </View>

      {!interpretation && !interpretMutation.isPending ? (
        <Pressable
          style={[styles.interpretBtn, { backgroundColor: theme.colors.primary }]}
          onPress={() => interpretMutation.mutate()}
        >
          <Ionicons name="analytics-outline" size={18} color="#FFFFFF" />
          <Text style={styles.interpretBtnText}>
            Interpret {labItems.length} result{labItems.length === 1 ? '' : 's'} with TibaBot
          </Text>
        </Pressable>
      ) : null}

      {interpretMutation.isPending ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.mutedText }]}>Analyzing results...</Text>
        </View>
      ) : null}

      {interpretMutation.isError ? (
        <View style={[styles.errorCard, { backgroundColor: `${theme.colors.danger}12` }]}>
          <Ionicons name="alert-circle" size={16} color={theme.colors.danger} />
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>
            TibaBot could not interpret results. Please try again.
          </Text>
        </View>
      ) : null}

      {interpretation ? (
        <View style={styles.resultContainer}>
          {/* Summary */}
          <View style={[styles.summaryCard, { backgroundColor: `${theme.colors.primary}10`, borderColor: theme.colors.primary }]}>
            <Text style={[styles.summaryLabel, { color: theme.colors.primary }]}>Summary</Text>
            <Text style={[styles.summaryText, { color: theme.colors.text }]}>{interpretation.summary}</Text>
          </View>

          {/* Findings */}
          {interpretation.findings.map((finding, index) => {
            const tone = SEVERITY_TONES[finding.severity] ?? SEVERITY_TONES.normal;
            return (
              <View key={`${finding.test_name}-${index}`} style={[styles.findingCard, { backgroundColor: theme.colors.elevated, borderColor: theme.colors.border }]}>
                <View style={styles.findingHeader}>
                  <Text style={[styles.findingTest, { color: theme.colors.text }]}>{finding.test_name}</Text>
                  <View style={[styles.severityBadge, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.severityText, { color: tone.text }]}>{finding.severity}</Text>
                  </View>
                </View>
                <Text style={[styles.findingInterpretation, { color: theme.colors.text }]}>{finding.interpretation}</Text>
                {finding.clinical_significance ? (
                  <Text style={[styles.findingSignificance, { color: theme.colors.mutedText }]}>
                    Clinical significance: {finding.clinical_significance}
                  </Text>
                ) : null}
              </View>
            );
          })}

          {/* Recommendations */}
          {(interpretation.recommendations ?? []).length > 0 ? (
            <View style={[styles.recommendationsCard, { backgroundColor: `${theme.colors.warning}12` }]}>
              <Text style={[styles.recommendationsLabel, { color: theme.colors.warning }]}>Recommendations</Text>
              {interpretation.recommendations!.map((rec, i) => (
                <View key={i} style={styles.recommendationRow}>
                  <Text style={[styles.recommendationBullet, { color: theme.colors.warning }]}>•</Text>
                  <Text style={[styles.recommendationText, { color: theme.colors.text }]}>{rec}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Re-run button */}
          <Pressable
            style={[styles.rerunBtn, { borderColor: theme.colors.border }]}
            onPress={() => {
              setInterpretation(null);
              interpretMutation.mutate();
            }}
          >
            <Ionicons name="refresh-outline" size={16} color={theme.colors.primary} />
            <Text style={[styles.rerunText, { color: theme.colors.primary }]}>Re-interpret</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// ──────────────────── Styles ────────────────────

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      gap: 10,
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    title: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    interpretBtn: {
      alignItems: 'center',
      borderRadius: theme.radius.md,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    interpretBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    loadingContainer: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 16,
    },
    loadingText: {
      fontSize: 13,
    },
    errorCard: {
      alignItems: 'center',
      borderRadius: theme.radius.sm,
      flexDirection: 'row',
      gap: 8,
      padding: 10,
    },
    errorText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
    },
    resultContainer: {
      gap: 10,
    },
    summaryCard: {
      borderLeftWidth: 3,
      borderRadius: theme.radius.sm,
      gap: 4,
      padding: 12,
    },
    summaryLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    summaryText: {
      fontSize: 14,
      lineHeight: 20,
    },
    findingCard: {
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      gap: 6,
      padding: 12,
    },
    findingHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    findingTest: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
    },
    severityBadge: {
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    severityText: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    findingInterpretation: {
      fontSize: 13,
      lineHeight: 18,
    },
    findingSignificance: {
      fontSize: 12,
      fontStyle: 'italic',
    },
    recommendationsCard: {
      borderRadius: theme.radius.sm,
      gap: 6,
      padding: 12,
    },
    recommendationsLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    recommendationRow: {
      flexDirection: 'row',
      gap: 6,
    },
    recommendationBullet: {
      fontSize: 14,
      fontWeight: '700',
    },
    recommendationText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
    },
    rerunBtn: {
      alignItems: 'center',
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    rerunText: {
      fontSize: 13,
      fontWeight: '600',
    },
  });
}
