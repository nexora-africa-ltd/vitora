/**
 * Patient List Screen
 *
 * Displays list of patients with search functionality.
 * Works offline using WatermelonDB with sync capability.
 *
 * @module app/(main)/patients/index
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../../../constants/colors';
import { useTheme } from '../../../lib/theme/context';
import { usePatients } from '../../../hooks/usePatients';
import { useSyncStatus } from '../../../hooks/useSyncStatus';
import { useOfflineStatus } from '../../../hooks/useOfflineStatus';
import { syncProcessor } from '../../../lib/sync/processor';
import type { Patient } from '../../../lib/api/patients';

/**
 * Patient list screen with search and pull-to-refresh
 */
export default function PatientListScreen(): React.JSX.Element {
  const router = useRouter();
  const { themeColors } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Data hooks
  const {
    data: patientsResponse,
    isLoading,
    error,
    refetch,
  } = usePatients({ search: searchQuery });
  const patients = patientsResponse?.results ?? [];
  const { pendingCount, hasPending, refreshStatus } = useSyncStatus();
  const { isOffline } = useOfflineStatus();

  const handlePatientPress = (patientId: string) => {
    router.push(`/(main)/patients/${patientId}`);
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // If online, try to sync pending changes first
      if (!isOffline && hasPending) {
        const result = await syncProcessor.processQueue({ checkNetwork: true });
        if (result.failed > 0) {
          Alert.alert(
            'Sync Partially Complete',
            `${result.succeeded} changes synced, ${result.failed} failed.`
          );
        }
      }

      // Refresh data
      await refetch();
      await refreshStatus();
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [isOffline, hasPending, refetch, refreshStatus]);

  const renderSyncBadge = () => {
    if (!hasPending) return null;
    return (
      <View style={styles.syncBadge}>
        <Text style={styles.syncBadgeText}>
          {pendingCount} pending {isOffline ? '(offline)' : ''}
        </Text>
      </View>
    );
  };

  // Dynamic styles based on theme
  const dynamicStyles = {
    container: {
      backgroundColor: themeColors.background.primary,
    },
    searchContainer: {
      backgroundColor: themeColors.background.secondary,
      borderBottomColor: themeColors.border,
    },
    searchInput: {
      backgroundColor: themeColors.card,
      color: themeColors.text.primary,
      borderColor: themeColors.border,
    },
    patientCard: {
      backgroundColor: themeColors.card,
      borderColor: themeColors.border,
    },
    patientName: {
      color: themeColors.text.primary,
    },
    patientDetails: {
      color: themeColors.text.secondary,
    },
    emptyStateText: {
      color: themeColors.text.primary,
    },
    emptyStateSubtext: {
      color: themeColors.text.secondary,
    },
  };

  return (
    <View style={[styles.container, dynamicStyles.container]}>
      {/* Sync Status Badge */}
      {renderSyncBadge()}

      {/* Search Bar */}
      <View style={[styles.searchContainer, dynamicStyles.searchContainer]}>
        <TextInput
          style={[styles.searchInput, dynamicStyles.searchInput]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name, MRN, or phone..."
          placeholderTextColor={themeColors.text.tertiary}
          testID="patient-search-input"
        />
      </View>

      {/* Loading State */}
      {isLoading && !isRefreshing ? (
        <View style={[styles.loadingContainer, dynamicStyles.container]}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text style={[styles.loadingText, { color: themeColors.text.secondary }]}>
            Loading patients...
          </Text>
        </View>
      ) : error ? (
        <View style={[styles.errorContainer, dynamicStyles.container]}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={[styles.errorTitle, dynamicStyles.emptyStateText]}>
            Failed to load patients
          </Text>
          <Text style={[styles.errorMessage, dynamicStyles.emptyStateSubtext]}>
            {error.message || 'Check your connection and try again'}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={patients}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }: { item: Patient }) => (
            <TouchableOpacity
              style={[styles.patientCard, dynamicStyles.patientCard]}
              onPress={() => handlePatientPress(item.id.toString())}
              testID={`patient-item-${item.id}`}
            >
              <View style={styles.patientInfo}>
                <Text style={[styles.patientName, dynamicStyles.patientName]}>
                  {item.first_name} {item.last_name}
                </Text>
                <Text style={[styles.patientMrn, dynamicStyles.patientDetails]}>MRN: {item.mrn}</Text>
                <Text style={[styles.patientDetails, dynamicStyles.patientDetails]}>
                  {item.gender === 'M' ? 'Male' : item.gender === 'F' ? 'Female' : 'Other'} • DOB:{' '}
                  {item.date_of_birth}
                </Text>
              </View>
              <Text style={[styles.chevron, dynamicStyles.patientDetails]}>›</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={[styles.emptyStateText, dynamicStyles.emptyStateText]}>
                No patients found
              </Text>
              <Text style={[styles.emptyStateSubtext, dynamicStyles.emptyStateSubtext]}>
                {searchQuery
                  ? 'Try a different search term'
                  : 'Add patients to get started'}
              </Text>
            </View>
          }
          contentContainerStyle={patients.length === 0 ? styles.emptyListContent : undefined}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary[500]}
              colors={[colors.primary[500]]}
            />
          }
          testID="patient-list"
        />
      )}

      {/* Add Patient FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(main)/patients/new')}
        testID="add-patient-fab"
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  syncBadge: {
    backgroundColor: colors.warning[100],
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.warning[200],
  },
  syncBadgeText: {
    fontSize: 12,
    color: colors.warning[700],
    textAlign: 'center',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: colors.background.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  searchInput: {
    backgroundColor: colors.background.primary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: colors.primary[500],
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  patientInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  patientMrn: {
    fontSize: 14,
    color: colors.primary[600],
    marginBottom: 2,
  },
  patientDetails: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  chevron: {
    fontSize: 24,
    color: colors.text.tertiary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  emptyListContent: {
    flexGrow: 1,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    fontSize: 28,
    color: colors.white,
    fontWeight: '600',
  },
});
