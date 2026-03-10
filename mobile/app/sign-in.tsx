import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';

import { AppButton, AppTextInput, HeroCard, ScreenContainer, SectionCard } from '@/components/app-ui';
import { useAuth } from '@/lib/auth/auth-context';
import type { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme/theme-context';

export default function SignInScreen() {
  const { apiBaseUrl, isAuthenticated, isHydrating, login, updateApiBaseUrl } = useAuth();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [backendUrl, setBackendUrl] = useState(apiBaseUrl);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isHydrating && isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  async function handleSignIn() {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Missing credentials', 'Enter both username and password to sign in.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateApiBaseUrl(backendUrl);
      const result = await login(username.trim(), password);

      if (!result.success) {
        Alert.alert(result.mfaRequired ? 'MFA required' : 'Sign-in failed', result.error ?? 'Unable to sign in.');
        return;
      }

      router.replace('/(tabs)');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveConnection() {
    try {
      await updateApiBaseUrl(backendUrl);
      Alert.alert('Connection updated', 'The mobile app will use this backend URL for the next request.');
    } catch (error) {
      Alert.alert('Invalid URL', error instanceof Error ? error.message : 'Enter a valid backend URL.');
    }
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <HeroCard
        eyebrow="Vitora HMIS"
        title="Clinical mobile access"
        description="Use the same Django backend as the web app, but tuned for bedside registration, search, and encounter review."
      >
        <Text style={styles.heroCaption}>Backend: {apiBaseUrl || 'Not configured'}</Text>
      </HeroCard>

      <SectionCard title="Sign in" subtitle="JWT authentication uses the existing /api/token/ flow from the web app.">
        <AppTextInput label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="testuser" />
        <AppTextInput label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password" autoCapitalize="none" />
        <AppButton label={isSubmitting ? 'Signing in...' : 'Sign in'} onPress={handleSignIn} disabled={isSubmitting} />
      </SectionCard>

      <SectionCard title="Backend connection" subtitle="Override the API URL for emulators, simulators, or a physical phone on your LAN.">
        <AppTextInput label="API base URL" value={backendUrl} onChangeText={setBackendUrl} autoCapitalize="none" keyboardType="url" placeholder="http://127.0.0.1:9088" />
        <View style={styles.buttonRow}>
          <AppButton label="Save connection" onPress={handleSaveConnection} variant="secondary" />
        </View>
        <Text style={styles.helperText}>Android emulator usually needs http://10.0.2.2:9088. Physical devices need your machine&apos;s LAN IP.</Text>
      </SectionCard>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  content: {
    paddingTop: 24,
  },
  heroCaption: {
    color: '#F8EFE6',
    fontSize: 13,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
  },
  helperText: {
    color: theme.colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  });
}