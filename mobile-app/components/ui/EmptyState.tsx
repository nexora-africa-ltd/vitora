/**
 * EmptyState Component
 *
 * A reusable component for displaying empty states.
 *
 * @example
 * <EmptyState title="No patients found" />
 * <EmptyState
 *   title="No data"
 *   description="Try adding some items"
 *   actionLabel="Add Item"
 *   onAction={handleAdd}
 * />
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '@/constants/colors';
import { theme } from '@/constants/theme';
import { Button } from './Button';

export interface EmptyStateProps {
  /** Main title */
  title: string;
  /** Optional description */
  description?: string;
  /** Icon component */
  icon?: React.ReactNode;
  /** Action button label */
  actionLabel?: string;
  /** Action button handler */
  onAction?: () => void;
  /** Test ID for testing */
  testID?: string;
  /** Custom container style */
  style?: ViewStyle;
}

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  testID,
  style,
}: EmptyStateProps): React.ReactElement {
  return (
    <View style={[styles.container, style]} testID={testID}>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {actionLabel && onAction && (
        <View style={styles.actionContainer}>
          <Button title={actionLabel} onPress={onAction} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  iconContainer: {
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  description: {
    fontSize: theme.fontSize.md,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  actionContainer: {
    marginTop: theme.spacing.md,
  },
});
