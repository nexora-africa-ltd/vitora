import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, HeroCard, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme/theme-context';

export default function MoreScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="More"
        title="Support modules"
        description="Phase 2 adds laboratory and pharmacy workflows while keeping the bottom tab bar usable on small screens."
      />

      <SectionCard title="Clinical support" subtitle="Open focused mobile workspaces for laboratory and pharmacy teams.">
        <View style={styles.launcherStack}>
          <AppButton label="Laboratory" onPress={() => router.push('/laboratory' as never)} />
          <Text style={styles.helperText}>Order tracking, results review, specimen workflow, and abnormal result highlighting.</Text>
          <AppButton label="Pharmacy" onPress={() => router.push('/pharmacy' as never)} variant="secondary" />
          <Text style={styles.helperText}>Prescription queue, stock-aware dispensing, and encounter-linked medication flow.</Text>
        </View>
      </SectionCard>

      <SectionCard title="Workspace" subtitle="Settings stay available here without consuming a permanent tab slot.">
        <AppButton label="Settings" onPress={() => router.push('/(tabs)/settings' as never)} variant="ghost" />
      </SectionCard>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    launcherStack: {
      gap: 10,
    },
    helperText: {
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 18,
    },
  });
}