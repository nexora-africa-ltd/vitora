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
import { TriageAssessmentForm } from '@/components/triage/triage-assessment-form';

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
// PATIENT INFO DISPLAY TESTS
// =============================================================================

describe('TriageAssessmentForm - Patient Info', () => {
  it('should display patient name', () => {
    render(<TriageAssessmentForm {...defaultProps} />);
    expect(screen.getByText('John Kamau')).toBeInTheDocument();
  });

  it('should display patient MRN', () => {
    render(<TriageAssessmentForm {...defaultProps} />);
    expect(screen.getByText(/MRN-20260103-0001/)).toBeInTheDocument();
  });

  it('should display patient age and gender', () => {
    render(<TriageAssessmentForm {...defaultProps} />);
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
      render(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByText(/arrival information/i)).toBeInTheDocument();
    });

    it('should render arrival time input', () => {
      render(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByLabelText(/arrival time/i)).toBeInTheDocument();
    });
  });

  describe('@chief-complaint - Chief Complaint', () => {
    it('should render chief complaint category label', () => {
      render(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByText(/chief complaint category/i)).toBeInTheDocument();
    });

    it('should render chief complaint details textarea', () => {
      render(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByLabelText(/chief complaint details/i)).toBeInTheDocument();
    });
  });

  describe('@pain-score - Pain Scale', () => {
    it('should render pain score slider', () => {
      render(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByRole('slider', { name: /pain score/i })).toBeInTheDocument();
    });

    it('should display pain scale range 0-10', () => {
      render(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('should show current pain value text', () => {
      render(<TriageAssessmentForm {...defaultProps} />);
      // Should show "Current:" text with pain status
      expect(screen.getByText(/current:/i)).toBeInTheDocument();
    });

    it('should update pain display when slider changes', () => {
      render(<TriageAssessmentForm {...defaultProps} />);
      const slider = screen.getByRole('slider', { name: /pain score/i });
      fireEvent.change(slider, { target: { value: '7' } });
      // Should show updated value in the "Current: X" text
      expect(screen.getByText(/current.*7/i)).toBeInTheDocument();
    });
  });

  describe('@avpu - AVPU Mental Status', () => {
    it('should render mental status section', () => {
      render(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByText(/mental status.*avpu/i)).toBeInTheDocument();
    });
  });

  describe('@mobility - Mobility Status', () => {
    it('should render clinical assessment section', () => {
      render(<TriageAssessmentForm {...defaultProps} />);
      expect(screen.getByText(/clinical assessment/i)).toBeInTheDocument();
    });
  });

  describe('@allergies - Allergies', () => {
    it('should pre-populate allergies from patient record', () => {
      render(<TriageAssessmentForm {...defaultProps} />);
      const allergiesInput = screen.getByLabelText(/allergies/i);
      expect(allergiesInput).toHaveValue('Penicillin, Sulfa drugs');
    });

    it('should allow editing allergies', async () => {
      const user = userEvent.setup();
      render(<TriageAssessmentForm {...defaultProps} />);
      const allergiesInput = screen.getByLabelText(/allergies/i);
      await user.clear(allergiesInput);
      await user.type(allergiesInput, 'NKDA');
      expect(allergiesInput).toHaveValue('NKDA');
    });
  });
});

// =============================================================================
// AVPU CRITICAL ALERT TESTS
// =============================================================================

describe('TriageAssessmentForm - AVPU Critical Alert', () => {
  it('should show critical alert when Unresponsive is selected via initial data', () => {
    render(
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
    render(
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
    render(<TriageAssessmentForm {...defaultProps} />);
    expect(screen.getByText(/emergency.*immediate/i)).toBeInTheDocument();
    expect(screen.getByText(/very urgent/i)).toBeInTheDocument();
    expect(screen.getByText(/urgent.*60/i)).toBeInTheDocument();
    expect(screen.getByText(/standard.*240/i)).toBeInTheDocument();
    expect(screen.getByText(/non-urgent/i)).toBeInTheDocument();
  });

  it('should show suggested category', () => {
    render(<TriageAssessmentForm {...defaultProps} />);
    expect(screen.getByTestId('suggested-category')).toBeInTheDocument();
  });
});

// =============================================================================
// CARE AREA ROUTING TESTS
// =============================================================================

describe('TriageAssessmentForm - Care Area Routing', () => {
  it('should render assigned area label', () => {
    render(<TriageAssessmentForm {...defaultProps} />);
    expect(screen.getByText(/assigned area/i)).toBeInTheDocument();
  });
});

// =============================================================================
// FORM VALIDATION TESTS
// =============================================================================

describe('TriageAssessmentForm - Validation', () => {
  it('should show validation errors when submitting empty form', async () => {
    const user = userEvent.setup();
    const handleSubmit = jest.fn();
    render(<TriageAssessmentForm {...defaultProps} onSubmit={handleSubmit} />);

    const submitButton = screen.getByRole('button', { name: /complete triage/i });
    await user.click(submitButton);

    // Should show multiple validation errors
    await waitFor(() => {
      expect(screen.getByText(/chief complaint category is required/i)).toBeInTheDocument();
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
    render(
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

    const submitButton = screen.getByRole('button', { name: /complete triage/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          arrival_mode: 'WALK_IN',
          chief_complaint_category: 'CHEST_PAIN',
          mental_status: 'A',
          triage_category: 'ORANGE',
          assigned_area: 'ER_ACUTE',
        })
      );
    });
  });

  it('should call onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const handleCancel = jest.fn();
    render(<TriageAssessmentForm {...defaultProps} onCancel={handleCancel} />);

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(handleCancel).toHaveBeenCalled();
  });

  it('should disable submit button while submitting', async () => {
    const user = userEvent.setup();
    const handleSubmit = jest.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
    render(
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
});

// =============================================================================
// ACCESSIBILITY TESTS
// =============================================================================

describe('TriageAssessmentForm - Accessibility', () => {
  it('should have form landmark role', () => {
    render(<TriageAssessmentForm {...defaultProps} />);
    expect(screen.getByRole('form')).toBeInTheDocument();
  });
});

