import { useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AppButton, AppPicker, AppTextInput, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import { useAuth } from '@/lib/auth/auth-context';
import { SESSION_TIMEOUT_OPTIONS, useSessionTimeout } from '@/lib/auth/session-timeout';
import { getCertificatePinningStatus } from '@/lib/security/certificate-pinning';
import { useAppTheme } from '@/lib/theme/theme-context';

export default function SettingsScreen() {
  const { apiBaseUrl, logout, updateApiBaseUrl, user } = useAuth();
  const { biometric, lockSession, setBiometricEnabled, setTimeoutMs, timeoutMs } = useSessionTimeout();
  const { isDarkMode, mode, resolvedMode, setMode, theme } = useAppTheme();
  const [backendUrl, setBackendUrl] = useState(apiBaseUrl);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const pinningStatus = useMemo(() => getCertificatePinningStatus(), []);
  const appearanceItems = useMemo(
    () => [
      { label: 'Use system setting', value: 'system' },
      { label: 'Light', value: 'light' },
      { label: 'Dark', value: 'dark' },
    ],
    []
  );

  async function handleSave() {
    await updateApiBaseUrl(backendUrl);
    Alert.alert('Saved', 'Future requests will use the updated backend URL.');
  }

  async function handleLogout() {
    await logout();
    router.replace('/sign-in' as never);
  }

  async function handleBiometricToggle() {
    try {
      await setBiometricEnabled(!(biometric?.enabled ?? false));
      Alert.alert(
        biometric?.enabled ? 'Biometric unlock disabled' : 'Biometric unlock enabled',
        biometric?.enabled ? 'Future auto-lock events will require password re-entry.' : 'Future auto-lock events can be resumed with device biometrics.'
      );
    } catch (error) {
      Alert.alert('Biometric setup required', error instanceof Error ? error.message : 'Unable to change biometric settings.');
    }
  }

  return (
    <ScreenContainer>
      <SectionCard title="Account" subtitle="The app stores tokens securely and reuses the backend user object returned by JWT login.">
        <Text style={styles.userName}>{user?.first_name || user?.username || 'Unknown user'}</Text>
        <Text style={styles.metaText}>{user?.username}</Text>
        <View style={styles.roleRow}>
          <Pill label={user?.role || 'No role'} tone="neutral" />
          {user?.facility ? <Pill label={user.facility.name} tone="primary" /> : null}
        </View>
      </SectionCard>

      <SectionCard title="Backend" subtitle="Use a local URL for emulators or your LAN IP when testing on a physical phone.">
        <AppTextInput label="API base URL" value={backendUrl} onChangeText={setBackendUrl} autoCapitalize="none" keyboardType="url" />
        <AppButton label="Save backend URL" onPress={handleSave} />
        <Text style={styles.helperText}>
          {Platform.OS === 'android'
            ? 'Android emulator usually needs http://10.0.2.2:9088.'
            : 'Simulator and web default to http://127.0.0.1:9088.'}
        </Text>
      </SectionCard>

      <SectionCard title="Appearance" subtitle="Default behavior follows the system theme unless you override it here.">
        <View style={styles.roleRow}>
          <Pill label={`Active: ${resolvedMode === 'dark' ? 'Dark' : 'Light'}`} tone={isDarkMode ? 'warning' : 'neutral'} />
          <Pill label={mode === 'system' ? 'Following system' : 'Manual override'} tone="primary" />
        </View>
        <AppPicker label="Theme mode" selectedValue={mode} onValueChange={(value) => void setMode(value as 'system' | 'light' | 'dark')} items={appearanceItems} />
      </SectionCard>

      <SectionCard title="Security" subtitle="Biometric unlock, inactivity timeout, and transport security status for this device.">
        <View style={styles.roleRow}>
          <Pill label={biometric?.enabled ? `${biometric.label} enabled` : 'Biometric unlock off'} tone={biometric?.enabled ? 'primary' : 'neutral'} />
          <Pill label={pinningStatus.enabled ? 'SSL pinning active' : pinningStatus.configured ? 'Pinning awaits native build' : 'Pinning not configured'} tone={pinningStatus.enabled ? 'primary' : 'warning'} />
        </View>
        <AppPicker
          label="Auto-lock after"
          selectedValue={timeoutMs}
          onValueChange={(value) => void setTimeoutMs(Number(value))}
          items={SESSION_TIMEOUT_OPTIONS.map((item) => ({ label: item.label, value: item.value }))}
        />
        <AppButton
          label={biometric?.enabled ? `Disable ${biometric.label}` : `Enable ${biometric?.label ?? 'biometric'} unlock`}
          onPress={handleBiometricToggle}
          variant="secondary"
        />
        <AppButton label="Lock now" onPress={lockSession} variant="ghost" />
      </SectionCard>

      <SectionCard title="Audit log" subtitle="Review your own recent actions from the backend audit trail.">
        <AppButton label="Open audit log" onPress={() => router.push('/settings/audit-log' as never)} variant="secondary" />
      </SectionCard>

      <SectionCard title="Session" subtitle="Log out to clear secure tokens and reset cached backend data.">
        <AppButton label="Log out" onPress={handleLogout} variant="danger" />
      </SectionCard>
    </ScreenContainer>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
  return StyleSheet.create({
  userName: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  metaText: {
    color: theme.colors.mutedText,
    fontSize: 13,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  helperText: {
    color: theme.colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  });
}