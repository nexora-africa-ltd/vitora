/**
 * TDD Tests for MedicalHistoryView Component
 * Tests display of patient's medical history within an encounter
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MedicalHistoryView } from '@/components/encounters/medical-history-view';
import type { Encounter } from '@/lib/types/encounter';

const createMockEncounter = (overrides: Partial<Encounter> = {}): Encounter => ({
  id: 1,
  patient: 1,
  encounter_type: 'OPD',
  encounter_date: '2025-01-01',
  chief_complaint: 'Routine checkup',
  status: 'COMPLETED',
  temperature: null,
  pulse: null,
  blood_pressure: null,
  respiratory_rate: null,
  spo2: null,
  weight: null,
  height: null,
  allergies: 'Penicillin',
  chronic_conditions: 'Hypertension, Diabetes Type 2',
  current_medications: 'Metformin 500mg twice daily',
  past_surgeries: 'Appendectomy 2015',
  family_history: 'Father had heart disease',
  social_history: 'Non-smoker, occasional alcohol',
  notes: '',
  history_of_present_illness: '',
  physical_examination: '',
  assessment: '',
  plan: '',
  created_by: 1,
  created_at: '2025-01-01T10:00:00Z',
  updated_at: '2025-01-01T10:00:00Z',
  ...overrides,
});

describe('MedicalHistoryView', () => {
  it('should render allergies', () => {
    const encounter = createMockEncounter({ allergies: 'Penicillin' });
    render(<MedicalHistoryView encounter={encounter} />);

    expect(screen.getByText('Allergies')).toBeInTheDocument();
    expect(screen.getByText('Penicillin')).toBeInTheDocument();
  });

  it('should render chronic conditions', () => {
    const encounter = createMockEncounter({ chronic_conditions: 'Diabetes, Hypertension' });
    render(<MedicalHistoryView encounter={encounter} />);

    expect(screen.getByText('Chronic Conditions')).toBeInTheDocument();
    expect(screen.getByText('Diabetes, Hypertension')).toBeInTheDocument();
  });

  it('should render current medications', () => {
    const encounter = createMockEncounter({ current_medications: 'Aspirin 100mg daily' });
    render(<MedicalHistoryView encounter={encounter} />);

    expect(screen.getByText('Current Medications')).toBeInTheDocument();
    expect(screen.getByText('Aspirin 100mg daily')).toBeInTheDocument();
  });

  it('should render past surgeries', () => {
    const encounter = createMockEncounter({ past_surgeries: 'Knee replacement 2020' });
    render(<MedicalHistoryView encounter={encounter} />);

    expect(screen.getByText('Past Surgeries')).toBeInTheDocument();
    expect(screen.getByText('Knee replacement 2020')).toBeInTheDocument();
  });

  it('should render family history', () => {
    const encounter = createMockEncounter({ family_history: 'Mother had cancer' });
    render(<MedicalHistoryView encounter={encounter} />);

    expect(screen.getByText('Family History')).toBeInTheDocument();
    expect(screen.getByText('Mother had cancer')).toBeInTheDocument();
  });

  it('should render social history', () => {
    const encounter = createMockEncounter({ social_history: 'Former smoker' });
    render(<MedicalHistoryView encounter={encounter} />);

    expect(screen.getByText('Social History')).toBeInTheDocument();
    expect(screen.getByText('Former smoker')).toBeInTheDocument();
  });

  it('should show "Not recorded" for empty sections', () => {
    const encounter = createMockEncounter({
      allergies: '',
      chronic_conditions: 'Diabetes',
    });
    render(<MedicalHistoryView encounter={encounter} />);

    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0);
  });

  it('should show empty state when no history recorded', () => {
    const encounter = createMockEncounter({
      allergies: '',
      chronic_conditions: '',
      current_medications: '',
      past_surgeries: '',
      family_history: '',
      social_history: '',
    });
    render(<MedicalHistoryView encounter={encounter} />);

    expect(screen.getByText('No medical history recorded for this encounter.')).toBeInTheDocument();
  });
});
