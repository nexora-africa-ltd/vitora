/**
 * Patient List Screen
 *
 * Displays list of patients with search functionality.
 * Works offline using WatermelonDB.
 *
 * @module app/(main)/patients/index
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../../../constants/colors';

// Placeholder patient type until we connect to the database
interface PatientItem {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
}

/**
 * Patient list screen with search
 */
export default function PatientList(): React.JSX.Element {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading] = useState(false);

  // Placeholder data - will be replaced with actual data from repository
  const patients: PatientItem[] = [];

  const handlePatientPress = (patientId: string) => {
    router.push(`/(main)/patients/${patientId}`);
  };

  const renderPatientItem = ({ item }: { item: PatientItem }) => (
    <TouchableOpacity
      style={styles.patientCard}
      onPress={() => handlePatientPress(item.id)}
      testID={`patient-item-${item.id}`}
    >
      <View style={styles.patientInfo}>
        <Text style={styles.patientName}>
          {item.firstName} {item.lastName}
        </Text>
        <Text style={styles.patientMrn}>MRN: {item.mrn}</Text>
        <Text style={styles.patientDetails}>
          {item.gender} • DOB: {item.dateOfBirth}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>No patients found</Text>
      <Text style={styles.emptyStateSubtext}>
        {searchQuery
          ? 'Try a different search term'
          : 'Add patients to get started'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name, MRN, or phone..."
          placeholderTextColor={colors.text.tertiary}
          testID="patient-search-input"
        />
      </View>

      {/* Patient List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      ) : (
        <FlatList
          data={patients}
          keyExtractor={(item) => item.id}
          renderItem={renderPatientItem}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={
            patients.length === 0 ? styles.emptyListContainer : undefined
          }
          testID="patient-list"
        />
      )}

      {/* Add Patient FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          // TODO: Navigate to add patient screen
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
