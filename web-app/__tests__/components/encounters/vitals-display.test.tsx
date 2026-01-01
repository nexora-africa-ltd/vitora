/**
 * TDD Tests for VitalsDisplay Component
 * Tests display of vital signs with normal/abnormal/critical indicators
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { VitalsDisplay } from '@/components/encounters/vitals-display';
import type { Encounter } from '@/lib/types/encounter';

const createMockEncounter = (overrides: Partial<Encounter> = {}): Encounter => ({
  id: 1,
  patient: 1,
  encounter_type: 'OPD',
  encounter_date: '2025-01-01',
  chief_complaint: 'Routine checkup',
  status: 'COMPLETED',
  temperature: 36.8,
  pulse: 72,
  blood_pressure: '120/80',
  respiratory_rate: 16,
  spo2: 98,
  weight: 70,
  height: 175,
  allergies: '',
  chronic_conditions: '',
  current_medications: '',
  past_surgeries: '',
  family_history: '',
  social_history: '',
  history_of_present_illness: '',
  physical_examination: '',
  assessment: '',
  plan: '',
  created_by: 1,
  created_at: '2025-01-01T10:00:00Z',
  updated_at: '2025-01-01T10:00:00Z',
  ...overrides,
});

describe('VitalsDisplay', () => {
  it('should render temperature value', () => {
    const encounter = createMockEncounter({ temperature: 37.0 });
    render(<VitalsDisplay encounter={encounter} />);

    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('37')).toBeInTheDocument();
  });

  it('should render pulse value', () => {
    const encounter = createMockEncounter({ pulse: 72 });
    render(<VitalsDisplay encounter={encounter} />);

    expect(screen.getByText('Pulse')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
  });

  it('should render blood pressure', () => {
    const encounter = createMockEncounter({ blood_pressure: '120/80' });
    render(<VitalsDisplay encounter={encounter} />);

    expect(screen.getByText('Blood Pressure')).toBeInTheDocument();
    expect(screen.getByText('120/80')).toBeInTheDocument();
  });

  it('should render SpO2 value', () => {
    const encounter = createMockEncounter({ spo2: 98 });
    render(<VitalsDisplay encounter={encounter} />);

    expect(screen.getByText('SpO2')).toBeInTheDocument();
    expect(screen.getByText('98')).toBeInTheDocument();
  });

  it('should show abnormal indicator for low SpO2', () => {
    const encounter = createMockEncounter({ spo2: 93 });
    render(<VitalsDisplay encounter={encounter} />);

    // SpO2 < 95 should have amber styling (abnormal)
    // The component uses border-amber-500 class for abnormal values
    expect(document.querySelector('[class*="amber"]')).toBeInTheDocument();
  });

  it('should show critical indicator for very low SpO2', () => {
    const encounter = createMockEncounter({ spo2: 88 });
    render(<VitalsDisplay encounter={encounter} />);

    // SpO2 < 90 should be marked as critical with "Critical Values" badge
    expect(screen.getByText('Critical Values')).toBeInTheDocument();
  });

  it('should show abnormal indicator for high temperature', () => {
    const encounter = createMockEncounter({ temperature: 38.5 });
    render(<VitalsDisplay encounter={encounter} />);

    // Temperature outside normal range should have amber styling
    expect(document.querySelector('[class*="amber"]')).toBeInTheDocument();
  });

  it('should show critical indicator for very high temperature', () => {
    const encounter = createMockEncounter({ temperature: 40 });
    render(<VitalsDisplay encounter={encounter} />);

    // Very high temperature should show "Critical Values" badge
    expect(screen.getByText('Critical Values')).toBeInTheDocument();
  });

  it('should render weight and height', () => {
    const encounter = createMockEncounter({ weight: 70, height: 175 });
    render(<VitalsDisplay encounter={encounter} />);

    expect(screen.getByText('Weight')).toBeInTheDocument();
    expect(screen.getByText('70')).toBeInTheDocument();
    expect(screen.getByText('Height')).toBeInTheDocument();
    expect(screen.getByText('175')).toBeInTheDocument();
  });

  it('should handle null vital values gracefully', () => {
    const encounter = createMockEncounter({
      temperature: null,
      pulse: null,
      spo2: null,
    });
    render(<VitalsDisplay encounter={encounter} />);

    // Component should render without crashing
    expect(screen.getByText('Temperature')).toBeInTheDocument();
  });
});
