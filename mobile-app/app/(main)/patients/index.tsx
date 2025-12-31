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
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Data hooks
  const { data: patients = [], isLoading, error, refetch } = usePatients({ search: searchQuery });
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

  const renderPatientItem = ({ item }: { item: Patient }) => (
    <TouchableOpacity
      style={styles.patientCard}
      onPress={() => handlePatientPress(item.id.toString())}
      testID={`patient-item-${item.id}`}
    >
      <View style={styles.patientInfo}>
        <Text style={styles.patientName}>
          {item.first_name} {item.last_name}
        </Text>
        <Text style={styles.patientMrn}>MRN: {item.mrn}</Text>
        <Text style={styles.patientDetails}>
          {item.gender === 'M' ? 'Male' : item.gender === 'F' ? 'Female' : 'Other'} • DOB: {item.date_of_birth}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>
        {error ? 'Error loading patients' : 'No patients found'}
      </Text>
      <Text style={styles.emptyStateSubtext}>
        {error
          ? 'Pull down to retry'
          : searchQuery
            ? 'Try a different search term'
            : 'Add patients to get started'}
      </Text>
    </View>
  );

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

  return (
    <View style={styles.container}>
      {/* Sync Status Badge */}
      {renderSyncBadge()}

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name, MRN, or phone..."
          placeholderTextColor={colors.text.tertiary}
   yncBadge: {
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
    color: colors.text.secondary={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary[500]]}
              tintColor={colors.primary[500]}
            />
          }
          testID="patient-list"
        />
      )}

      {/* Add Patient FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          router.push('/(main)/patients/new' as never);
        }}
        testID="add-patient-button"
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
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
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
    marginLeft: 8,
  },
  emptyListContainer: {
    flex: 1,
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
    color: colors.text.secondary,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: colors.text.tertiary,
    textAlign: 'center',
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
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    fontSize: 28,
    color: colors.white,
    fontWeight: '300',
  },
});
