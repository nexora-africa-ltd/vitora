/**
 * Button Component
 *
 * A reusable button component with multiple variants.
 * Variants: primary, secondary, danger
 *
 * @example
 * <Button title="Submit" onPress={handleSubmit} />
 * <Button title="Cancel" variant="secondary" onPress={handleCancel} />
 * <Button title="Delete" variant="danger" onPress={handleDelete} />
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { colors } from '@/constants/colors';
import { theme } from '@/constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps {
  /** Button text */
  title: string;
  /** Press handler */
  onPress: () => void;
  /** Button variant */
  variant?: ButtonVariant;
  /** Disable the button */
  disabled?: boolean;
  /** Show loading spinner */
  loading?: boolean;
  /** Test ID for testing */
  testID?: string;
  /** Custom style */
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  testID,
  style,
}: ButtonProps): React.ReactElement {
  const isDisabled = disabled || loading;

  const getBackgroundColor = (): string => {
    if (isDisabled) {
      return colors.neutral[300];
    }
    switch (variant) {
      case 'secondary':
        return colors.secondary[500];
      case 'danger':
        return colors.error.main;
      default:
        return colors.primary[500];
    }
  };

  const getTextColor = (): string => {
    if (isDisabled) {
      return colors.neutral[500];
    }
    return colors.neutral[0];
  };

  const buttonStyles: ViewStyle[] = [
    styles.button,
    { backgroundColor: getBackgroundColor() },
    style as ViewStyle,
  ].filter(Boolean);

  const textStyles: TextStyle[] = [styles.text, { color: getTextColor() }];

  return (
    <TouchableOpacity
      testID={testID}
      style={buttonStyles}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          testID={testID ? `${testID}-loading` : 'btn-loading'}
          color={getTextColor()}
          size="small"
        />
      ) : (
        <Text style={textStyles}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  text: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
});
