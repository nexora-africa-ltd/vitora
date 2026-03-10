import { useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AppButton, AppTextInput, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import { useAuth } from '@/lib/auth/auth-context';
import { useAppTheme } from '@/lib/theme/theme-context';

export default function SettingsScreen() {
  const { apiBaseUrl, logout, updateApiBaseUrl, user } = useAuth();
  const { isDarkMode, toggleTheme, theme } = useAppTheme();
  const [backendUrl, setBackendUrl] = useState(apiBaseUrl);
  const styles = useMemo(() => createStyles(theme), [theme]);

  async function handleSave() {
    await updateApiBaseUrl(backendUrl);
    Alert.alert('Saved', 'Future requests will use the updated backend URL.');
  }

  async function handleLogout() {
    await logout();
    router.replace('/sign-in' as never);
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

      <SectionCard title="Appearance" subtitle="Choose the app color mode stored on this device.">
        <View style={styles.roleRow}>
          <Pill label={isDarkMode ? 'Dark mode' : 'Light mode'} tone={isDarkMode ? 'warning' : 'neutral'} />
        </View>
        <AppButton label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'} onPress={() => void toggleTheme()} variant="secondary" />
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