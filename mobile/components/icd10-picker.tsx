import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { AppTheme } from '@/constants/theme';
import { encountersApi } from '@/lib/api/encounters';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { ICD10Code } from '@/lib/types/encounter';

type ICD10PickerProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSelect: (code: ICD10Code) => void;
  selectedCode?: ICD10Code | null;
  disabled?: boolean;
  debounceMs?: number;
};

export function ICD10Picker({ value, onChangeText, onSelect, selectedCode, disabled = false, debounceMs = 300 }: ICD10PickerProps) {
  const { isDarkMode, theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, isDarkMode), [isDarkMode, theme]);
  const [debouncedQuery, setDebouncedQuery] = useState(value.trim());
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(value.trim());
    }, debounceMs);

    return () => clearTimeout(timeout);
  }, [debounceMs, value]);

  const searchQuery = useQuery({
    queryKey: ['icd10-search', debouncedQuery],
    queryFn: () => encountersApi.searchICD10(debouncedQuery),
    enabled: debouncedQuery.length >= 2 && isFocused && !disabled,
  });

  const showResults = useMemo(
    () => isFocused && debouncedQuery.length >= 2 && (searchQuery.data?.length ?? 0) > 0,
    [debouncedQuery.length, isFocused, searchQuery.data]
  );

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>ICD-10 diagnosis search</Text>
      <TextInput
        autoCapitalize="words"
        editable={!disabled}
        onBlur={() => {
          setTimeout(() => setIsFocused(false), 120);
        }}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        placeholder="Search malaria, pneumonia, hypertension..."
        placeholderTextColor={theme.colors.mutedText}
        style={[styles.input, disabled && styles.inputDisabled]}
        value={value}
      />

      {selectedCode ? (
        <View style={styles.selectedCard}>
          <Text style={styles.selectedCode}>{selectedCode.code}</Text>
          <Text style={styles.selectedDescription}>{selectedCode.description}</Text>
        </View>
      ) : null}

      {searchQuery.isFetching && isFocused ? (
        <View style={styles.feedbackRow}>
          <ActivityIndicator color={theme.colors.primary} size="small" />
          <Text style={styles.feedbackText}>Searching ICD-10 codes…</Text>
        </View>
      ) : null}

      {showResults ? (
        <View style={styles.resultsShell}>
          <FlatList
            data={searchQuery.data}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item);
                  setIsFocused(false);
                }}
                style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
              >
                <Text style={styles.resultCode}>{item.code}</Text>
                <Text style={styles.resultDescription}>{item.description}</Text>
              </Pressable>
            )}
            scrollEnabled={false}
          />
        </View>
      ) : null}

      {isFocused && debouncedQuery.length >= 2 && !searchQuery.isFetching && (searchQuery.data?.length ?? 0) === 0 ? (
        <Text style={styles.feedbackText}>No ICD-10 matches found for this search.</Text>
      ) : null}

      <Text style={styles.helperText}>Free-text diagnosis still works if no code is selected.</Text>
    </View>
  );
}

function createStyles(theme: AppTheme, isDarkMode: boolean) {
  return StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  label: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputDisabled: {
    opacity: 0.55,
  },
  selectedCard: {
    backgroundColor: isDarkMode ? '#18313A' : '#D7EEE7',
    borderRadius: theme.radius.sm,
    gap: 4,
    padding: 12,
  },
  selectedCode: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  selectedDescription: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  feedbackRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  feedbackText: {
    color: theme.colors.mutedText,
    fontSize: 13,
  },
  helperText: {
    color: theme.colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  resultsShell: {
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  resultRow: {
    borderBottomColor: theme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  resultRowPressed: {
    backgroundColor: isDarkMode ? '#1D3142' : '#F0E8DA',
  },
  resultCode: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  resultDescription: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  });
}
