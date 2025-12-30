/**
 * PatientList Component
 *
 * Renders a scrollable list of patients with loading and empty states.
 *
 * @example
 * <PatientList
 *   patients={patients}
 *   onPatientPress={handlePatientPress}
 *   loading={isLoading}
 * />
 */

import React from 'react';
import { FlatList, StyleSheet, RefreshControl } from 'react-native';
import { colors } from '@/constants/colors';
import { theme } from '@/constants/theme';
import type { Patient } from '@/lib/api/patients';
import { PatientCard } from './PatientCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';

export interface PatientListProps {
  /** Array of patients to display */
  patients: Patient[];
  /** Called when a patient card is pressed */
  onPatientPress: (patient: Patient) => void;
  /** Show loading indicator */
  loading?: boolean;
  /** Show refreshing indicator */
  refreshing?: boolean;
  /** Called when list is pulled to refresh */
  onRefresh?: () => void;
  /** Called when end of list is reached */
  onEndReached?: () => void;
  /** Custom empty state title */
  emptyTitle?: string;
  /** Custom empty state description */
  emptyDescription?: string;
  /** Test ID for testing */
  testID?: string;
}

export function PatientList({
  patients,
  onPatientPress,
  loading = false,
  refreshing = false,
  onRefresh,
  onEndReached,
  emptyTitle = 'No patients found',
  emptyDescription = 'Try adjusting your search or add a new patient',
  testID,
}: PatientListProps): React.ReactElement {
  if (loading && patients.length === 0) {
    return <LoadingSpinner testID="loading-spinner" message="Loading patients..." />;
  }

  if (!loading && patients.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        testID="empty-state"
      />
    );
  }

  return (
    <FlatList
      testID={testID}
      data={patients}
      keyExtractor={(item) => item.id.toString()}
      renderItem={({ item }) => (
        <PatientCard patient={item} onPress={onPatientPress} />
      )}
      contentContainerStyle={styles.container}
      initialNumToRender={10}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary[500]]}
            tintColor={colors.primary[500]}
          />
        ) : undefined
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
});
