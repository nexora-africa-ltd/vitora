import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';

import type { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme/theme-context';

type ScreenContainerProps = {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
};

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type AppButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
};

type AppTextInputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'url';
  multiline?: boolean;
};

type AppPickerProps<T extends string | number> = {
  label: string;
  selectedValue: T;
  items: { label: string; value: T }[];
  onValueChange: (value: T) => void;
  enabled?: boolean;
};

export function ScreenContainer({ children, contentContainerStyle, scroll = true }: ScreenContainerProps) {
  const styles = useSharedStyles();

  if (!scroll) {
    return <SafeAreaView style={styles.safeArea}>{children}</SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.screenContent, contentContainerStyle]} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function HeroCard({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  const { isDarkMode } = useAppTheme();
  const styles = useSharedStyles();

  return (
    <LinearGradient colors={isDarkMode ? ['#10253A', '#0A4F4E', '#A7572F'] : ['#17324D', '#0F766E', '#E08A5C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
      <Text style={styles.heroEyebrow}>{eyebrow}</Text>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroDescription}>{description}</Text>
      {children ? <View style={styles.heroChildren}>{children}</View> : null}
    </LinearGradient>
  );
}

export function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const styles = useSharedStyles();

  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function MetricCard({ label, value, tone = 'primary' }: { label: string; value: string; tone?: 'primary' | 'accent' | 'secondary' }) {
  const { theme } = useAppTheme();
  const styles = useSharedStyles();
  const accentColor = tone === 'accent' ? theme.colors.accent : tone === 'secondary' ? theme.colors.secondary : theme.colors.primary;
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricBar, { backgroundColor: accentColor }]} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function AppButton({ label, onPress, disabled = false, variant = 'primary' }: AppButtonProps) {
  const styles = useSharedStyles();
  const buttonStyles = [
    styles.button,
    variant === 'secondary' && styles.buttonSecondary,
    variant === 'ghost' && styles.buttonGhost,
    variant === 'danger' && styles.buttonDanger,
    disabled && styles.buttonDisabled,
  ];
  const labelStyles = [
    styles.buttonLabel,
    (variant === 'secondary' || variant === 'ghost') && styles.buttonLabelDark,
  ];

  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [buttonStyles, pressed && !disabled && styles.buttonPressed]}>
      <Text style={labelStyles}>{label}</Text>
    </Pressable>
  );
}

export function AppTextInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
  multiline = false,
}: AppTextInputProps) {
  const { theme } = useAppTheme();
  const styles = useSharedStyles();

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.mutedText}
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
      />
    </View>
  );
}

export function AppPicker<T extends string | number>({ label, selectedValue, items, onValueChange, enabled = true }: AppPickerProps<T>) {
  const { theme } = useAppTheme();
  const styles = useSharedStyles();

  if (Platform.OS === 'web') {
    const selectedStringValue = String(selectedValue);

    return (
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <select
          disabled={!enabled}
          value={selectedStringValue}
          onChange={(event) => {
            const nextValue = event.target.value;
            const matchingItem = items.find((item) => String(item.value) === nextValue);
            if (matchingItem) {
              onValueChange(matchingItem.value);
            }
          }}
          style={{
            width: '100%',
            minHeight: 48,
            borderRadius: theme.radius.sm,
            border: `1px solid ${theme.colors.border}`,
            backgroundColor: theme.colors.elevated,
            color: theme.colors.text,
            padding: '0 14px',
            fontSize: 15,
            outline: 'none',
            opacity: enabled ? 1 : 0.55,
          }}
        >
          {items.map((item) => (
            <option
              key={`${label}-${String(item.value)}`}
              value={String(item.value)}
              style={{
                backgroundColor: theme.colors.elevated,
                color: theme.colors.text,
              }}
            >
              {item.label}
            </option>
          ))}
        </select>
      </View>
    );
  }

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.pickerShell, !enabled && styles.inputDisabled]}>
        <Picker
          dropdownIconColor={theme.colors.mutedText}
          enabled={enabled}
          itemStyle={styles.pickerItem}
          mode={Platform.OS === 'android' ? 'dropdown' : undefined}
          selectedValue={selectedValue}
          style={styles.picker}
          onValueChange={(value) => onValueChange(value as T)}
        >
          {items.map((item) => (
            <Picker.Item key={`${label}-${String(item.value)}`} label={item.label} value={item.value} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

export function DataRow({ label, value }: { label: string; value: string | null | undefined }) {
  const styles = useSharedStyles();

  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value && value.trim().length > 0 ? value : 'Not provided'}</Text>
    </View>
  );
}

export function Pill({ label, tone = 'primary' }: { label: string; tone?: 'primary' | 'warning' | 'danger' | 'neutral' }) {
  const styles = useSharedStyles();
  const toneStyles = [
    tone === 'primary' && styles.pillPrimary,
    tone === 'warning' && styles.pillWarning,
    tone === 'danger' && styles.pillDanger,
    tone === 'neutral' && styles.pillNeutral,
  ];

  return (
    <View style={[styles.pill, ...toneStyles]}>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

export function LoadingState({ message }: { message: string }) {
  const { theme } = useAppTheme();
  const styles = useSharedStyles();

  return (
    <View style={styles.feedbackState}>
      <ActivityIndicator color={theme.colors.primary} size="large" />
      <Text style={styles.feedbackTitle}>{message}</Text>
    </View>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  const styles = useSharedStyles();

  return (
    <View style={styles.feedbackState}>
      <Text style={styles.feedbackTitle}>{title}</Text>
      <Text style={styles.feedbackDescription}>{description}</Text>
    </View>
  );
}

function useSharedStyles() {
  const { isDarkMode, theme } = useAppTheme();

  return useMemo(() => createStyles(theme, isDarkMode), [isDarkMode, theme]);
}

function createStyles(theme: AppTheme, isDarkMode: boolean) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  screenContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  heroCard: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    gap: theme.spacing.xs,
  },
  heroEyebrow: {
    color: '#E7F6F4',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  heroDescription: {
    color: '#F7EFE7',
    fontSize: 15,
    lineHeight: 22,
  },
  heroChildren: {
    marginTop: theme.spacing.sm,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: theme.colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  metricCard: {
    backgroundColor: theme.colors.elevated,
    borderRadius: theme.radius.md,
    gap: 10,
    minHeight: 112,
    overflow: 'hidden',
    padding: theme.spacing.md,
  },
  metricBar: {
    borderRadius: theme.radius.pill,
    height: 6,
    width: 48,
  },
  metricLabel: {
    color: theme.colors.mutedText,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  button: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 20,
  },
  buttonSecondary: {
    backgroundColor: isDarkMode ? '#18313A' : '#D7EEE7',
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  buttonDanger: {
    backgroundColor: theme.colors.danger,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    transform: [{ scale: 0.99 }],
  },
  buttonLabel: {
    color: isDarkMode ? '#0F1720' : theme.colors.elevated,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonLabelDark: {
    color: theme.colors.text,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
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
  inputMultiline: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  inputDisabled: {
    opacity: 0.55,
  },
  pickerShell: {
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  picker: {
    color: theme.colors.text,
    minHeight: 48,
  },
  pickerItem: {
    color: theme.colors.text,
  },
  dataRow: {
    gap: 4,
  },
  dataLabel: {
    color: theme.colors.mutedText,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dataValue: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillPrimary: {
    backgroundColor: isDarkMode ? '#18313A' : '#D7EEE7',
  },
  pillWarning: {
    backgroundColor: isDarkMode ? '#45361A' : '#F6E6C8',
  },
  pillDanger: {
    backgroundColor: isDarkMode ? '#452320' : '#F6D4D0',
  },
  pillNeutral: {
    backgroundColor: isDarkMode ? '#233240' : '#E7E2DA',
  },
  pillLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  feedbackState: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 28,
  },
  feedbackTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  feedbackDescription: {
    color: theme.colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  });
}