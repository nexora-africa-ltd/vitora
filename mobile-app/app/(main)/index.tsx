/**
 * Dashboard Screen
 *
 * Main dashboard showing patient statistics and quick actions.
 *
 * @module app/(main)/index
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth/context';
import { colors } from '../../constants/colors';

/**
 * Dashboard component with patient stats and navigation
 */
export default function Dashboard(): React.JSX.Element {
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <ScrollView style={styles.container}>
      {/* Welcome Section */}
      <View style={styles.welcomeSection}>
        <Text style={styles.welcomeText}>
          Welcome back, {user?.username || 'User'}
        </Text>
        <Text style={styles.subtitle}>Vitora HMIS Dashboard</Text>
      </View>

      {/* Quick Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>--</Text>
          <Text style={styles.statLabel}>Total Patients</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>--</Text>
          <Text style={styles.statLabel}>Pending Sync</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsSection}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/(main)/patients')}
          testID="view-patients-button"
        >
          <Text style={styles.actionButtonText}>View Patients</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => router.push('/(main)/settings')}
          testID="settings-button"
        >
          <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
            Settings
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.dangerButton]}
          onPress={handleLogout}
          testID="logout-button"
        >
          <Text style={[styles.actionButtonText, styles.dangerButtonText]}>
            Logout
          </Text>
        </TouchableOpacity>
      </View>

      {/* Offline Status */}
      <View style={styles.offlineSection}>
        <Text style={styles.offlineText}>
          Offline Mode: Data will sync when connected
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  welcomeSection: {
    padding: 24,
    backgroundColor: colors.primary[500],
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.primary[100],
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary[600],
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  actionsSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: colors.primary[500],
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.primary[500],
  },
  secondaryButtonText: {
    color: colors.primary[500],
  },
  dangerButton: {
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.semantic.error,
  },
  dangerButtonText: {
    color: colors.semantic.error,
  },
  offlineSection: {
    padding: 16,
    alignItems: 'center',
  },
  offlineText: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
});
