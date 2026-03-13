import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Platform, Pressable, RefreshControl, ScrollView, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle, type FlatListProps, type ImageStyle, type ListRenderItemInfo, type StyleProp as RNStyleProp } from 'react-native';
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
  selectedValue: T | null;
  items: { label: string; value: T }[];
  onValueChange: (value: T) => void;
  enabled?: boolean;
};

type ScreenListProps<ItemT> = {
  data: ItemT[];
  renderItem: (info: ListRenderItemInfo<ItemT>) => React.ReactElement | null;
  keyExtractor: (item: ItemT, index: number) => string;
  header?: React.ReactElement | null;
  footer?: React.ReactElement | null;
  emptyTitle: string;
  emptyDescription: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  estimatedItemHeight?: number;
  contentContainerStyle?: RNStyleProp<ViewStyle>;
} & Pick<FlatListProps<ItemT>, 'ItemSeparatorComponent'>;

type CachedImageProps = {
  accessibilityLabel?: string;
  contentFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  placeholderLabel?: string;
  source: { uri: string } | number;
  style: RNStyleProp<ImageStyle>;
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

export function ScreenList<ItemT>({
  contentContainerStyle,
  data,
  emptyDescription,
  emptyTitle,
  estimatedItemHeight,
  footer,
  header,
  ItemSeparatorComponent,
  keyExtractor,
  onRefresh,
  refreshing = false,
  renderItem,
}: ScreenListProps<ItemT>) {
  const styles = useSharedStyles();

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={[styles.screenContent, styles.screenListContent, contentContainerStyle]}
        data={data}
        initialNumToRender={8}
        ItemSeparatorComponent={ItemSeparatorComponent}
        keyExtractor={keyExtractor}
        ListEmptyComponent={<EmptyState title={emptyTitle} description={emptyDescription} />}
        ListFooterComponent={footer}
        ListHeaderComponent={header}
        maxToRenderPerBatch={8}
        removeClippedSubviews
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        updateCellsBatchingPeriod={50}
        windowSize={10}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
        getItemLayout={estimatedItemHeight ? (_data, index) => ({ index, length: estimatedItemHeight, offset: estimatedItemHeight * index }) : undefined}
      />
    </SafeAreaView>
  );
}

export function HeroCard({ eyebrow, title, titleAccessory, description, children }: { eyebrow: string; title: string; titleAccessory?: React.ReactNode; description: string; children?: React.ReactNode }) {
  const { isDarkMode } = useAppTheme();
  const styles = useSharedStyles();
  const motion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, {
          toValue: 1,
          duration: 5200,
          useNativeDriver: true,
        }),
        Animated.timing(motion, {
          toValue: 0,
          duration: 5200,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [motion]);

  const orbOneTransform = {
    transform: [
      {
        translateX: motion.interpolate({
          inputRange: [0, 1],
          outputRange: [-18, 24],
        }),
      },
      {
        translateY: motion.interpolate({
          inputRange: [0, 1],
          outputRange: [-8, 18],
        }),
      },
      {
        scale: motion.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.12],
        }),
      },
    ],
    opacity: motion.interpolate({
      inputRange: [0, 1],
      outputRange: [0.34, 0.5],
    }),
  };

  const orbTwoTransform = {
    transform: [
      {
        translateX: motion.interpolate({
          inputRange: [0, 1],
          outputRange: [22, -14],
        }),
      },
      {
        translateY: motion.interpolate({
          inputRange: [0, 1],
          outputRange: [12, -16],
        }),
      },
      {
        scale: motion.interpolate({
          inputRange: [0, 1],
          outputRange: [1.08, 0.96],
        }),
      },
    ],
    opacity: motion.interpolate({
      inputRange: [0, 1],
      outputRange: [0.2, 0.34],
    }),
  };

  const gradientColors: readonly [string, string, string] = isDarkMode
    ? ['#05131D', '#10384B', '#5C1E34']
    : ['#4E0B18', '#156073', '#7B2937'];

  return (
    <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
      <Animated.View pointerEvents="none" style={[styles.heroOrbPrimary, orbOneTransform]} />
      <Animated.View pointerEvents="none" style={[styles.heroOrbSecondary, orbTwoTransform]} />
      <View style={styles.heroNoise} pointerEvents="none" />
      <View style={styles.heroContent}>
        <Text style={styles.heroEyebrow}>{eyebrow}</Text>
        <View style={styles.heroTitleRow}>
          <Text style={styles.heroTitle}>{title}</Text>
          {titleAccessory ? <View style={styles.heroTitleAccessory}>{titleAccessory}</View> : null}
        </View>
        <Text style={styles.heroDescription}>{description}</Text>
        {children ? <View style={styles.heroChildren}>{children}</View> : null}
      </View>
    </LinearGradient>
  );
}

export function SectionCard({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  const styles = useSharedStyles();

  return (
    <View style={styles.sectionCard}>
      {title ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
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
  const [hidden, setHidden] = useState(true);

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={secureTextEntry ? styles.inputRow : undefined}>
        <TextInput
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          multiline={multiline}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.mutedText}
          secureTextEntry={secureTextEntry && hidden}
          style={[styles.input, multiline && styles.inputMultiline, secureTextEntry && styles.inputFlex]}
          value={value}
        />
        {secureTextEntry && (
          <Pressable onPress={() => setHidden((prev) => !prev)} style={styles.eyeButton} hitSlop={8}>
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.colors.mutedText} />
          </Pressable>
        )}
      </View>
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

export function LoadingState({ message, fullScreen = false }: { message: string; fullScreen?: boolean }) {
  const { theme } = useAppTheme();
  const styles = useSharedStyles();

  return (
    <View style={[styles.feedbackState, fullScreen && styles.feedbackStateFull]}>
      <ActivityIndicator color={theme.colors.primary} size="large" />
      <Text style={styles.feedbackTitle}>{message}</Text>
    </View>
  );
}

export function ListSkeleton({ itemCount = 4, showHero = false }: { itemCount?: number; showHero?: boolean }) {
  const styles = useSharedStyles();

  return (
    <ScreenContainer>
      {showHero ? <SkeletonCard height={132} /> : null}
      <SkeletonCard height={110} />
      <View style={styles.skeletonList}>
        {Array.from({ length: itemCount }).map((_, index) => (
          <SkeletonCard key={`skeleton-${index}`} height={110} />
        ))}
      </View>
    </ScreenContainer>
  );
}

export function SkeletonCard({ height = 96 }: { height?: number }) {
  const styles = useSharedStyles();

  return (
    <View style={styles.skeletonCard}>
      <SkeletonBlock height={12} width="36%" />
      <SkeletonBlock height={22} width="58%" />
      <SkeletonBlock height={14} width="82%" />
      <SkeletonBlock height={height > 100 ? 14 : 12} width="68%" />
    </View>
  );
}

export function SkeletonBlock({ height, width }: { height: number; width: number | `${number}%` }) {
  const styles = useSharedStyles();
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 650, useNativeDriver: true }),
      ])
    );
    animation.start();

    return () => {
      animation.stop();
    };
  }, [opacity]);

  return <Animated.View style={[styles.skeletonBlock, { height, opacity, width }]} />;
}

export function CachedImage({ accessibilityLabel, contentFit = 'cover', placeholderLabel = 'Image unavailable', source, style }: CachedImageProps) {
  const styles = useSharedStyles();
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <View style={[styles.imageFallback, style]} accessibilityLabel={placeholderLabel}>
        <Ionicons name="image-outline" size={24} color={styles.imageFallbackIcon.color} />
        <Text style={styles.imageFallbackLabel}>{placeholderLabel}</Text>
      </View>
    );
  }

  return (
    <Image
      accessibilityLabel={accessibilityLabel}
      cachePolicy="memory-disk"
      contentFit={contentFit}
      onError={() => setHasError(true)}
      placeholder={{ blurhash: 'LGFFaXYk^6#M@-5c,1J5@[or[Q6.' }}
      source={source}
      style={style}
      transition={120}
    />
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
    flexGrow: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  heroCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    padding: theme.spacing.xl,
  },
  heroContent: {
    gap: theme.spacing.xs,
    zIndex: 2,
  },
  heroEyebrow: {
    color: isDarkMode ? '#DAB38F' : '#F3D6BE',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#F8FAFC',
    flexShrink: 1,
    fontSize: 28,
    fontWeight: '800',
  },
  heroTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  heroTitleAccessory: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDescription: {
    color: 'rgba(248, 250, 252, 0.8)',
    fontSize: 15,
    lineHeight: 22,
  },
  heroChildren: {
    marginTop: theme.spacing.sm,
  },
  heroOrbPrimary: {
    position: 'absolute',
    top: -58,
    right: -32,
    width: 196,
    height: 196,
    borderRadius: 999,
    backgroundColor: isDarkMode ? 'rgba(212, 165, 116, 0.24)' : 'rgba(255, 241, 220, 0.24)',
    zIndex: 0,
  },
  heroOrbSecondary: {
    position: 'absolute',
    bottom: -78,
    left: -40,
    width: 184,
    height: 184,
    borderRadius: 999,
    backgroundColor: isDarkMode ? 'rgba(77, 160, 184, 0.24)' : 'rgba(110, 221, 236, 0.18)',
    zIndex: 0,
  },
  heroNoise: {
    position: 'absolute',
    inset: 0,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.035)',
    zIndex: 1,
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
  inputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
  },
  inputFlex: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
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
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 28,
  },
  feedbackStateFull: {
    flex: 1,
    minHeight: 320,
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
  screenListContent: {
    flexGrow: 1,
  },
  skeletonList: {
    gap: theme.spacing.md,
  },
  skeletonCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
  },
  skeletonBlock: {
    backgroundColor: isDarkMode ? '#243746' : '#D9D2C7',
    borderRadius: theme.radius.pill,
  },
  imageFallback: {
    alignItems: 'center',
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    gap: 8,
    justifyContent: 'center',
    minHeight: 80,
    padding: theme.spacing.md,
  },
  imageFallbackIcon: {
    color: theme.colors.mutedText,
  },
  imageFallbackLabel: {
    color: theme.colors.mutedText,
    fontSize: 12,
    textAlign: 'center',
  },
  });
}