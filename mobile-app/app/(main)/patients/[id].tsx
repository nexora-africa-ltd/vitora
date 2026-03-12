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
  Alert,
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '../../../constants/colors';
import { usePatient } from '../../../hooks/usePatients';
import { useCheckSHAEligibility, useSHAEligibility } from '../../../hooks/useSHA';
import { useTheme } from '../../../lib/theme/context';
import { getCoverageStatusLabel } from '../../../lib/types/sha';

/**
 * Patient detail screen showing full patient information
 */
export default function PatientDetail(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { themeColors } = useTheme();

  // Parse ID to number
  const patientId = id ? parseInt(id, 10) : null;

  // Fetch patient data
  const { data: patient, isLoading, error, refetch } = usePatient(patientId);
  const { data: eligibility } = useSHAEligibility(patientId);
  const checkEligibility = useCheckSHAEligibility(patientId);

  const InfoRow = ({
    label,
    value,
  }: {
    label: string;
    value: string | null | undefined;
  }) => (
    <View style={[styles.infoRow, { borderBottomColor: themeColors.border }]}>
      <Text style={[styles.infoLabel, { color: themeColors.text.secondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: themeColors.text.primary }]}>{value || '--'}</Text>
    </View>
  );

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: themeColors.background.primary }]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
        <Text style={[styles.loadingText, { color: themeColors.text.secondary }]}>
          Loading patient...
        </Text>
      </View>
    );
  }

  // Error state
  if (error || !patient) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: themeColors.background.primary }]}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={[styles.errorTitle, { color: themeColors.text.primary }]}>
          Failed to load patient
        </Text>
        <Text style={[styles.errorMessage, { color: themeColors.text.secondary }]}>
          {error?.message || 'Patient not found'}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.backButton, { marginTop: 12 }]}
          onPress={() => router.back()}
        >
          <Text style={[styles.backButtonText, { color: themeColors.text.primary }]}>
            Back to List
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Format gender
  const genderDisplay = patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : 'Other';
  const coverageStatus = eligibility?.coverage_status ?? 'pending';

  const coverageBadgeStyle =
    coverageStatus === 'covered'
      ? { backgroundColor: colors.success.light, color: colors.white }
      : coverageStatus === 'not_covered'
        ? { backgroundColor: colors.error.main, color: colors.white }
        : { backgroundColor: colors.warning.main, color: colors.white };

  const handleCheckEligibility = async () => {
    try {
      await checkEligibility.mutateAsync();
    } catch (mutationError) {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to verify SHA eligibility';
      Alert.alert('SHA Eligibility Check Failed', message);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: themeColors.background.primary }]}>
      {/* Header Section */}
      <View style={styles.header}>
        <Text style={styles.patientName}>
          {patient.first_name} {patient.last_name}
        </Text>
        <Text style={styles.mrn}>{patient.mrn}</Text>
        <View style={[styles.coverageBadge, { backgroundColor: coverageBadgeStyle.backgroundColor }]}>
          <Text style={[styles.coverageBadgeText, { color: coverageBadgeStyle.color }]}>
            {getCoverageStatusLabel(coverageStatus)}
          </Text>
        </View>
      </View>

      {coverageStatus === 'not_covered' ? (
        <View style={styles.warningBanner}>
          <Text style={styles.warningBannerTitle}>SHA Coverage Warning</Text>
          <Text style={styles.warningBannerText}>
            Patient is not covered. Confirm billing or alternate funding before starting a consultation.
          </Text>
        </View>
      ) : null}

      {/* Basic Information */}
      <View style={[styles.section, { borderBottomColor: themeColors.border }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Basic Information</Text>
        <InfoRow label="Date of Birth" value={patient.date_of_birth} />
        <InfoRow label="Gender" value={genderDisplay} />
        <InfoRow label="SHA Number" value={patient.sha_number} />
        <InfoRow label="ID Type" value={patient.identification_type} />
        <InfoRow label="ID Number" value={patient.identification_number} />
        <InfoRow label="Phone Number" value={patient.phone_number} />
        <InfoRow label="National ID" value={patient.national_id} />
        <InfoRow label="Email" value={patient.email} />
      </View>

      {/* SHA Eligibility */}
      <View style={[styles.section, { borderBottomColor: themeColors.border }]}> 
        <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>SHA Eligibility</Text>
        <InfoRow label="Coverage Status" value={getCoverageStatusLabel(coverageStatus)} />
        <InfoRow label="Check Result" value={eligibility?.result} />
        <InfoRow label="Eligible Until" value={eligibility?.eligible_until} />
        <InfoRow
          label="Benefit Balance"
          value={eligibility?.benefit_balance != null ? `KES ${eligibility.benefit_balance}` : undefined}
        />
        <InfoRow label="Reason" value={eligibility?.ineligibility_reason} />

        <TouchableOpacity
          style={styles.secondaryActionButton}
          onPress={handleCheckEligibility}
          disabled={checkEligibility.isPending}
          testID="check-sha-eligibility-button"
        >
          <Text style={styles.secondaryActionButtonText}>
            {checkEligibility.isPending ? 'Checking SHA Eligibility...' : 'Check SHA Eligibility'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Location */}
      <View style={[styles.section, { borderBottomColor: themeColors.border }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Location</Text>
        <InfoRow label="County ID" value={patient.county?.toString()} />
        <InfoRow label="Sub-County ID" value={patient.sub_county?.toString()} />
        <InfoRow label="Address" value={patient.address} />
      </View>

      {/* Emergency Contact */}
      <View style={[styles.section, { borderBottomColor: themeColors.border }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Emergency Contact</Text>
        <InfoRow label="Name" value={patient.emergency_contact_name} />
        <InfoRow label="Phone" value={patient.emergency_contact_phone} />
        <InfoRow label="Relationship" value={patient.emergency_contact_relationship} />
      </View>

      {/* Additional Info */}
      <View style={[styles.section, { borderBottomColor: themeColors.border }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Additional Information</Text>
        <InfoRow label="Occupation" value={patient.occupation} />
        <InfoRow label="Referral Source" value={patient.referral_source} />
        <InfoRow label="Consent Given" value={patient.consent_given ? 'Yes' : 'No'} />
      </View>

      {/* Actions */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={styles.secondaryActionButton}
          onPress={() =>
            router.push({
              pathname: '/(main)/billing/index' as never,
              params: { patient: patient.id.toString() },
            })
          }
          testID="view-billing-button"
        >
          <Text style={styles.secondaryActionButtonText}>View Billing</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => {
            // TODO : Navigate to edit screen
          }}
          testID="edit-patient-button"
        >
          <Text style={styles.editButtonText}>Edit Patient</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: themeColors.background.secondary, borderColor: themeColors.border }]}
          onPress={() => router.back()}
          testID="back-button"
        >
          <Text style={[styles.backButtonText, { color: themeColors.text.primary }]}>Back to List</Text>
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
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
    color: colors.accent[200],
    marginBottom: 12,
  },
  coverageBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.warning.main,
  },
  coverageBadgeText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 12,
  },
  warningBanner: {
    backgroundColor: colors.warning[100],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.warning[300],
    padding: 16,
  },
  warningBannerTitle: {
    color: colors.warning[700],
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  warningBannerText: {
    color: colors.warning[700],
    fontSize: 13,
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
    maxWidth: '60%',
    textAlign: 'right',
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
  secondaryActionButton: {
    backgroundColor: colors.background.secondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary[500],
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryActionButtonText: {
    color: colors.primary[500],
    fontSize: 16,
    fontWeight: '600',
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
