/**
 * PatientForm Component
 *
 * Form for creating or editing a patient.
 *
 * @example
 * <PatientForm onSubmit={handleSubmit} />
 * <PatientForm patient={existingPatient} onSubmit={handleUpdate} />
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors } from '@/constants/colors';
import { theme } from '@/constants/theme';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { Patient, CreatePatientData } from '@/lib/api/patients';

export interface PatientFormProps {
  /** Existing patient data (for editing) */
  patient?: Patient;
  /** Called when form is submitted */
  onSubmit: (data: CreatePatientData) => void;
  /** Loading state */
  loading?: boolean;
  /** Called when cancel is pressed */
  onCancel?: () => void;
  /** Test ID for testing */
  testID?: string;
}

interface FormData {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
  phone_number: string;
  national_id: string;
  county: string;
  sub_county: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
}

interface FormErrors {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  gender?: string;
  county?: string;
  sub_county?: string;
}

const initialFormData: FormData = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  gender: 'M',
  phone_number: '',
  national_id: '',
  county: '',
  sub_county: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relationship: '',
};

export function PatientForm({
  patient,
  onSubmit,
  loading = false,
  onCancel,
  testID,
}: PatientFormProps): React.ReactElement {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});

  const isEditing = !!patient;

  useEffect(() => {
    if (patient) {
      setFormData({
        first_name: patient.first_name,
        last_name: patient.last_name,
        date_of_birth: patient.date_of_birth,
        gender: patient.gender,
        phone_number: patient.phone_number || '',
        national_id: patient.national_id || '',
        county: patient.county.toString(),
        sub_county: patient.sub_county.toString(),
        emergency_contact_name: patient.emergency_contact_name || '',
        emergency_contact_phone: patient.emergency_contact_phone || '',
        emergency_contact_relationship: patient.emergency_contact_relationship || '',
      });
    }
  }, [patient]);

  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when field is modified
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    }
    if (!formData.last_name.trim()) {
      newErrors.last_name = 'Last name is required';
    }
    if (!formData.date_of_birth.trim()) {
      newErrors.date_of_birth = 'Date of birth is required';
    } else {
      const dob = new Date(formData.date_of_birth);
      if (isNaN(dob.getTime())) {
        newErrors.date_of_birth = 'Invalid date format (use YYYY-MM-DD)';
      } else if (dob > new Date()) {
        newErrors.date_of_birth = 'Date of birth cannot be in the future';
      }
    }
    if (!formData.county.trim()) {
      newErrors.county = 'County is required';
    }
    if (!formData.sub_county.trim()) {
      newErrors.sub_county = 'Sub-county is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) {
      return;
    }

    const data: CreatePatientData = {
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim(),
      date_of_birth: formData.date_of_birth,
      gender: formData.gender,
      county: parseInt(formData.county, 10),
      sub_county: parseInt(formData.sub_county, 10),
      phone_number: formData.phone_number || null,
      national_id: formData.national_id || null,
      emergency_contact_name: formData.emergency_contact_name || undefined,
      emergency_contact_phone: formData.emergency_contact_phone || undefined,
      emergency_contact_relationship:
        formData.emergency_contact_relationship || undefined,
    };

    onSubmit(data);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID={testID}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Basic Information</Text>

        <Input
          label="First Name *"
          value={formData.first_name}
          onChangeText={(v) => updateField('first_name', v)}
          error={errors.first_name}
          placeholder="Enter first name"
          testID="input-first-name"
        />

        <Input
          label="Last Name *"
          value={formData.last_name}
          onChangeText={(v) => updateField('last_name', v)}
          error={errors.last_name}
          placeholder="Enter last name"
          testID="input-last-name"
        />

        <Input
          label="Date of Birth *"
          value={formData.date_of_birth}
          onChangeText={(v) => updateField('date_of_birth', v)}
          error={errors.date_of_birth}
          placeholder="YYYY-MM-DD"
          testID="input-dob"
        />

        <View style={styles.genderContainer}>
          <Text style={styles.label}>Gender *</Text>
          <View style={styles.genderButtons}>
            {(['M', 'F', 'O'] as const).map((g) => (
              <Button
                key={g}
                title={g === 'M' ? 'Male' : g === 'F' ? 'Female' : 'Other'}
                variant={formData.gender === g ? 'primary' : 'secondary'}
                onPress={() => updateField('gender', g)}
                style={styles.genderButton}
              />
            ))}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Contact Information</Text>

        <Input
          label="Phone Number"
          value={formData.phone_number}
          onChangeText={(v) => updateField('phone_number', v)}
          placeholder="+254..."
          keyboardType="phone-pad"
          testID="input-phone"
        />

        <Input
          label="National ID"
          value={formData.national_id}
          onChangeText={(v) => updateField('national_id', v)}
          placeholder="Enter National ID"
          testID="input-national-id"
        />

        <Text style={styles.sectionTitle}>Location *</Text>

        <Input
          label="County ID"
          value={formData.county}
          onChangeText={(v) => updateField('county', v)}
          error={errors.county}
          placeholder="Enter county ID (1-47)"
          keyboardType="numeric"
          testID="input-county"
        />

        <Input
          label="Sub-County ID"
          value={formData.sub_county}
          onChangeText={(v) => updateField('sub_county', v)}
          error={errors.sub_county}
          placeholder="Enter sub-county ID"
          keyboardType="numeric"
          testID="input-sub-county"
        />

        <Text style={styles.sectionTitle}>Emergency Contact</Text>

        <Input
          label="Contact Name"
          value={formData.emergency_contact_name}
          onChangeText={(v) => updateField('emergency_contact_name', v)}
          placeholder="Enter contact name"
          testID="input-emergency-name"
        />

        <Input
          label="Contact Phone"
          value={formData.emergency_contact_phone}
          onChangeText={(v) => updateField('emergency_contact_phone', v)}
          placeholder="+254..."
          keyboardType="phone-pad"
          testID="input-emergency-phone"
        />

        <Input
          label="Relationship"
          value={formData.emergency_contact_relationship}
          onChangeText={(v) => updateField('emergency_contact_relationship', v)}
          placeholder="e.g., Spouse, Parent, Sibling"
          testID="input-emergency-relationship"
        />

        <View style={styles.buttonContainer}>
          {onCancel && (
            <Button
              title="Cancel"
              variant="secondary"
              onPress={onCancel}
              style={styles.cancelButton}
            />
          )}
          <Button
            title={isEditing ? 'Update Patient' : 'Register Patient'}
            onPress={handleSubmit}
            loading={loading}
            style={styles.submitButton}
            testID="submit-button"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: colors.text.primary,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: colors.text.secondary,
    marginBottom: theme.spacing.xs,
  },
  genderContainer: {
    marginBottom: theme.spacing.md,
  },
  genderButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  genderButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
  },
  buttonContainer: {
    flexDirection: 'row',
    marginTop: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  cancelButton: {
    flex: 1,
  },
  submitButton: {
    flex: 2,
  },
});
