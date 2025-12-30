/**
 * LoadingSpinner Component
 *
 * A reusable loading indicator component.
 *
 * @example
 * <LoadingSpinner />
 * <LoadingSpinner size="large" />
 * <LoadingSpinner message="Loading patients..." />
 */

import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '@/constants/colors';
import { theme } from '@/constants/theme';

export interface LoadingSpinnerProps {
  /** Spinner size */
  size?: 'small' | 'large';
  /** Optional loading message */
  message?: string;
  /** Test ID for testing */
  testID?: string;
  /** Custom color */
  color?: string;
}

export function LoadingSpinner({
  size = 'large',
  message,
  testID,
  color = colors.primary[500],
}: LoadingSpinnerProps): React.ReactElement {
  return (
    <View style={styles.container} testID={testID}>
      <ActivityIndicator size={size} color={color} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  message: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
