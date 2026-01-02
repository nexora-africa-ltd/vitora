/**
 * TDD Tests for PatientCard Component
 * Tests display of patient information in card format
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { PatientCard } from '@/components/patients/patient-card';
import type { Patient } from '@/lib/types/patient';

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

const mockPatient: Patient = {
  id: 1,
  mrn: 'MRN-20251230-0001',
  first_name: 'John',
  last_name: 'Doe',
  date_of_birth: '1990-05-15',
  gender: 'M',
  phone_number: '0712345678',
  county: 1,
  county_name: 'Nairobi',
  sub_county: 1,
  sub_county_name: 'Westlands',
  village: '',
  emergency_contact_name: 'Jane Doe',
  emergency_contact_phone: '0723456789',
  emergency_contact_relationship: 'Spouse',
  referral_source: 'self',
  consent_given: true,
  consent_date: '2025-01-01',
  is_sensitive: false,
  registered_by: 1,
  created_at: '2025-01-01T10:00:00Z',
  updated_at: '2025-01-01T10:00:00Z',
};

describe('PatientCard', () => {
  it('should render patient name', () => {
    render(<PatientCard patient={mockPatient} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('should render patient MRN', () => {
    render(<PatientCard patient={mockPatient} />);

    expect(screen.getByText('MRN-20251230-0001')).toBeInTheDocument();
  });

  it('should render patient age', () => {
    render(<PatientCard patient={mockPatient} />);

    // Patient born in 1990, so age is approximately 34-35
    expect(screen.getByText(/\d+ yrs, Male/)).toBeInTheDocument();
  });

  it('should render phone number when available', () => {
    render(<PatientCard patient={mockPatient} />);

    expect(screen.getByText('0712345678')).toBeInTheDocument();
  });

  it('should render county information', () => {
    render(<PatientCard patient={mockPatient} />);

    expect(screen.getByText(/Nairobi/)).toBeInTheDocument();
  });

  it('should link to patient detail page', () => {
    render(<PatientCard patient={mockPatient} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/patients/1');
  });

  it('should show sensitive badge when patient is sensitive', () => {
    const sensitivePatient = { ...mockPatient, is_sensitive: true };
    render(<PatientCard patient={sensitivePatient} />);

    expect(screen.getByText('Sensitive')).toBeInTheDocument();
  });

  it('should not show sensitive badge for non-sensitive patients', () => {
    render(<PatientCard patient={mockPatient} />);

    expect(screen.queryByText('Sensitive')).not.toBeInTheDocument();
  });

  it('should render initials in avatar', () => {
    render(<PatientCard patient={mockPatient} />);

    expect(screen.getByText('JD')).toBeInTheDocument();
  });
});
