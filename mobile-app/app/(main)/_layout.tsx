/**
 * Main Group Layout
 *
 * Layout for authenticated screens with auth guard.
 * Redirects to login if user is not authenticated.
 * Includes offline banner for connectivity status.
 *
 * @module app/(main)/_layout
 */

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth/context';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { colors } from '../../constants/colors';
import { OfflineBanner } from '../../components/ui/OfflineBanner';

/**
 * Main layout component with authentication guard
 */
export default function MainLayout(): React.JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();
  const { isOffline } = useOfflineStatus();

  // Show loading while checking auth
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  // Render main app layout for authenticated users
  return (
    <View style={styles.container}>
      <OfflineBanner isOffline={isOffline} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.primary[500],
          },
          headerTintColor: colors.white,
          headerTitleStyle: {
            fontWeight: '600',
          },
          contentStyle: {
            backgroundColor: colors.background.primary,
          },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'Dashboard',
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="patients/index"
          options={{
            title: 'Patients',
          }}
        />
        <Stack.Screen
          name="patients/new"
          options={{
            title: 'Add Patient',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="patients/[id]"
          options={{
            title: 'Patient Details',
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: 'Settings',
          }}
        />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
  },
});
