import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, HeroCard, ScreenContainer, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { getInpatientLauncherConfig, getLaboratoryLauncherConfig, getPharmacyLauncherConfig, getSupportWorkspaceTitle } from '@/lib/auth/role-access';
import { useAuth } from '@/lib/auth/auth-context';
import { useAppTheme } from '@/lib/theme/theme-context';

export default function MoreScreen() {
  const { user } = useAuth();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const laboratoryLauncher = useMemo(() => getLaboratoryLauncherConfig(user), [user]);
  const pharmacyLauncher = useMemo(() => getPharmacyLauncherConfig(user), [user]);
  const inpatientLauncher = useMemo(() => getInpatientLauncherConfig(user), [user]);
  const workspaceTitle = useMemo(() => getSupportWorkspaceTitle(user), [user]);

  return (
    <ScreenContainer>
      <HeroCard
        eyebrow="More"
        title={workspaceTitle}
        description="Laboratory, pharmacy, and inpatient workflows on the go."
      />

      <SectionCard title="Front desk" subtitle="Patient check-in and registration workflows.">
        <View style={styles.launcherStack}>
          <AppButton label="Check-in patient" onPress={() => router.push('/checkin' as never)} />
          <Text style={styles.helperText}>Look up a patient and start a visit with triage routing.</Text>
        </View>
      </SectionCard>

      <SectionCard title="Clinical support" subtitle="Open focused workspaces that adapt to clinicians, laboratory staff, and pharmacy staff.">
        <View style={styles.launcherStack}>
          <AppButton label="Billing summaries" onPress={() => router.push('/billing' as never)} variant="secondary" />
          <Text style={styles.helperText}>Review invoice balances and payment status without leaving the bedside workflow.</Text>
          <AppButton label={laboratoryLauncher.label} onPress={() => router.push('/laboratory' as never)} variant={laboratoryLauncher.variant} />
          <Text style={styles.helperText}>{laboratoryLauncher.description}</Text>
          <AppButton label={pharmacyLauncher.label} onPress={() => router.push('/pharmacy' as never)} variant={pharmacyLauncher.variant} />
          <Text style={styles.helperText}>{pharmacyLauncher.description}</Text>
        </View>
      </SectionCard>

      <SectionCard title="Inpatient" subtitle="Ward management, bed boards, and bedside nursing workflows.">
        <View style={styles.launcherStack}>
          <AppButton label={inpatientLauncher.label} onPress={() => router.push('/inpatient' as never)} variant={inpatientLauncher.variant} />
          <Text style={styles.helperText}>{inpatientLauncher.description}</Text>
        </View>
      </SectionCard>

      <SectionCard title="Workspace" subtitle="Custom settings for your Vitora app.">
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