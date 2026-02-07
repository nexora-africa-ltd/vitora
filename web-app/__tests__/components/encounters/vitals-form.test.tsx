/**
 * @jest-environment jsdom
 */
import { render, screen } from '@/__tests__/utils/test-utils';
import userEvent from '@testing-library/user-event';
import { VitalsForm } from '@/components/encounters/vitals-form';
import type { EncounterFormData } from '@/lib/types/encounter-form';

const mockFormData: EncounterFormData = {
  patient: 1,
  encounter_type: 'OPD',
  encounter_date: '2026-01-02',
  chief_complaint: 'Test complaint',
  temperature: null,
  pulse: null,
  blood_pressure_systolic: null,
  blood_pressure_diastolic: null,
  respiratory_rate: null,
  spo2: null,
  weight: null,
  height: null,
  allergies: '',
  chronic_conditions: '',
  current_medications: '',
  past_surgeries: '',
  family_history: '',
  social_history: '',
  notes: '',
  history_of_present_illness: '',
  physical_examination: '',
  assessment: '',
  plan: '',
  status: 'CREATED',
};

describe('VitalsForm', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all vital sign input fields', () => {
    render(<VitalsForm data={mockFormData} onChange={mockOnChange} />);

    expect(screen.getByLabelText(/temperature/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/pulse/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/respiratory rate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/SpO/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/weight/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/height/i)).toBeInTheDocument();
  });

  it('displays vital signs card title', () => {
    render(<VitalsForm data={mockFormData} onChange={mockOnChange} />);

    expect(screen.getByText('Vital Signs')).toBeInTheDocument();
  });

  it('shows critical alert when SpO2 is below 90%', () => {
    const criticalData = { ...mockFormData, spo2: 85 };
    render(<VitalsForm data={criticalData} onChange={mockOnChange} />);

    // Alerts banner
    expect(screen.getByText(/critical\s*\(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/SpO₂\s*85%/i)).toBeInTheDocument();
  });

  it('shows warning alert when SpO2 is between 90% and 95%', () => {
    const warningData = { ...mockFormData, spo2: 92 };
    render(<VitalsForm data={warningData} onChange={mockOnChange} />);

    expect(screen.getByText(/warning\s*\(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/SpO₂\s*92%/i)).toBeInTheDocument();
    expect(screen.getByText(/below normal/i)).toBeInTheDocument();
  });

  it('shows critical badge when there are critical alerts', () => {
    const criticalData = { ...mockFormData, spo2: 85 };
    render(<VitalsForm data={criticalData} onChange={mockOnChange} />);

    // Header badge
    expect(screen.getByText(/1\s+Critical/i)).toBeInTheDocument();
  });

  it('calculates and displays BMI when weight and height are provided', () => {
    const dataWithMeasurements = { ...mockFormData, weight: 70, height: 170 };
    render(<VitalsForm data={dataWithMeasurements} onChange={mockOnChange} />);

    // BMI = 70 / (1.7 * 1.7) = 24.2
    expect(screen.getByText('BMI')).toBeInTheDocument();
    expect(screen.getByText('24.2')).toBeInTheDocument();
    expect(screen.getByText(/^Normal$/)).toBeInTheDocument();
  });

  it('does not show BMI when measurements are missing', () => {
    render(<VitalsForm data={mockFormData} onChange={mockOnChange} />);

    expect(screen.queryByText(/^BMI$/)).not.toBeInTheDocument();
  });

  it('calls onChange when temperature is entered', async () => {
    const user = userEvent.setup();
    render(<VitalsForm data={mockFormData} onChange={mockOnChange} />);

    const tempInput = screen.getByLabelText(/temperature/i);
    await user.clear(tempInput);
    await user.type(tempInput, '37.5');

    expect(mockOnChange).toHaveBeenCalled();
  });

  it('displays normal ranges for each vital sign', () => {
    render(<VitalsForm data={mockFormData} onChange={mockOnChange} />);

    expect(screen.getByText(/36\.5-37\.5°C/)).toBeInTheDocument();
    expect(screen.getByText(/60-100 bpm/)).toBeInTheDocument();
    expect(screen.getByText(/12-20\/min/)).toBeInTheDocument();
  });

  it('shows blood pressure input fields', () => {
    render(<VitalsForm data={mockFormData} onChange={mockOnChange} />);

    expect(screen.getByText('Blood Pressure')).toBeInTheDocument();
    expect(screen.getByText('mmHg')).toBeInTheDocument();
  });

  it('shows critical alert for hypertensive crisis', () => {
    const criticalBP = {
      ...mockFormData,
      blood_pressure_systolic: 190,
      blood_pressure_diastolic: 125,
    };
    render(<VitalsForm data={criticalBP} onChange={mockOnChange} />);

    // BP alerts are calculated using MAP in the current implementation
    expect(screen.getByText(/MAP\s*147\s*mmHg\s*-\s*Hypertensive emergency/i)).toBeInTheDocument();
  });

  it('shows critical alert for hypotension', () => {
    const lowBP = {
      ...mockFormData,
      blood_pressure_systolic: 85,
      blood_pressure_diastolic: 55,
    };
    render(<VitalsForm data={lowBP} onChange={mockOnChange} />);

    // For 85/55, MAP is 65 (warning low)
    expect(screen.getByText(/MAP\s*65\s*mmHg\s*-\s*Low/i)).toBeInTheDocument();
  });

  it('disables inputs when disabled prop is true', () => {
    render(<VitalsForm data={mockFormData} onChange={mockOnChange} disabled />);

    const tempInput = screen.getByLabelText(/temperature/i);
    expect(tempInput).toBeDisabled();
  });
});
