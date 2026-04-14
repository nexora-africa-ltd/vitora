import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';

import { AppButton, AppPicker, AppTextInput, HeroCard, ScreenContainer, SectionCard } from '@/components/app-ui';
import { useAuth } from '@/lib/auth/auth-context';
import { useSessionTimeout } from '@/lib/auth/session-timeout';
import type { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme/theme-context';

export default function SignInScreen() {
  const { apiBaseUrl, apiEnvironmentOptions, isAuthenticated, isHydrating, login, selectedApiEnvironmentId, supportsCustomApiUrl, updateApiBaseUrl, updateApiEnvironment, user } = useAuth();
  const { biometric, clearLock, isLocked, isUnlocking, refreshSecurityState, unlockWithBiometrics } = useSessionTimeout();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [username, setUsername] = useState(user?.username ?? '');
  const [password, setPassword] = useState('');
  const [backendUrl, setBackendUrl] = useState(apiBaseUrl);
  const [backendEnvironmentId, setBackendEnvironmentId] = useState(selectedApiEnvironmentId ?? apiEnvironmentOptions[0]?.id ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasAttemptedAutoUnlockRef = useRef(false);

  useEffect(() => {
    setBackendUrl(apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    setBackendEnvironmentId(selectedApiEnvironmentId ?? apiEnvironmentOptions[0]?.id ?? '');
  }, [apiEnvironmentOptions, selectedApiEnvironmentId]);

  useEffect(() => {
    if (!isLocked) {
      hasAttemptedAutoUnlockRef.current = false;
      return;
    }

    if (!biometric?.enabled || !biometric.available || isUnlocking || hasAttemptedAutoUnlockRef.current) {
      return;
    }

    hasAttemptedAutoUnlockRef.current = true;

    void (async () => {
      const result = await unlockWithBiometrics();
      if (result.success) {
        router.replace('/(tabs)');
      }
    })();
  }, [biometric, isLocked, isUnlocking, unlockWithBiometrics]);

  if (!isHydrating && isAuthenticated && !isLocked) {
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

      clearLock();
      await refreshSecurityState();
      router.replace('/(tabs)');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBiometricUnlock() {
    const result = await unlockWithBiometrics();
    if (!result.success) {
      Alert.alert('Unlock failed', result.error ?? 'Unable to unlock the session.');
      return;
    }

    router.replace('/(tabs)');
  }

  async function handleSaveConnection() {
    try {
      const selectedEnvironment = apiEnvironmentOptions.find((item) => item.id === backendEnvironmentId) ?? null;
      if (!supportsCustomApiUrl && selectedEnvironment) {
        await updateApiEnvironment(selectedEnvironment.id);
      } else if (selectedEnvironment && backendUrl === selectedEnvironment.url) {
        await updateApiEnvironment(selectedEnvironment.id);
      } else {
        await updateApiBaseUrl(backendUrl);
      }

      Alert.alert('Connection updated', supportsCustomApiUrl ? 'The mobile app will use this backend URL for the next request.' : 'The mobile app will use the selected approved backend environment.');
    } catch (error) {
      Alert.alert('Invalid URL', error instanceof Error ? error.message : 'Enter a valid backend URL.');
    }
  }

  function handleEnvironmentChange(nextEnvironmentId: string) {
    setBackendEnvironmentId(nextEnvironmentId);
    const selectedEnvironment = apiEnvironmentOptions.find((item) => item.id === nextEnvironmentId);
    if (selectedEnvironment) {
      setBackendUrl(selectedEnvironment.url);
    }
  }

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <HeroCard
        eyebrow="Vitora HMIS"
        title={isLocked ? 'Session locked' : 'Clinical mobile access'}
        description={
          isLocked
            ? 'Unlock your existing session with biometrics or re-enter your credentials.'
            : 'Use the same database and backend as the Vitora Web, but tuned for bedside registration, search, and encounter review.'
        }
      >
        <Text style={styles.heroCaption}>Backend: {apiBaseUrl || 'Not configured'}</Text>
      </HeroCard>

      {isLocked && biometric?.enabled && biometric.available ? (
        <SectionCard title="Quick unlock" subtitle={`Use ${biometric.label} to resume your session without clearing local data.`}>
          <AppButton label={isUnlocking ? 'Unlocking...' : `Unlock with ${biometric.label}`} onPress={handleBiometricUnlock} disabled={isUnlocking} />
        </SectionCard>
      ) : null}

      <SectionCard title={isLocked ? 'Re-authenticate' : 'Sign in'} subtitle="JWT authentication uses the existing /api/token/ flow from the web app.">
        <AppTextInput label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="Username" />
        <AppTextInput label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password" autoCapitalize="none" />
        <AppButton
          label={isSubmitting ? (isLocked ? 'Unlocking...' : 'Signing in...') : isLocked ? 'Unlock with password' : 'Sign in'}
          onPress={handleSignIn}
          disabled={isSubmitting}
        />
      </SectionCard>

      <SectionCard title="Backend connection" subtitle={supportsCustomApiUrl ? 'Override the API URL for emulators, simulators, or a physical phone on your LAN.' : 'Production builds only allow approved backend environments.'}>
        {apiEnvironmentOptions.length > 0 ? (
          <AppPicker
            label="Backend environment"
            selectedValue={backendEnvironmentId}
            onValueChange={(value) => handleEnvironmentChange(String(value))}
            items={apiEnvironmentOptions.map((item) => ({ label: item.label, value: item.id }))}
          />
        ) : null}
        {supportsCustomApiUrl ? (
          <AppTextInput label="API base URL" value={backendUrl} onChangeText={setBackendUrl} autoCapitalize="none" keyboardType="url" placeholder="http://127.0.0.1:9088" />
        ) : (
          <View style={styles.productionShell}>
            <Text style={styles.helperText}>{backendUrl}</Text>
          </View>
        )}
        <View style={styles.buttonRow}>
          <AppButton label={supportsCustomApiUrl ? 'Save connection' : 'Save environment'} onPress={handleSaveConnection} variant="secondary" />
        </View>
        <Text style={styles.helperText}>
          {supportsCustomApiUrl
            ? 'Only allowlisted backend hosts are available in production so SSL pinning and transport trust stay intact.'
            : 'Only allowlisted backend hosts are available in production so SSL pinning and transport trust stay intact.'}
        </Text>
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
  productionShell: {
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  helperText: {
    color: theme.colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  });
}
