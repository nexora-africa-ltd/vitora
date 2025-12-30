/**
 * PatientCard Component
 *
 * Displays a patient summary in a card format.
 *
 * @example
 * <PatientCard patient={patient} onPress={handlePress} />
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@/constants/colors';
import { theme } from '@/constants/theme';
import type { Patient } from '@/lib/api/patients';

export interface PatientCardProps {
  /** Patient data */
  patient: Patient;
  /** Called when card is pressed */
  onPress?: (patient: Patient) => void;
  /** Test ID for testing */
  testID?: string;
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Get gender display text
 */
function getGenderDisplay(gender: 'M' | 'F' | 'O'): string {
  switch (gender) {
    case 'M':
      return 'Male';
    case 'F':
      return 'Female';
    case 'O':
      return 'Other';
    default:
      return gender;
  }
}

/**
 * Get gender color
 */
function getGenderColor(gender: 'M' | 'F' | 'O'): string {
  return colors.gender[gender === 'M' ? 'male' : gender === 'F' ? 'female' : 'other'];
}

export function PatientCard({
  patient,
  onPress,
  testID,
}: PatientCardProps): React.ReactElement {
  const age = calculateAge(patient.date_of_birth);
  const fullName = `${patient.first_name} ${patient.last_name}`;
  const genderDisplay = getGenderDisplay(patient.gender);
  const genderColor = getGenderColor(patient.gender);

  const handlePress = () => {
    onPress?.(patient);
  };

  const content = (
    <>
      <View style={styles.header}>
        <View style={[styles.genderIndicator, { backgroundColor: genderColor }]} />
        <View style={styles.headerText}>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.mrn}>{patient.mrn}</Text>
        </View>
      </View>
      <View style={styles.details}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Age</Text>
          <Text style={styles.detailValue}>{age} years</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Gender</Text>
          <Text style={[styles.detailValue, { color: genderColor }]}>
            {genderDisplay}
          </Text>
        </View>
        {patient.phone_number && (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Phone</Text>
            <Text style={styles.detailValue}>{patient.phone_number}</Text>
          </View>
        )}
      </View>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        testID={testID}
        style={styles.card}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View testID={testID} style={styles.card}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.paper,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadow.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  genderIndicator: {
    width: 4,
    height: 40,
    borderRadius: theme.borderRadius.sm,
    marginRight: theme.spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: colors.text.primary,
  },
  mrn: {
    fontSize: theme.fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
  },
  detailItem: {
    marginRight: theme.spacing.lg,
    marginBottom: theme.spacing.xs,
  },
  detailLabel: {
    fontSize: theme.fontSize.xs,
    color: colors.text.hint,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: theme.fontSize.sm,
    color: colors.text.primary,
    fontWeight: theme.fontWeight.medium,
  },
});
