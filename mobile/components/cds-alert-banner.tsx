import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { AppTheme } from '@/constants/theme';
import { cdsApi } from '@/lib/api/cds';
import { toApiError } from '@/lib/api/client';
import { queryClient } from '@/lib/query/client';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { CDSAlertListItem } from '@/lib/types/cds';

// ──────────────────── Priority helpers ────────────────────

const PRIORITY_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  CRITICAL: { icon: 'alert-circle', label: 'Critical' },
  HIGH: { icon: 'warning', label: 'High' },
  MEDIUM: { icon: 'information-circle', label: 'Medium' },
  LOW: { icon: 'checkmark-circle', label: 'Low' },
  INFO: { icon: 'information-circle-outline', label: 'Info' },
};

function getPriorityColors(priority: string, theme: AppTheme): { bg: string; text: string; icon: string } {
  if (priority === 'CRITICAL') {
    return { bg: `${theme.colors.danger}18`, text: theme.colors.danger, icon: theme.colors.danger };
  }
  if (priority === 'HIGH') {
    return { bg: `${theme.colors.warning}18`, text: theme.colors.warning, icon: theme.colors.warning };
  }
  return { bg: `${theme.colors.primary}12`, text: theme.colors.primary, icon: theme.colors.primary };
}

// ──────────────────── Single Alert Card ────────────────────

function AlertCard({ alert, theme, onDismissed }: { alert: CDSAlertListItem; theme: AppTheme; onDismissed: () => void }) {
  const styles = useMemo(() => createAlertStyles(theme), [theme]);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const config = PRIORITY_CONFIG[alert.priority] ?? PRIORITY_CONFIG.MEDIUM;
  const colors = getPriorityColors(alert.priority, theme);

  const acknowledgeMutation = useMutation({
    mutationFn: () => cdsApi.acknowledgeAlert(alert.id),
    onSuccess: onDismissed,
    onError: (err) => Alert.alert('Error', toApiError(err).message),
  });

  const overrideMutation = useMutation({
    mutationFn: () => cdsApi.overrideAlert(alert.id, { override_reason: overrideReason }),
    onSuccess: () => {
      setShowOverride(false);
      setOverrideReason('');
      onDismissed();
    },
    onError: (err) => Alert.alert('Error', toApiError(err).message),
  });

  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.text }]}>
      <View style={styles.header}>
        <Ionicons name={config.icon} size={20} color={colors.icon} />
        <View style={styles.headerText}>
          <Text style={[styles.ruleName, { color: colors.text }]}>{alert.rule_name}</Text>
          <Text style={[styles.category, { color: colors.text }]}>{alert.category.replace(/_/g, ' ')} · {config.label}</Text>
        </View>
      </View>

      <Text style={[styles.message, { color: theme.colors.text }]}>{alert.message}</Text>

      {alert.suggestion ? (
        <Text style={[styles.suggestion, { color: theme.colors.mutedText }]}>Suggestion: {alert.suggestion}</Text>
      ) : null}

      {!showOverride ? (
        <View style={styles.actions}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: theme.colors.primary }]}
            onPress={() => acknowledgeMutation.mutate()}
            disabled={acknowledgeMutation.isPending}
          >
            <Text style={styles.actionBtnText}>
              {acknowledgeMutation.isPending ? 'Acknowledging...' : 'Acknowledge'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: theme.colors.elevated, borderWidth: 1, borderColor: theme.colors.border }]}
            onPress={() => setShowOverride(true)}
          >
            <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>Override</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.overrideSection}>
          <TextInput
            style={[styles.overrideInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.elevated }]}
            placeholder="Clinical reason for override..."
            placeholderTextColor={theme.colors.mutedText}
            value={overrideReason}
            onChangeText={setOverrideReason}
            multiline
          />
          <View style={styles.actions}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: theme.colors.warning }]}
              onPress={() => overrideMutation.mutate()}
              disabled={overrideMutation.isPending || overrideReason.trim().length === 0}
            >
              <Text style={styles.actionBtnText}>
                {overrideMutation.isPending ? 'Overriding...' : 'Confirm override'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: theme.colors.elevated, borderWidth: 1, borderColor: theme.colors.border }]}
              onPress={() => { setShowOverride(false); setOverrideReason(''); }}
            >
              <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ──────────────────── Main Banner ────────────────────

export function CDSAlertBanner({ encounterId }: { encounterId: number }) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createBannerStyles(theme), [theme]);

  const alertsQuery = useQuery({
    queryKey: ['cds-alerts', encounterId],
    queryFn: () => cdsApi.getEncounterAlerts(encounterId),
    enabled: encounterId > 0,
    staleTime: 30_000,
  });

  const invalidateAlerts = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['cds-alerts', encounterId] });
  }, [encounterId]);

  const alerts = alertsQuery.data ?? [];

  if (alertsQuery.isLoading || alerts.length === 0) {
    return null;
  }

  const criticalCount = alerts.filter((a) => a.priority === 'CRITICAL' || a.priority === 'HIGH').length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={18} color={criticalCount > 0 ? theme.colors.danger : theme.colors.primary} />
        <Text style={styles.title}>
          Clinical alerts ({alerts.length})
        </Text>
        {criticalCount > 0 ? (
          <View style={[styles.countBadge, { backgroundColor: theme.colors.danger }]}>
            <Text style={styles.countBadgeText}>{criticalCount}</Text>
          </View>
        ) : null}
      </View>

      {alerts.map((alert) => (
        <AlertCard
          key={alert.id}
          alert={alert}
          theme={theme}
          onDismissed={invalidateAlerts}
        />
      ))}
    </View>
  );
}

// ──────────────────── Styles ────────────────────

function createBannerStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      gap: 10,
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 4,
    },
    title: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
    },
    countBadge: {
      alignItems: 'center',
      borderRadius: 10,
      height: 20,
      justifyContent: 'center',
      minWidth: 20,
      paddingHorizontal: 6,
    },
    countBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
    },
  });
}

function createAlertStyles(theme: AppTheme) {
  return StyleSheet.create({
    card: {
      borderLeftWidth: 3,
      borderRadius: theme.radius.md,
      gap: 8,
      padding: 12,
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    headerText: {
      flex: 1,
    },
    ruleName: {
      fontSize: 14,
      fontWeight: '700',
    },
    category: {
      fontSize: 11,
      fontWeight: '600',
      opacity: 0.8,
    },
    message: {
      fontSize: 13,
      lineHeight: 18,
    },
    suggestion: {
      fontSize: 12,
      fontStyle: 'italic',
      lineHeight: 16,
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
    },
    actionBtn: {
      alignItems: 'center',
      borderRadius: theme.radius.sm,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    actionBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    overrideSection: {
      gap: 8,
    },
    overrideInput: {
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      fontSize: 13,
      minHeight: 60,
      padding: 10,
      textAlignVertical: 'top',
    },
  });
}
