import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, HeroCard, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { getLaboratoryLauncherConfig, getPharmacyLauncherConfig, getSupportWorkspaceTitle } from '@/lib/auth/role-access';
import { useAuth } from '@/lib/auth/auth-context';
import { useAppTheme } from '@/lib/theme/theme-context';

export default function MoreScreen() {
  const { user } = useAuth();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const laboratoryLauncher = useMemo(() => getLaboratoryLauncherConfig(user), [user]);
  const pharmacyLauncher = useMemo(() => getPharmacyLauncherConfig(user), [user]);
  const workspaceTitle = useMemo(() => getSupportWorkspaceTitle(user), [user]);

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="More"
        title={workspaceTitle}
        description="Phase 2 adds laboratory and pharmacy workflows while keeping the bottom tab bar usable on small screens, with entry points tailored to the signed-in user role."
      />

      <SectionCard title="Clinical support" subtitle="Open focused workspaces that adapt to clinicians, laboratory staff, and pharmacy staff.">
        <View style={styles.launcherStack}>
          <AppButton label={laboratoryLauncher.label} onPress={() => router.push('/laboratory' as never)} variant={laboratoryLauncher.variant} />
          <Text style={styles.helperText}>{laboratoryLauncher.description}</Text>
          <AppButton label={pharmacyLauncher.label} onPress={() => router.push('/pharmacy' as never)} variant={pharmacyLauncher.variant} />
          <Text style={styles.helperText}>{pharmacyLauncher.description}</Text>
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