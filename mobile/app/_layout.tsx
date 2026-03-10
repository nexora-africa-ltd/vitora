import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AuthProvider } from '@/lib/auth/auth-context';
import { queryClient } from '@/lib/query/client';
import { appTheme } from '@/constants/theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const navigationTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: appTheme.colors.background,
      card: appTheme.colors.surface,
      border: appTheme.colors.border,
      primary: appTheme.colors.primary,
      text: appTheme.colors.text,
      notification: appTheme.colors.accent,
    },
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={navigationTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="checkin" options={{ presentation: 'card' }} />
            <Stack.Screen name="encounters/[id]" options={{ presentation: 'card' }} />
            <Stack.Screen name="encounters/[id]/triage" options={{ presentation: 'card' }} />
            <Stack.Screen name="encounters/[id]/edit" options={{ presentation: 'card' }} />
            <Stack.Screen name="encounters/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="patients/[id]" options={{ presentation: 'card' }} />
            <Stack.Screen name="patients/new" options={{ presentation: 'modal' }} />
          </Stack>
          <StatusBar style="dark" />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
