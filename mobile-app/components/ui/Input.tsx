/**
 * Input Component
 *
 * A reusable text input component with label and error support.
 *
 * @example
 * <Input label="Email" value={email} onChangeText={setEmail} />
 * <Input label="Password" secureTextEntry value={password} onChangeText={setPassword} />
 */

import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { colors } from '@/constants/colors';
import { theme } from '@/constants/theme';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  /** Input label */
  label: string;
  /** Current value */
  value: string;
  /** Change handler */
  onChangeText: (text: string) => void;
  /** Error message */
  error?: string;
  /** Container style */
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  value,
  onChangeText,
  error,
  placeholder,
  secureTextEntry,
  testID,
  containerStyle,
  ...rest
}: InputProps): React.ReactElement {
  const hasError = Boolean(error);

  const inputStyles = [
    styles.input,
    hasError && styles.inputError,
  ];

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        style={inputStyles}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.neutral[400]}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        {...rest}
      />
      {hasError && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: colors.text.secondary,
    marginBottom: theme.spacing.xs,
  },
  input: {
    backgroundColor: colors.background.paper,
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: colors.text.primary,
    minHeight: 48,
  },
  inputError: {
    borderColor: colors.error.main,
  },
  error: {
    fontSize: theme.fontSize.xs,
    color: colors.error.main,
    marginTop: theme.spacing.xs,
  },
});
