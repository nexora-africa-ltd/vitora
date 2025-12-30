/**
 * Card Component
 *
 * A reusable card component for content containers.
 *
 * @example
 * <Card title="Patient Info">
 *   <Text>John Doe</Text>
 * </Card>
 *
 * <Card onPress={handlePress}>
 *   <Text>Pressable card</Text>
 * </Card>
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { colors } from '@/constants/colors';
import { theme } from '@/constants/theme';

export interface CardProps {
  /** Card content */
  children: React.ReactNode;
  /** Optional title */
  title?: string;
  /** Press handler (makes card pressable) */
  onPress?: () => void;
  /** Test ID for testing */
  testID?: string;
  /** Custom style */
  style?: ViewStyle;
}

export function Card({
  children,
  title,
  onPress,
  testID,
  style,
}: CardProps): React.ReactElement {
  const content = (
    <>
      {title && <Text style={styles.title}>{title}</Text>}
      {children}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        testID={testID}
        style={[styles.card, style]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View testID={testID} style={[styles.card, style]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.paper,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadow.sm,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: theme.spacing.sm,
  },
});
