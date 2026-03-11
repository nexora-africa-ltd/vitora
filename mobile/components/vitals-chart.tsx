import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { TemperatureReading } from '@/lib/types/inpatient';

interface VitalsChartProps {
  readings: TemperatureReading[];
}

/**
 * Simple text-based vital signs trending display.
 * Shows temperature, pulse, and respiratory rate over time
 * with inline sparkline-style bars.
 */
export function VitalsChart({ readings }: VitalsChartProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (readings.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No vitals recorded yet.</Text>
      </View>
    );
  }

  // Sort by time ascending
  const sorted = [...readings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );

  // Ranges for bar rendering
  const tempRange = { min: 35, max: 41 };
  const pulseRange = { min: 40, max: 160 };
  const rrRange = { min: 8, max: 40 };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.timeCol]}>Time</Text>
        <Text style={[styles.headerCell, styles.valueCol]}>Temp (°C)</Text>
        <Text style={[styles.headerCell, styles.valueCol]}>Pulse</Text>
        <Text style={[styles.headerCell, styles.valueCol]}>RR</Text>
      </View>

      {sorted.map((reading) => {
        const tempPct = clampPercent(reading.temperature, tempRange.min, tempRange.max);
        const pulsePct = clampPercent(reading.pulse, pulseRange.min, pulseRange.max);
        const rrPct = clampPercent(reading.respiratory_rate, rrRange.min, rrRange.max);

        const tempAlert = reading.temperature >= 38;
        const pulseAlert = reading.pulse > 100 || reading.pulse < 60;
        const rrAlert = reading.respiratory_rate > 20 || reading.respiratory_rate < 12;

        return (
          <View key={reading.id} style={styles.row}>
            <Text style={[styles.cell, styles.timeCol, styles.timeText]}>
              {formatTime(reading.recorded_at)}
            </Text>
            <View style={[styles.valueCol]}>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    { width: `${tempPct}%`, backgroundColor: tempAlert ? theme.colors.danger : theme.colors.primary },
                  ]}
                />
              </View>
              <Text style={[styles.valueText, tempAlert && styles.alertText]}>
                {reading.temperature}
              </Text>
            </View>
            <View style={[styles.valueCol]}>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    { width: `${pulsePct}%`, backgroundColor: pulseAlert ? '#D97706' : theme.colors.accent },
                  ]}
                />
              </View>
              <Text style={[styles.valueText, pulseAlert && styles.warningText]}>
                {reading.pulse}
              </Text>
            </View>
            <View style={[styles.valueCol]}>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    { width: `${rrPct}%`, backgroundColor: rrAlert ? '#D97706' : theme.colors.secondary },
                  ]}
                />
              </View>
              <Text style={[styles.valueText, rrAlert && styles.warningText]}>
                {reading.respiratory_rate}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function clampPercent(value: number, min: number, max: number): number {
  const pct = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, pct));
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${min}`;
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      gap: 2,
    },
    headerRow: {
      flexDirection: 'row',
      gap: 4,
      paddingBottom: 6,
      borderBottomColor: theme.colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerCell: {
      color: theme.colors.mutedText,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 4,
      paddingVertical: 6,
      borderBottomColor: theme.colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    cell: {
      fontSize: 12,
    },
    timeCol: {
      width: 80,
    },
    timeText: {
      color: theme.colors.mutedText,
      fontSize: 11,
    },
    valueCol: {
      flex: 1,
      gap: 2,
    },
    barContainer: {
      backgroundColor: theme.colors.border,
      borderRadius: 2,
      height: 4,
      overflow: 'hidden',
    },
    bar: {
      borderRadius: 2,
      height: 4,
    },
    valueText: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    alertText: {
      color: theme.colors.danger,
    },
    warningText: {
      color: '#D97706',
    },
    empty: {
      alignItems: 'center',
      paddingVertical: 20,
    },
    emptyText: {
      color: theme.colors.mutedText,
      fontSize: 14,
    },
  });
}
