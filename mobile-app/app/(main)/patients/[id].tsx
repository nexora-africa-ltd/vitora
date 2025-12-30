/**
 * Patient Detail Screen
 *
 * Displays detailed information for a single patient.
 * Uses dynamic route parameter [id].
 *
 * @module app/(main)/patients/[id]
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '../../../constants/colors';

/**
 * Patient detail screen showing full patient information
 */
export default function PatientDetail(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Placeholder - will be replaced with actual data fetch
  const patient = {
    id,
    mrn: 'MRN-20251230-0001',
    firstName: 'Loading',
    lastName: '...',
    dateOfBirth: '--',
    gender: '--',
    phoneNumber: '--',
    county: '--',
    subCounty: '--',
    emergencyContactName: '--',
    emergencyContactPhone: '--',
  };

  const InfoRow = ({
    label,
    value,
  }: {
    label: string;
    value: string | null | undefined;
  }) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '--'}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      {/* Header Section */}
      <View style={styles.header}>
        <Text style={styles.patientName}>
          {patient.firstName} {patient.lastName}
        </Text>
        <Text style={styles.mrn}>{patient.mrn}</Text>
      </View>

      {/* Basic Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Basic Information</Text>
        <InfoRow label="Date of Birth" value={patient.dateOfBirth} />
        <InfoRow label="Gender" value={patient.gender} />
        <InfoRow label="Phone Number" value={patient.phoneNumber} />
      </View>

      {/* Location */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location</Text>
        <InfoRow label="County" value={patient.county} />
        <InfoRow label="Sub-County" value={patient.subCounty} />
      </View>

      {/* Emergency Contact */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Emergency Contact</Text>
        <InfoRow label="Name" value={patient.emergencyContactName} />
        <InfoRow label="Phone" value={patient.emergencyContactPhone} />
      </View>

      {/* Actions */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => {
            // TODO: Navigate to edit screen
          }}
          testID="edit-patient-button"
        >
          <Text style={styles.editButtonText}>Edit Patient</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          testID="back-button"
        >
          <Text style={styles.backButtonText}>Back to List</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    padding: 24,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
  },
  patientName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 4,
  },
  mrn: {
    fontSize: 14,
    color: colors.primary[100],
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
  },
  actionsSection: {
    padding: 16,
    gap: 12,
  },
  editButton: {
    backgroundColor: colors.primary[500],
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  editButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  backButtonText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
