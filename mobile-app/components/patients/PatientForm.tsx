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
import { LocationPicker } from '@/components/ui/LocationPicker';
import { DatePicker } from '@/components/ui/DatePicker';
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
  county: number | null;
  sub_county: number | null;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
}

interface FormErrors {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  gender?: string;
  phone_number?: string;
  national_id?: string;
  county?: string;
  sub_county?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
}

const initialFormData: FormData = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  gender: 'M',
  phone_number: '',
  national_id: '',
  county: null,
  sub_county: null,
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
        county: patient.county,
        sub_county: patient.sub_county,
        emergency_contact_name: patient.emergency_contact_name || '',
        emergency_contact_phone: patient.emergency_contact_phone || '',
        emergency_contact_relationship: patient.emergency_contact_relationship || '',
      });
    }
  }, [patient]);

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when field is modified
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    // Name validation: minimum 2 characters, no punctuation except hyphen/apostrophe
    const nameRegex = /^[a-zA-Z][a-zA-Z'-]{1,}$/;
    const forbiddenChars = /[0-9!@#$%^&*()_+=\[\]{}|\\:;"<>,.?\/~`]/;
    
    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    } else if (formData.first_name.trim().length < 2) {
      newErrors.first_name = 'First name must be at least 2 characters';
    } else if (forbiddenChars.test(formData.first_name)) {
      newErrors.first_name = 'First name cannot contain numbers or special characters';
    } else if (!nameRegex.test(formData.first_name.trim())) {
      newErrors.first_name = 'First name must start with a letter';
    }

    if (!formData.last_name.trim()) {
      newErrors.last_name = 'Last name is required';
    } else if (formData.last_name.trim().length < 2) {
      newErrors.last_name = 'Last name must be at least 2 characters';
    } else if (forbiddenChars.test(formData.last_name)) {
      newErrors.last_name = 'Last name cannot contain numbers or special characters';
    } else if (!nameRegex.test(formData.last_name.trim())) {
      newErrors.last_name = 'Last name must start with a letter';
    }

    // Date of birth validation
    if (!formData.date_of_birth.trim()) {
      newErrors.date_of_birth = 'Date of birth is required';
    } else {
      // Validate format YYYY-MM-DD
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(formData.date_of_birth)) {
        newErrors.date_of_birth = 'Invalid date format (use YYYY-MM-DD)';
      } else {
        const dob = new Date(formData.date_of_birth);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (isNaN(dob.getTime())) {
          newErrors.date_of_birth = 'Invalid date';
        } else if (dob > today) {
          newErrors.date_of_birth = 'Date of birth cannot be in the future';
        } else {
          // Check reasonable age (not older than 150 years)
          const minDate = new Date();
          minDate.setFullYear(minDate.getFullYear() - 150);
          if (dob < minDate) {
            newErrors.date_of_birth = 'Please enter a valid date of birth';
          }
          
          // Check month and day are valid
          const [year, month, day] = formData.date_of_birth.split('-').map(Number);
          const testDate = new Date(year, month - 1, day);
          if (testDate.getMonth() !== month - 1 || testDate.getDate() !== day) {
            newErrors.date_of_birth = 'Invalid date (check month and day)';
          }
        }
      }
    }

    // Phone number validation (Kenya format)
    if (formData.phone_number && formData.phone_number.trim()) {
      const phoneRegex = /^(\+254|0)[17]\d{8}$/;
      const cleanPhone = formData.phone_number.replace(/[\s-]/g, '');
      if (!phoneRegex.test(cleanPhone)) {
        newErrors.phone_number = 'Invalid phone number (use +254... or 07...)';
      }
    }

    // National ID validation (Kenya format: 8 digits)
    if (formData.national_id && formData.national_id.trim()) {
      const idRegex = /^\d{7,8}$/;
      if (!idRegex.test(formData.national_id.trim())) {
        newErrors.national_id = 'National ID must be 7-8 digits';
      }
    }

    // Emergency contact name validation
    if (formData.emergency_contact_name && formData.emergency_contact_name.trim()) {
      if (formData.emergency_contact_name.trim().length < 2) {
        newErrors.emergency_contact_name = 'Name must be at least 2 characters';
      } else if (forbiddenChars.test(formData.emergency_contact_name)) {
        newErrors.emergency_contact_name = 'Name cannot contain numbers or special characters';
      }
    }

    // Emergency contact phone validation
    if (formData.emergency_contact_phone && formData.emergency_contact_phone.trim()) {
      const phoneRegex = /^(\+254|0)[17]\d{8}$/;
      const cleanPhone = formData.emergency_contact_phone.replace(/[\s-]/g, '');
      if (!phoneRegex.test(cleanPhone)) {
        newErrors.emergency_contact_phone = 'Invalid phone number';
      }
    }

    // Location validation
    if (!formData.county) {
      newErrors.county = 'County is required';
    }
    if (!formData.sub_county) {
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
      county: formData.county!,
      sub_county: formData.sub_county!,
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

        <DatePicker
          label="Date of Birth *"
          value={formData.date_of_birth}
          onChange={(v) => updateField('date_of_birth', v)}
          error={errors.date_of_birth}
          placeholder="YYYY-MM-DD"
          maxDate={new Date().toISOString().split('T')[0]}
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
          placeholder="+254... or 07..."
          keyboardType="phone-pad"
          error={errors.phone_number}
          testID="input-phone"
        />

        <Input
          label="National ID"
          value={formData.national_id}
          onChangeText={(v) => updateField('national_id', v)}
          placeholder="Enter National ID (7-8 digits)"
          keyboardType="number-pad"
          error={errors.national_id}
          testID="input-national-id"
        />

        <Text style={styles.sectionTitle}>Location *</Text>

        <LocationPicker
          countyId={formData.county}
          subCountyId={formData.sub_county}
          onCountyChange={(id) => updateField('county', id)}
          onSubCountyChange={(id) => updateField('sub_county', id)}
          countyError={errors.county}
          subCountyError={errors.sub_county}
          testID="location-picker"
        />

        <Text style={styles.sectionTitle}>Emergency Contact</Text>

        <Input
          label="Contact Name"
          value={formData.emergency_contact_name}
          onChangeText={(v) => updateField('emergency_contact_name', v)}
          placeholder="Enter contact name"
          error={errors.emergency_contact_name}
          testID="input-emergency-name"
        />

        <Input
          label="Contact Phone"
          value={formData.emergency_contact_phone}
          onChangeText={(v) => updateField('emergency_contact_phone', v)}
          placeholder="+254... or 07..."
          keyboardType="phone-pad"
          error={errors.emergency_contact_phone}
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
