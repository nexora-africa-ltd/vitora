/**
 * Index Route - Entry Point
 *
 * Redirects users based on authentication status:
 * - Authenticated → Dashboard (/(main))
 * - Not authenticated → Login (/(auth)/login)
 *
 * @module app/index
 */

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth/context';
import { colors } from '../constants/colors';

/**
 * Index component that handles initial routing based on auth state
 */
export default function Index(): React.JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading spinner while checking auth state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  // Redirect based on auth state
  if (isAuthenticated) {
    return <Redirect href="/(main)" />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
  },
});
