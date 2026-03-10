import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';

import { appTheme } from '@/constants/theme';

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
  return (
    <LinearGradient colors={['#17324D', '#0F766E', '#E08A5C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
      <Text style={styles.heroEyebrow}>{eyebrow}</Text>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroDescription}>{description}</Text>
      {children ? <View style={styles.heroChildren}>{children}</View> : null}
    </LinearGradient>
  );
}

export function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
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
  const accentColor = tone === 'accent' ? appTheme.colors.accent : tone === 'secondary' ? appTheme.colors.secondary : appTheme.colors.primary;
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricBar, { backgroundColor: accentColor }]} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function AppButton({ label, onPress, disabled = false, variant = 'primary' }: AppButtonProps) {
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
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={appTheme.colors.mutedText}
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
      />
    </View>
  );
}

export function AppPicker<T extends string | number>({ label, selectedValue, items, onValueChange, enabled = true }: AppPickerProps<T>) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.pickerShell, !enabled && styles.inputDisabled]}>
        <Picker enabled={enabled} selectedValue={selectedValue} onValueChange={(value) => onValueChange(value as T)}>
          {items.map((item) => (
            <Picker.Item key={`${label}-${String(item.value)}`} label={item.label} value={item.value} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

export function DataRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value && value.trim().length > 0 ? value : 'Not provided'}</Text>
    </View>
  );
}

export function Pill({ label, tone = 'primary' }: { label: string; tone?: 'primary' | 'warning' | 'danger' | 'neutral' }) {
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
  return (
    <View style={styles.feedbackState}>
      <ActivityIndicator color={appTheme.colors.primary} size="large" />
      <Text style={styles.feedbackTitle}>{message}</Text>
    </View>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.feedbackState}>
      <Text style={styles.feedbackTitle}>{title}</Text>
      <Text style={styles.feedbackDescription}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: appTheme.colors.background,
  },
  screenContent: {
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.lg,
  },
  heroCard: {
    borderRadius: appTheme.radius.lg,
    padding: appTheme.spacing.xl,
    gap: appTheme.spacing.xs,
  },
  heroEyebrow: {
    color: '#E7F6F4',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: appTheme.colors.elevated,
    fontSize: 28,
    fontWeight: '800',
  },
  heroDescription: {
    color: '#F7EFE7',
    fontSize: 15,
    lineHeight: 22,
  },
  heroChildren: {
    marginTop: appTheme.spacing.sm,
  },
  sectionCard: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.md,
    padding: appTheme.spacing.lg,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: appTheme.colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  metricCard: {
    backgroundColor: appTheme.colors.elevated,
    borderRadius: appTheme.radius.md,
    gap: 10,
    minHeight: 112,
    overflow: 'hidden',
    padding: appTheme.spacing.md,
  },
  metricBar: {
    borderRadius: appTheme.radius.pill,
    height: 6,
    width: 48,
  },
  metricLabel: {
    color: appTheme.colors.mutedText,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: appTheme.colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  button: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 20,
  },
  buttonSecondary: {
    backgroundColor: '#D7EEE7',
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderColor: appTheme.colors.border,
    borderWidth: 1,
  },
  buttonDanger: {
    backgroundColor: appTheme.colors.danger,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    transform: [{ scale: 0.99 }],
  },
  buttonLabel: {
    color: appTheme.colors.elevated,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonLabelDark: {
    color: appTheme.colors.text,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    backgroundColor: appTheme.colors.elevated,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    color: appTheme.colors.text,
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
    backgroundColor: appTheme.colors.elevated,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dataRow: {
    gap: 4,
  },
  dataLabel: {
    color: appTheme.colors.mutedText,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dataValue: {
    color: appTheme.colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillPrimary: {
    backgroundColor: '#D7EEE7',
  },
  pillWarning: {
    backgroundColor: '#F6E6C8',
  },
  pillDanger: {
    backgroundColor: '#F6D4D0',
  },
  pillNeutral: {
    backgroundColor: '#E7E2DA',
  },
  pillLabel: {
    color: appTheme.colors.text,
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
    color: appTheme.colors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  feedbackDescription: {
    color: appTheme.colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});