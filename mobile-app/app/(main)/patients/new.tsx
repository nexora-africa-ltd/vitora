/**
 * Add New Patient Screen
 *
 * Screen for creating a new patient record.
 *
 * @module app/(main)/patients/new
 */

import React from 'react';
import {
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PatientForm } from '../../../components/patients/PatientForm';
import { patientsApi, CreatePatientData } from '../../../lib/api/patients';
import { colors } from '../../../constants/colors';

/**
 * New Patient screen component
 */
export default function NewPatientScreen(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: CreatePatientData) => patientsApi.create(data),
    onSuccess: () => {
      // Invalidate patient list to refetch
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      Alert.alert('Success', 'Patient created successfully', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message || 'Failed to create patient');
    },
  });

  const handleSubmit = (data: CreatePatientData) => {
    createMutation.mutate(data);
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <PatientForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          loading={createMutation.isPending}
          testID="new-patient-form"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
});
