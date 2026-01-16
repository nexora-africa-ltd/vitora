/**
 * TDD Tests for PatientForm Component
 * Tests patient registration/edit form functionality
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientForm } from '@/components/patients/patient-form';

// Mock the hooks
jest.mock('@/lib/hooks/use-locations', () => ({
  useCounties: jest.fn(() => ({
    data: [
      { id: 1, name: 'Nairobi' },
      { id: 2, name: 'Mombasa' },
    ],
    isLoading: false,
  })),
  useSubCounties: jest.fn((countyId) => ({
    data: countyId ? [
      { id: 101, name: 'Westlands' },
      { id: 102, name: 'Langata' },
    ] : [],
    isLoading: false,
  })),
  useWards: jest.fn((subCountyId) => ({
    data: subCountyId ? [
      { id: 1001, name: 'Parklands' },
    ] : [],
    isLoading: false,
  })),
}));

// Mock constants
jest.mock('@/lib/utils/constants', () => ({
  GENDER_OPTIONS: [
    { value: 'M', label: 'Male' },
    { value: 'F', label: 'Female' },
    { value: 'O', label: 'Other' },
  ],
  REFERRAL_SOURCE_OPTIONS: [
    { value: 'self', label: 'Self' },
    { value: 'clinic', label: 'Clinic' },
    { value: 'other_facility', label: 'Other Facility' },
  ],
  RELATIONSHIP_OPTIONS: [
    { value: 'spouse', label: 'Spouse' },
    { value: 'parent', label: 'Parent' },
    { value: 'child', label: 'Child' },
    { value: 'sibling', label: 'Sibling' },
    { value: 'grandparent', label: 'Grandparent' },
    { value: 'uncle_aunt', label: 'Uncle/Aunt' },
    { value: 'friend', label: 'Friend' },
    { value: 'neighbor', label: 'Neighbor' },
    { value: 'employer', label: 'Employer' },
    { value: 'other', label: 'Other' },
  ],
}));

// Mock date-fns format
jest.mock('date-fns', () => ({
  format: jest.fn((date, formatStr) => {
    if (formatStr === 'yyyy-MM-dd') {
      return date instanceof Date ? date.toISOString().split('T')[0] : date;
    }
    if (formatStr === 'PPP') {
      return 'January 1, 2000';
    }
    return date;
  }),
}));

describe('PatientForm Component', () => {
  const mockOnSubmit = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render form with personal information section', () => {
    render(
      <PatientForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    // Section is now called "Personal Information" not "Basic Information"
    expect(screen.getByText('Personal Information')).toBeInTheDocument();
  });

  it('should render first name field', () => {
    render(
      <PatientForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    expect(screen.getByPlaceholderText(/Enter first name/i)).toBeInTheDocument();
  });

  it('should render last name field', () => {
    render(
      <PatientForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    expect(screen.getByPlaceholderText(/Enter last name/i)).toBeInTheDocument();
  });

  it('should render contact information section', () => {
    render(
      <PatientForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    expect(screen.getByText('Contact Information')).toBeInTheDocument();
  });

  it('should render location section', () => {
    render(
      <PatientForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    expect(screen.getByText('Location')).toBeInTheDocument();
  });

  it('should call onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <PatientForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    await user.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('should show loading state when isLoading is true', () => {
    render(
      <PatientForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        isLoading={true}
      />
    );

    // Submit button should be disabled
    const submitButton = screen.getByRole('button', { name: /Register Patient/i });
    expect(submitButton).toBeDisabled();
  });

  it('should render date of birth picker', () => {
    render(
      <PatientForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    expect(screen.getByText(/Date of Birth/i)).toBeInTheDocument();
  });

  it('should render emergency contact section', () => {
    render(
      <PatientForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    expect(screen.getByText(/Emergency Contact/i)).toBeInTheDocument();
  });

  it('should accept default values for first name', () => {
    const defaultValues = {
      first_name: 'John',
    };

    render(
      <PatientForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        defaultValues={defaultValues}
      />
    );

    expect(screen.getByDisplayValue('John')).toBeInTheDocument();
  });

  it('should accept default values for last name', () => {
    const defaultValues = {
      last_name: 'Doe',
    };

    render(
      <PatientForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        defaultValues={defaultValues}
      />
    );

    expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
  });

  it('should fill in first name field', async () => {
    const user = userEvent.setup();

    render(
      <PatientForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    const firstNameInput = screen.getByPlaceholderText(/Enter first name/i);
    await user.type(firstNameInput, 'Jane');

    expect(firstNameInput).toHaveValue('Jane');
  });

  it('should fill in last name field', async () => {
    const user = userEvent.setup();

    render(
      <PatientForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    const lastNameInput = screen.getByPlaceholderText(/Enter last name/i);
    await user.type(lastNameInput, 'Smith');

    expect(lastNameInput).toHaveValue('Smith');
  });

  it('should have phone description text', () => {
    render(
      <PatientForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    // Text is now "Kenya format" not "Kenya phone format"
    expect(screen.getByText(/Kenya format/i)).toBeInTheDocument();
  });

  it('should render gender selection', () => {
    render(
      <PatientForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    // Gender is now a RadioGroup - check the label and that radio buttons exist
    expect(screen.getByText('Gender *')).toBeInTheDocument();
    // The radiogroup should have radio options
    const radioButtons = screen.getAllByRole('radio');
    expect(radioButtons.length).toBeGreaterThan(0);
  });

  it('should render county selection', () => {
    render(
      <PatientForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
    );

    // Use getAllByText since sub-county shows "Select county first"
    const countyElements = screen.getAllByText(/Select county/i);
    expect(countyElements.length).toBeGreaterThan(0);
  });
});
