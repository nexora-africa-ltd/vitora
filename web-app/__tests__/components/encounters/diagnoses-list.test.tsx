/**
 * TDD Tests for DiagnosesList Component
 * Tests display of diagnoses with ICD-10 codes and types
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { DiagnosesList } from '@/components/encounters/diagnoses-list';
import type { Diagnosis } from '@/lib/types/encounter';

// Mock EmptyState
jest.mock('@/components/shared/empty-state', () => ({
  EmptyState: ({ title, description }: any) => (
    <div data-testid="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  ),
}));

const mockDiagnosis: Diagnosis = {
  id: 1,
  encounter: 1,
  icd10_code: 'J06.9',
  icd10_code_display: 'J06.9',
  icd10_description: 'Acute upper respiratory infection, unspecified',
  free_text_diagnosis: null,
  diagnosis_type: 'PRIMARY',
  notes: 'Patient presents with cold symptoms',
  created_at: '2025-01-01T10:00:00Z',
};

describe('DiagnosesList', () => {
  it('should render diagnosis description', () => {
    render(<DiagnosesList diagnoses={[mockDiagnosis]} />);

    expect(screen.getByText('Acute upper respiratory infection, unspecified')).toBeInTheDocument();
  });

  it('should render ICD-10 code', () => {
    render(<DiagnosesList diagnoses={[mockDiagnosis]} />);

    expect(screen.getByText('J06.9')).toBeInTheDocument();
  });

  it('should render diagnosis type badge', () => {
    render(<DiagnosesList diagnoses={[mockDiagnosis]} />);

    expect(screen.getByText('PRIMARY')).toBeInTheDocument();
  });

  it('should render diagnosis notes', () => {
    render(<DiagnosesList diagnoses={[mockDiagnosis]} />);

    expect(screen.getByText('Patient presents with cold symptoms')).toBeInTheDocument();
  });

  it('should render empty state when no diagnoses', () => {
    render(<DiagnosesList diagnoses={[]} />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No diagnoses')).toBeInTheDocument();
  });

  it('should render multiple diagnoses', () => {
    const secondDiagnosis = {
      ...mockDiagnosis,
      id: 2,
      icd10_code: 'R51',
      icd10_code_display: 'R51',
      icd10_description: 'Headache',
      diagnosis_type: 'SECONDARY' as const,
    };
    render(<DiagnosesList diagnoses={[mockDiagnosis, secondDiagnosis]} />);

    expect(screen.getByText('Acute upper respiratory infection, unspecified')).toBeInTheDocument();
    expect(screen.getByText('Headache')).toBeInTheDocument();
  });

  it('should display different diagnosis types with correct badges', () => {
    const diagnoses = [
      { ...mockDiagnosis, id: 1, diagnosis_type: 'PRIMARY' as const },
      { ...mockDiagnosis, id: 2, diagnosis_type: 'SECONDARY' as const },
      { ...mockDiagnosis, id: 3, diagnosis_type: 'DIFFERENTIAL' as const },
    ];
    render(<DiagnosesList diagnoses={diagnoses} />);

    expect(screen.getByText('PRIMARY')).toBeInTheDocument();
    expect(screen.getByText('SECONDARY')).toBeInTheDocument();
    expect(screen.getByText('DIFFERENTIAL')).toBeInTheDocument();
  });
});
