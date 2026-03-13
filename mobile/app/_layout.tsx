import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { Redirect, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';

import { AppErrorBoundary } from '@/components/app-error-boundary';
import { ScreenContainer, SectionCard } from '@/components/app-ui';
import { TibaBotAssist } from '@/components/tibabot-assist';
import { getGlobalTibaBotConfig } from '@/lib/ai/tibabot-navigation';
import { AuthProvider, useAuth } from '@/lib/auth/auth-context';
import { SessionTimeoutProvider, useSessionTimeout } from '@/lib/auth/session-timeout';
import { initializeSentry } from '@/lib/monitoring/sentry';
import { queryClient } from '@/lib/query/client';
import { initializeCertificatePinning } from '@/lib/security/certificate-pinning';
import { SyncStatusProvider } from '@/lib/sync/status';
import { AppThemeProvider, useAppTheme } from '@/lib/theme/theme-context';

void SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <RootLayoutContent />
    </AppThemeProvider>
  );
}

function RootLayoutContent() {
  const { isDarkMode, theme } = useAppTheme();

  useEffect(() => {
    initializeSentry();
  }, []);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  const navigationTheme = useMemo(
    () => ({
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        background: theme.colors.background,
        card: theme.colors.surface,
        border: theme.colors.border,
        primary: theme.colors.primary,
        text: theme.colors.text,
        notification: theme.colors.accent,
      },
    }),
    [theme]
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionTimeoutProvider>
          <SyncStatusProvider>
            <AppErrorBoundary>
              <ThemeProvider value={navigationTheme}>
                <NavigationStack />
                <StatusBar style={isDarkMode ? 'light' : 'dark'} />
              </ThemeProvider>
            </AppErrorBoundary>
          </SyncStatusProvider>
        </SessionTimeoutProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function NavigationStack() {
  const { isAuthenticated, isHydrating } = useAuth();
  const { isLocked, recordActivity } = useSessionTimeout();
  const pathname = usePathname();
  const globalTibaBotConfig = useMemo(() => getGlobalTibaBotConfig(pathname), [pathname]);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [isSplashHidden, setIsSplashHidden] = useState(false);

  useEffect(() => {
    let active = true;

    initializeCertificatePinning().catch((error) => {
      if (active) {
        setSecurityError(error instanceof Error ? error.message : 'Unable to initialize certificate pinning.');
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isHydrating || isSplashHidden) {
      return;
    }

    SplashScreen.hideAsync()
      .then(() => setIsSplashHidden(true))
      .catch(() => setIsSplashHidden(true));
  }, [isHydrating, isSplashHidden]);

  if (!isHydrating && isAuthenticated && isLocked && pathname !== '/sign-in') {
    return <Redirect href={'/sign-in' as never} />;
  }

  if (securityError) {
    return (
      <ScreenContainer>
        <SectionCard title="Security configuration error" subtitle={securityError}>
          <Text style={styles.securityText}>Production SSL pinning is enabled through EXPO_PUBLIC_API_PIN_* environment variables. Fix the build configuration before continuing.</Text>
        </SectionCard>
      </ScreenContainer>
    );
  }

  return (
    <View
      style={styles.stackShell}
      onStartShouldSetResponderCapture={() => {
        recordActivity();
        return false;
      }}
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="checkin" options={{ presentation: 'card' }} />
        <Stack.Screen name="encounters/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="encounters/[id]/triage" options={{ presentation: 'card' }} />
        <Stack.Screen name="encounters/[id]/edit" options={{ presentation: 'card' }} />
        <Stack.Screen name="encounters/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="laboratory/index" options={{ presentation: 'card' }} />
        <Stack.Screen name="laboratory/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="laboratory/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="patients/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="patients/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="billing/index" options={{ presentation: 'card' }} />
        <Stack.Screen name="billing/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="mch/index" options={{ presentation: 'card' }} />
        <Stack.Screen name="mch/anc/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="mch/immunization" options={{ presentation: 'card' }} />
        <Stack.Screen name="pharmacy/index" options={{ presentation: 'card' }} />
        <Stack.Screen name="pharmacy/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="pharmacy/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="screening/index" options={{ presentation: 'card' }} />
        <Stack.Screen name="screening/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="inpatient/index" options={{ presentation: 'card' }} />
        <Stack.Screen name="inpatient/[wardId]" options={{ presentation: 'card' }} />
        <Stack.Screen name="inpatient/admissions/index" options={{ presentation: 'card' }} />
        <Stack.Screen name="inpatient/admissions/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="inpatient/admissions/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="inpatient/nursing/kardex" options={{ presentation: 'card' }} />
        <Stack.Screen name="inpatient/nursing/rounds" options={{ presentation: 'card' }} />
        <Stack.Screen name="inpatient/nursing/vitals" options={{ presentation: 'card' }} />
        <Stack.Screen name="inpatient/nursing/mar" options={{ presentation: 'card' }} />
        <Stack.Screen name="settings/audit-log" options={{ presentation: 'card' }} />
        <Stack.Screen name="sync/conflicts" options={{ presentation: 'card' }} />
      </Stack>
      {isAuthenticated && !isHydrating && !isLocked && globalTibaBotConfig ? (
        <TibaBotAssist
          inputPlaceholder={globalTibaBotConfig.inputPlaceholder}
          quickActions={globalTibaBotConfig.quickActions}
          sheetTitle={globalTibaBotConfig.sheetTitle}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  securityText: {
    fontSize: 14,
    lineHeight: 20,
  },
  stackShell: {
    flex: 1,
  },
});
