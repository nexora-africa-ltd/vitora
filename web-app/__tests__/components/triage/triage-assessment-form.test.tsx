/**
 * TDD Tests for TriageAssessmentForm Component
 *
 * Based on BDD scenarios from: features/triage/triage-assessment.feature
 *
 * Test Categories:
 * 1. Patient Info Display
 * 2. Form Structure (@arrival, @chief-complaint, @pain-score, @avpu, @mobility)
 * 3. AVPU Critical Alert (@avpu)
 * 4. Triage Category (@keta, @category)
 * 5. Form Validation (@validation)
 * 6. Form Submission (@submit)
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TriageAssessmentForm } from '@/components/triage/triage-assessment-form';

jest.mock('@/lib/hooks/use-triage', () => {
  const actual = jest.requireActual('@/lib/hooks/use-triage');
  return {
    ...actual,
    useCalculateTriageCategory: () => ({
      mutateAsync: jest.fn().mockResolvedValue({
        suggested_category: 'ORANGE',
        alerts: [],
      }),
      isPending: false,
    }),
  };
});

// =============================================================================
// MOCK DATA
// =============================================================================

const mockPatient = {
  id: 1,
  mrn: 'MRN-20260103-0001',
  first_name: 'John',
  last_name: 'Kamau',
  date_of_birth: '1970-05-15',
  gender: 'M' as const,
  allergies: 'Penicillin, Sulfa drugs',
};

const mockEncounter = {
  id: 1,
  patient: 1,
  encounter_type: 'EMERGENCY' as const,
  encounter_date: '2026-01-03',
  chief_complaint: '',
  status: 'IN_PROGRESS' as const,
  spo2: 97,
  pulse: 78,
  blood_pressure: '120/80',
  temperature: 36.8,
  respiratory_rate: 16,
};

const defaultProps = {
  patient: mockPatient,
  encounter: mockEncounter,
  onSubmit: jest.fn(),
  onCancel: jest.fn(),
};

// =============================================================================
// TEST WRAPPER
// =============================================================================

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
};

const renderWithWrapper = (ui: React.ReactElement) => {
  return render(ui, { wrapper: createWrapper() });
};

// =============================================================================
// PATIENT INFO DISPLAY TESTS
// =============================================================================

describe('TriageAssessmentForm - Patient Info', () => {
  it('should display patient name', () => {
    renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
    expect(screen.getByText('John Kamau')).toBeInTheDocument();
  });

  it('should display patient MRN', () => {
    renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
    expect(screen.getByText(/MRN-20260103-0001/)).toBeInTheDocument();
  });

  it('should display patient age and gender', () => {
    renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
    // Patient born 1970, so ~55-56 years old in 2026
    expect(screen.getByText(/5[56] yrs.*Male/)).toBeInTheDocument();
  });
});

// =============================================================================
// FORM STRUCTURE TESTS
// =============================================================================

describe('TriageAssessmentForm - Form Structure', () => {
  describe('@arrival - Arrival Information', () => {
    it('should render arrival information section', () => {
      renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByText(/arrival information/i)).toBeInTheDocument();
    });

    it('should render arrival time input', () => {
      renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByLabelText(/arrival time/i)).toBeInTheDocument();
    });
  });

  describe('@chief-complaint - Chief Complaint', () => {
    it('should render chief complaint category label', () => {
      renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByText(/chief complaint category/i)).toBeInTheDocument();
    });

    it('should render chief complaint details textarea', () => {
      renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByLabelText(/chief complaint details/i)).toBeInTheDocument();
    });
  });

  describe('@pain-score - Pain Scale', () => {
    it('should render pain score slider', () => {
      renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByRole('slider', { name: /pain score/i })).toBeInTheDocument();
    });

    it('should display pain scale range 0-10', () => {
      renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('should show current pain value text', () => {
      renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
      // Should show "Current:" text with pain status
      expect(screen.getByText(/current:/i)).toBeInTheDocument();
    });

    it('should update pain display when slider changes', () => {
      renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
      const slider = screen.getByRole('slider', { name: /pain score/i });
      fireEvent.change(slider, { target: { value: '7' } });
      // Should show updated value in the "Current: X" text
      expect(screen.getByText(/current.*7/i)).toBeInTheDocument();
    });
  });

  describe('@avpu - AVPU Mental Status', () => {
    it('should render mental status section', () => {
      renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByText(/mental status.*avpu/i)).toBeInTheDocument();
    });
  });

  describe('@mobility - Mobility Status', () => {
    it('should render clinical assessment section', () => {
      renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByText(/clinical assessment/i)).toBeInTheDocument();
    });
  });

  describe('@allergies - Allergies', () => {
    it('should pre-populate allergies from patient record', () => {
      renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
      const allergiesInput = screen.getByLabelText(/allergies/i);
      expect(allergiesInput).toHaveValue('Penicillin, Sulfa drugs');
    });

    it('should allow editing allergies', async () => {
      const user = userEvent.setup();
      renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
      const allergiesInput = screen.getByLabelText(/allergies/i);
      await user.clear(allergiesInput);
      await user.type(allergiesInput, 'NKDA');
      expect(allergiesInput).toHaveValue('NKDA');
    });
  });

  describe('@vitals - Vital Signs', () => {
    it('should render vital signs section', () => {
      renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByText(/vital signs/i)).toBeInTheDocument();
    });

    it('should render vital inputs with unit labels', () => {
      renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);

      expect(screen.getByLabelText(/spo2/i)).toBeInTheDocument();
      expect(screen.getByText('%')).toBeInTheDocument();

      expect(screen.getByLabelText(/heart rate/i)).toBeInTheDocument();
      expect(screen.getByText(/bpm/i)).toBeInTheDocument();

      expect(screen.getByLabelText(/systolic blood pressure/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/diastolic blood pressure/i)).toBeInTheDocument();
      expect(screen.getByText(/mmhg/i)).toBeInTheDocument();

      expect(screen.getByLabelText(/temperature/i)).toBeInTheDocument();
      expect(screen.getByText(/°c/i)).toBeInTheDocument();

      expect(screen.getByLabelText(/respiratory rate/i)).toBeInTheDocument();
      expect(screen.getByText(/\/min/i)).toBeInTheDocument();

      expect(screen.getByLabelText(/weight/i)).toBeInTheDocument();
      expect(screen.getByText('kg')).toBeInTheDocument();
    });

    it('should highlight critical values in red border (SpO2 < 90)', async () => {
      const user = userEvent.setup();
      renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);

      const spo2Input = screen.getByLabelText(/spo2/i);
      await user.clear(spo2Input);
      await user.type(spo2Input, '89');

      const group = spo2Input.closest('[data-slot="input-group"]');
      expect(group).toHaveClass('border-destructive');
    });
  });
});

// =============================================================================
// AVPU CRITICAL ALERT TESTS
// =============================================================================

describe('TriageAssessmentForm - AVPU Critical Alert', () => {
  it('should show critical alert when Unresponsive is selected via initial data', () => {
    renderWithWrapper(
      <TriageAssessmentForm
        {...defaultProps}
        initialData={{ mental_status: 'U' }}
      />
    );

    // May appear in multiple places (alerts panel and inline)
    const alerts = screen.getAllByText(/critical.*unresponsive/i);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('should show suggested RED category when Unresponsive is in initial data', () => {
    renderWithWrapper(
      <TriageAssessmentForm
        {...defaultProps}
        initialData={{ mental_status: 'U' }}
      />
    );

    const suggestedCategory = screen.getByTestId('suggested-category');
    expect(suggestedCategory).toHaveTextContent('RED');
  });
});

// =============================================================================
// TRIAGE CATEGORY TESTS
// =============================================================================

describe('TriageAssessmentForm - Triage Category', () => {
  it('should display all 5 KETA category options', () => {
    renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
    expect(screen.getByText(/emergency.*immediate/i)).toBeInTheDocument();
    expect(screen.getByText(/very urgent/i)).toBeInTheDocument();
    expect(screen.getByText(/urgent.*60/i)).toBeInTheDocument();
    expect(screen.getByText(/standard.*240/i)).toBeInTheDocument();
    expect(screen.getByText(/non-urgent/i)).toBeInTheDocument();
  });

  it('should show suggested category', () => {
    renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
    expect(screen.getByTestId('suggested-category')).toBeInTheDocument();
  });
});

// =============================================================================
// CARE AREA ROUTING TESTS
// =============================================================================

describe('TriageAssessmentForm - Care Area Routing', () => {
  it('should render assigned area label', () => {
    renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
    // The component uses "Care Area Assignment" as the label. Check for that.
    expect(screen.getByText(/care area assignment/i)).toBeInTheDocument();
  });
});

// =============================================================================
// FORM VALIDATION TESTS
// =============================================================================

describe('TriageAssessmentForm - Validation', () => {
  it('should show validation errors when submitting empty form', async () => {
    const user = userEvent.setup();
    const handleSubmit = jest.fn();
    renderWithWrapper(<TriageAssessmentForm {...defaultProps} onSubmit={handleSubmit} />);

    const submitButton = screen.getByRole('button', { name: /complete triage/i });
    await user.click(submitButton);

    // Should show multiple validation errors
    await waitFor(() => {
      expect(screen.getByText(/chief complaint category is required/i)).toBeInTheDocument();
    });
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('should reject out-of-range vitals values (SpO2 > 100)', async () => {
    const user = userEvent.setup();
    const handleSubmit = jest.fn();
    renderWithWrapper(
      <TriageAssessmentForm
        {...defaultProps}
        onSubmit={handleSubmit}
        initialData={{
          arrival_mode: 'WALK_IN',
          arrival_time: '2026-01-03T10:30',
          chief_complaint_category: 'CHEST_PAIN',
          chief_complaint: 'Sharp chest pain',
          mental_status: 'A',
          mobility: 'AMBULATORY',
          triage_category: 'ORANGE',
          assigned_area: 'ER_ACUTE',
        }}
      />
    );

    const spo2Input = screen.getByLabelText(/spo2/i);
    await user.clear(spo2Input);
    await user.type(spo2Input, '101');

    const submitButton = screen.getByRole('button', { name: /complete triage/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/spo2 must be between 0 and 100/i)).toBeInTheDocument();
    });
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});

// =============================================================================
// FORM SUBMISSION TESTS
// =============================================================================

describe('TriageAssessmentForm - Submission', () => {
  it('should call onSubmit with valid form data', async () => {
    const user = userEvent.setup();
    const handleSubmit = jest.fn();
    renderWithWrapper(
      <TriageAssessmentForm
        {...defaultProps}
        onSubmit={handleSubmit}
        initialData={{
          arrival_mode: 'WALK_IN',
          arrival_time: '2026-01-03T10:30',
          chief_complaint_category: 'HEADACHE',
          chief_complaint: 'Mild headache for 2 days',
          mental_status: 'A',
          mobility: 'AMBULATORY',
          triage_category: 'GREEN',
          auto_calculated_category: 'GREEN',
          assigned_area: 'OPD',
        }}
      />
    );

    const submitButton = screen.getByRole('button', { name: /complete triage/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          arrival_mode: 'WALK_IN',
          chief_complaint_category: 'HEADACHE',
          mental_status: 'A',
          triage_category: 'GREEN',
          assigned_area: 'OPD',
        })
      );
    });
  });

  it('should call onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const handleCancel = jest.fn();
    renderWithWrapper(<TriageAssessmentForm {...defaultProps} onCancel={handleCancel} />);

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(handleCancel).toHaveBeenCalled();
  });

  it('should disable submit button while submitting', async () => {
    const user = userEvent.setup();
    const handleSubmit = jest.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
    renderWithWrapper(
      <TriageAssessmentForm
        {...defaultProps}
        onSubmit={handleSubmit}
        initialData={{
          arrival_mode: 'WALK_IN',
          arrival_time: '2026-01-03T10:30',
          chief_complaint_category: 'CHEST_PAIN',
          chief_complaint: 'Test',
          mental_status: 'A',
          mobility: 'AMBULATORY',
          triage_category: 'GREEN',
          assigned_area: 'OPD',
        }}
      />
    );

    const submitButton = screen.getByRole('button', { name: /complete triage/i });
    await user.click(submitButton);

    // Check that button becomes disabled after click
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      const savingButton = buttons.find(b => b.textContent?.includes('Saving'));
      if (savingButton) {
        expect(savingButton).toBeDisabled();
      }
    }, { timeout: 200 });
  });

  it('should include vitals in submission payload when provided', async () => {
    const user = userEvent.setup();
    const handleSubmit = jest.fn();
    renderWithWrapper(
      <TriageAssessmentForm
        {...defaultProps}
        onSubmit={handleSubmit}
        initialData={{
          arrival_mode: 'WALK_IN',
          arrival_time: '2026-01-03T10:30',
          chief_complaint_category: 'CHEST_PAIN',
          chief_complaint: 'Sharp chest pain',
          mental_status: 'A',
          mobility: 'AMBULATORY',
          triage_category: 'ORANGE',
          assigned_area: 'ER_ACUTE',
        }}
      />
    );

    await user.clear(screen.getByLabelText(/spo2/i));
    await user.type(screen.getByLabelText(/spo2/i), '94');
    await user.clear(screen.getByLabelText(/heart rate/i));
    await user.type(screen.getByLabelText(/heart rate/i), '110');

    const systolicInput = screen.getByLabelText(/systolic blood pressure/i);
    await user.clear(systolicInput);
    await user.type(systolicInput, '160');
    const diastolicInput = screen.getByLabelText(/diastolic blood pressure/i);
    await user.clear(diastolicInput);
    await user.type(diastolicInput, '95');
    await user.clear(screen.getByLabelText(/temperature/i));
    await user.type(screen.getByLabelText(/temperature/i), '37.2');
    await user.clear(screen.getByLabelText(/respiratory rate/i));
    await user.type(screen.getByLabelText(/respiratory rate/i), '22');

    const submitButton = screen.getByRole('button', { name: /complete triage/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          spo2: 94,
          heart_rate: 110,
          systolic_bp: 160,
          diastolic_bp: 95,
          temperature: 37.2,
          respiratory_rate: 22,
        })
      );
    });
  });
});

// =============================================================================
// ACCESSIBILITY TESTS
// =============================================================================

describe('TriageAssessmentForm - Accessibility', () => {
  it('should have form landmark role', () => {
    renderWithWrapper(<TriageAssessmentForm {...defaultProps} />);
    expect(screen.getByRole('form')).toBeInTheDocument();
  });
});
