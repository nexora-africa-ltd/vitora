/**
 * PatientSearch Component
 *
 * Search input for filtering patients by name, MRN, or phone.
 *
 * @example
 * <PatientSearch value={search} onSearch={setSearch} />
 */

import React from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';
import { colors } from '@/constants/colors';
import { theme } from '@/constants/theme';

export interface PatientSearchProps {
  /** Current search value */
  value?: string;
  /** Called when search text changes */
  onSearch: (text: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Test ID for testing */
  testID?: string;
}

export function PatientSearch({
  value = '',
  onSearch,
  placeholder = 'Search by name, MRN, or phone...',
  testID,
}: PatientSearchProps): React.ReactElement {
  const handleClear = () => {
    onSearch('');
  };

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.inputContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onSearch}
          placeholder={placeholder}
          placeholderTextColor={colors.neutral[400]}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {value.length > 0 && (
          <TouchableOpacity
            testID="search-clear"
            style={styles.clearButton}
            onPress={handleClear}
          >
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.background.default,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.paper,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  searchIcon: {
    fontSize: theme.fontSize.md,
    marginRight: theme.spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.fontSize.md,
    color: colors.text.primary,
  },
  clearButton: {
    padding: theme.spacing.xs,
  },
  clearIcon: {
    fontSize: theme.fontSize.sm,
    color: colors.neutral[500],
  },
});
