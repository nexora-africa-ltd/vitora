import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AuthProvider } from '@/lib/auth/auth-context';
import { queryClient } from '@/lib/query/client';
import { AppThemeProvider, useAppTheme } from '@/lib/theme/theme-context';

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

  const navigationTheme = {
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
          <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
