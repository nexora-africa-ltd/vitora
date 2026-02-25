/**
 * Unit Tests for PhysioSessionForm Component (TDD)
 *
 * Tests for the physiotherapy session recording form.
 * Written BEFORE implementation following TDD methodology.
 *
 * Test Categories:
 * 1. Form Rendering
 * 2. Session Status Flow
 * 3. Progress Notes
 * 4. Pain Scale
 * 5. Outcome Recording
 * 6. Form Submission
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhysioSessionForm } from '@/components/allied-health/physiotherapy/physio-session-form';

// Mock next/navigation
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  }),
}));

// Mock the hooks
jest.mock('@/lib/hooks/use-physiotherapy', () => ({
  usePhysioSession: jest.fn(),
  useStartPhysioSession: jest.fn(),
  useCompletePhysioSession: jest.fn(),
  useCancelPhysioSession: jest.fn(),
}));

import {
  usePhysioSession,
  useStartPhysioSession,
  useCompletePhysioSession,
  useCancelPhysioSession,
} from '@/lib/hooks/use-physiotherapy';

const mockUsePhysioSession = usePhysioSession as jest.Mock;
const mockUseStartPhysioSession = useStartPhysioSession as jest.Mock;
const mockUseCompletePhysioSession = useCompletePhysioSession as jest.Mock;
const mockUseCancelPhysioSession = useCancelPhysioSession as jest.Mock;

// =============================================================================
// MOCK DATA
// =============================================================================

const mockScheduledSession = {
  id: 1,
  session_number: 'PS-20260226-0001',
  order: {
    id: 1,
    order_number: 'PHYSIO-20260226-0001',
  },
  order_id: 1,
  patient: {
    id: 1,
    mrn: 'MRN-001',
    first_name: 'John',
    last_name: 'Doe',
    full_name: 'John Doe',
    date_of_birth: '1970-05-15',
    gender: 'M',
  },
  patient_id: 1,
  therapist: {
    id: 20,
    username: 'jane.therapist',
    first_name: 'Jane',
    last_name: 'Therapist',
    full_name: 'Jane Therapist',
  },
  therapist_id: 20,
  session_date: '2026-02-26',
  start_time: null,
  end_time: null,
  duration_minutes: null,
  status: 'SCHEDULED',
  progress_notes: '',
  treatment_provided: '',
  pain_level_before: null,
  pain_level_after: null,
  outcome: null,
  patient_response: '',
  home_exercises: '',
  next_session_plan: '',
  created_at: '2026-02-25T10:00:00Z',
  updated_at: '2026-02-25T10:00:00Z',
};

const mockInProgressSession = {
  ...mockScheduledSession,
  status: 'IN_PROGRESS',
  start_time: '09:00:00',
  pain_level_before: 6,
};

const mockCompletedSession = {
  ...mockScheduledSession,
  status: 'COMPLETED',
  start_time: '09:00:00',
  end_time: '09:45:00',
  duration_minutes: 45,
  progress_notes: 'Good progress observed',
  treatment_provided: 'ROM exercises, strengthening',
  pain_level_before: 6,
  pain_level_after: 3,
  outcome: 'IMPROVED',
  patient_response: 'Good tolerance',
  home_exercises: 'Quad sets, ankle pumps',
  next_session_plan: 'Progress to weight-bearing exercises',
  invoice_item_id: 1001,
};

const mockMutation = {
  mutate: jest.fn(),
  mutateAsync: jest.fn(),
  isPending: false,
  isError: false,
  error: null,
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

const setupMocks = (session = mockScheduledSession) => {
  mockUsePhysioSession.mockReturnValue({
    data: session,
    isLoading: false,
    error: null,
  });

  mockUseStartPhysioSession.mockReturnValue(mockMutation);
  mockUseCompletePhysioSession.mockReturnValue(mockMutation);
  mockUseCancelPhysioSession.mockReturnValue(mockMutation);
};

// =============================================================================
// FORM RENDERING TESTS
// =============================================================================

describe('PhysioSessionForm - Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('should render session number', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByText(/PS-20260226-0001/)).toBeInTheDocument();
  });

  it('should render patient information', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByText(/john doe/i)).toBeInTheDocument();
    expect(screen.getByText(/MRN-001/)).toBeInTheDocument();
  });

  it('should render session date', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByText(/february 26/i)).toBeInTheDocument();
  });

  it('should render therapist name', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByText(/jane therapist/i)).toBeInTheDocument();
  });

  it('should render session status badge', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByText(/scheduled/i)).toBeInTheDocument();
  });

  it('should render Start Session button for scheduled sessions', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();
  });
});

// =============================================================================
// SESSION STATUS FLOW TESTS
// =============================================================================

describe('PhysioSessionForm - Status Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show Start Session for SCHEDULED status', () => {
    setupMocks(mockScheduledSession);
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /complete session/i })).not.toBeInTheDocument();
  });

  it('should show Complete Session for IN_PROGRESS status', () => {
    setupMocks(mockInProgressSession);
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByRole('button', { name: /complete session/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument();
  });

  it('should disable form fields for COMPLETED status', () => {
    setupMocks(mockCompletedSession);
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByLabelText(/progress notes/i)).toBeDisabled();
    expect(screen.queryByRole('button', { name: /complete session/i })).not.toBeInTheDocument();
  });

  it('should show timer when session is in progress', () => {
    setupMocks(mockInProgressSession);
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    // Should show elapsed time
    expect(screen.getByText(/duration|elapsed/i)).toBeInTheDocument();
  });
});

// =============================================================================
// START SESSION TESTS
// =============================================================================

describe('PhysioSessionForm - Start Session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
    mockMutation.mutateAsync.mockResolvedValue(mockInProgressSession);
  });

  it('should show pain level before field when starting', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    await user.click(screen.getByRole('button', { name: /start session/i }));
    
    await waitFor(() => {
      expect(screen.getByLabelText(/pain level.*before|initial pain/i)).toBeInTheDocument();
    });
  });

  it('should call start mutation when Start Session is clicked', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    await user.click(screen.getByRole('button', { name: /start session/i }));
    
    // Should show confirmation or directly start
    await waitFor(() => {
      expect(mockMutation.mutateAsync).toHaveBeenCalledWith(1);
    });
  });

  it('should record start time when session starts', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    await user.click(screen.getByRole('button', { name: /start session/i }));
    
    await waitFor(() => {
      expect(mockMutation.mutateAsync).toHaveBeenCalled();
    });
    
    // Start time should be current time (handled by backend)
  });
});

// =============================================================================
// PROGRESS NOTES TESTS
// =============================================================================

describe('PhysioSessionForm - Progress Notes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks(mockInProgressSession);
  });

  it('should render progress notes textarea', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByLabelText(/progress notes/i)).toBeInTheDocument();
  });

  it('should render treatment provided field', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByLabelText(/treatment provided/i)).toBeInTheDocument();
  });

  it('should render patient response field', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByLabelText(/patient response/i)).toBeInTheDocument();
  });

  it('should render home exercises field', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByLabelText(/home exercises/i)).toBeInTheDocument();
  });

  it('should render next session plan field', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByLabelText(/next session plan/i)).toBeInTheDocument();
  });

  it('should require progress notes for completion', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    // Try to complete without progress notes
    await user.click(screen.getByRole('button', { name: /complete session/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/progress notes.*required/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// PAIN SCALE TESTS
// =============================================================================

describe('PhysioSessionForm - Pain Scale', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks(mockInProgressSession);
  });

  it('should render pain level before slider', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByRole('slider', { name: /pain.*before/i })).toBeInTheDocument();
  });

  it('should render pain level after slider', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByRole('slider', { name: /pain.*after/i })).toBeInTheDocument();
  });

  it('should display 0-10 scale labels', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('should pre-populate pain level before from session data', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    const slider = screen.getByRole('slider', { name: /pain.*before/i });
    expect(slider).toHaveValue('6');
  });

  it('should update pain display when slider changes', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    const slider = screen.getByRole('slider', { name: /pain.*after/i });
    
    // Simulate changing slider value
    await user.clear(slider);
    await user.type(slider, '3');
    
    // Should show updated value
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });
});

// =============================================================================
// OUTCOME RECORDING TESTS
// =============================================================================

describe('PhysioSessionForm - Outcome Recording', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks(mockInProgressSession);
  });

  it('should render outcome selection', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByLabelText(/outcome/i)).toBeInTheDocument();
  });

  it('should display outcome options', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    await user.click(screen.getByLabelText(/outcome/i));
    
    await waitFor(() => {
      expect(screen.getByText(/improved/i)).toBeInTheDocument();
      expect(screen.getByText(/maintained/i)).toBeInTheDocument();
      expect(screen.getByText(/declined/i)).toBeInTheDocument();
      expect(screen.getByText(/unable to assess/i)).toBeInTheDocument();
    });
  });

  it('should require outcome for completion', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    // Fill progress notes but not outcome
    await user.type(screen.getByLabelText(/progress notes/i), 'Test notes');
    await user.click(screen.getByRole('button', { name: /complete session/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/outcome is required/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// COMPLETION TESTS
// =============================================================================

describe('PhysioSessionForm - Completion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks(mockInProgressSession);
    mockMutation.mutateAsync.mockResolvedValue(mockCompletedSession);
  });

  it('should submit form with all data on completion', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    // Fill all fields
    await user.type(screen.getByLabelText(/progress notes/i), 'Good ROM improvement');
    await user.type(screen.getByLabelText(/treatment provided/i), 'ROM exercises, strengthening');
    
    await user.click(screen.getByLabelText(/outcome/i));
    await user.click(screen.getByText(/improved/i));
    
    // Set pain after
    const painAfterSlider = screen.getByRole('slider', { name: /pain.*after/i });
    await user.clear(painAfterSlider);
    await user.type(painAfterSlider, '3');
    
    await user.click(screen.getByRole('button', { name: /complete session/i }));
    
    await waitFor(() => {
      expect(mockMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 1,
          progress_notes: 'Good ROM improvement',
          treatment_provided: 'ROM exercises, strengthening',
          outcome: 'IMPROVED',
          pain_level_after: 3,
        })
      );
    });
  });

  it('should show success message after completion', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    // Fill required fields
    await user.type(screen.getByLabelText(/progress notes/i), 'Test notes');
    await user.click(screen.getByLabelText(/outcome/i));
    await user.click(screen.getByText(/improved/i));
    
    await user.click(screen.getByRole('button', { name: /complete session/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/session completed|success/i)).toBeInTheDocument();
    });
  });

  it('should show invoice item creation notification', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    // Fill and complete
    await user.type(screen.getByLabelText(/progress notes/i), 'Test notes');
    await user.click(screen.getByLabelText(/outcome/i));
    await user.click(screen.getByText(/improved/i));
    await user.click(screen.getByRole('button', { name: /complete session/i }));
    
    await waitFor(() => {
      // Should indicate billing was created
      expect(screen.getByText(/invoice|billing/i)).toBeInTheDocument();
    });
  });

  it('should navigate back to session list after completion', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioSessionForm sessionId={1} orderId={1} />);
    
    // Fill and complete
    await user.type(screen.getByLabelText(/progress notes/i), 'Test notes');
    await user.click(screen.getByLabelText(/outcome/i));
    await user.click(screen.getByText(/improved/i));
    await user.click(screen.getByRole('button', { name: /complete session/i }));
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/allied-health/physiotherapy/orders/1');
    });
  });
});

// =============================================================================
// CANCELLATION TESTS
// =============================================================================

describe('PhysioSessionForm - Cancellation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
    mockMutation.mutateAsync.mockResolvedValue({
      ...mockScheduledSession,
      status: 'CANCELLED',
    });
  });

  it('should show cancel button for scheduled sessions', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByRole('button', { name: /cancel session/i })).toBeInTheDocument();
  });

  it('should show confirmation dialog when cancelling', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    await user.click(screen.getByRole('button', { name: /cancel session/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/are you sure|confirm/i)).toBeInTheDocument();
    });
  });

  it('should require cancellation reason', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    await user.click(screen.getByRole('button', { name: /cancel session/i }));
    
    // Confirm without reason
    const confirmButton = screen.getByRole('button', { name: /confirm cancel/i });
    await user.click(confirmButton);
    
    await waitFor(() => {
      expect(screen.getByText(/reason is required/i)).toBeInTheDocument();
    });
  });

  it('should call cancel mutation with reason', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    await user.click(screen.getByRole('button', { name: /cancel session/i }));
    
    // Fill reason and confirm
    await user.type(screen.getByLabelText(/reason/i), 'Patient no-show');
    await user.click(screen.getByRole('button', { name: /confirm cancel/i }));
    
    await waitFor(() => {
      expect(mockMutation.mutateAsync).toHaveBeenCalledWith({
        session_id: 1,
        reason: 'Patient no-show',
      });
    });
  });
});

// =============================================================================
// VIEW MODE TESTS (COMPLETED SESSION)
// =============================================================================

describe('PhysioSessionForm - View Mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks(mockCompletedSession);
  });

  it('should display completed session data in read-only mode', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByText(/good progress observed/i)).toBeInTheDocument();
    expect(screen.getByText(/rom exercises, strengthening/i)).toBeInTheDocument();
  });

  it('should show duration for completed sessions', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByText(/45.*minutes|45 min/i)).toBeInTheDocument();
  });

  it('should show outcome badge for completed sessions', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByText(/improved/i)).toBeInTheDocument();
  });

  it('should show pain improvement for completed sessions', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    // Before: 6, After: 3
    expect(screen.getByText(/6/)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it('should show invoice link for billed sessions', () => {
    renderWithWrapper(<PhysioSessionForm sessionId={1} />);
    
    expect(screen.getByText(/billed|invoice/i)).toBeInTheDocument();
  });
});
