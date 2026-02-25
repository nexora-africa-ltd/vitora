/**
 * Unit Tests for PhysioOrderForm Component (TDD)
 *
 * Tests for the physiotherapy order creation/edit form.
 * Written BEFORE implementation following TDD methodology.
 *
 * Test Categories:
 * 1. Form Rendering
 * 2. Required Field Validation
 * 3. Field Value Validation
 * 4. Treatment Type Selection
 * 5. Patient Selection
 * 6. Form Submission
 * 7. Edit Mode
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhysioOrderForm } from '@/components/allied-health/physiotherapy/physio-order-form';

// Mock next/navigation
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  }),
  useParams: () => ({}),
}));

// Mock the hooks
jest.mock('@/lib/hooks/use-physiotherapy', () => ({
  usePhysioTreatmentTypes: jest.fn(),
  useCreatePhysioOrder: jest.fn(),
  useUpdatePhysioOrder: jest.fn(),
}));

jest.mock('@/lib/hooks/use-patients', () => ({
  usePatients: jest.fn(),
  usePatient: jest.fn(),
}));

jest.mock('@/lib/hooks/use-encounters', () => ({
  useEncounter: jest.fn(),
}));

import { usePhysioTreatmentTypes, useCreatePhysioOrder, useUpdatePhysioOrder } from '@/lib/hooks/use-physiotherapy';
import { usePatients, usePatient } from '@/lib/hooks/use-patients';
import { useEncounter } from '@/lib/hooks/use-encounters';

const mockUsePhysioTreatmentTypes = usePhysioTreatmentTypes as jest.Mock;
const mockUseCreatePhysioOrder = useCreatePhysioOrder as jest.Mock;
const mockUseUpdatePhysioOrder = useUpdatePhysioOrder as jest.Mock;
const mockUsePatients = usePatients as jest.Mock;
const mockUsePatient = usePatient as jest.Mock;
const mockUseEncounter = useEncounter as jest.Mock;

// =============================================================================
// MOCK DATA
// =============================================================================

const mockTreatmentTypes = {
  count: 3,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      code: 'PT-PSR-001',
      name: 'Post-Surgery Rehabilitation',
      category: 'POST_SURGICAL',
      typical_duration_minutes: 45,
      recommended_sessions: 12,
      cost_per_session: '2000.00',
      sha_claimable: true,
      is_active: true,
    },
    {
      id: 2,
      code: 'PT-SPT-001',
      name: 'Sports Injury Recovery',
      category: 'SPORTS',
      typical_duration_minutes: 60,
      recommended_sessions: 8,
      cost_per_session: '2500.00',
      sha_claimable: true,
      is_active: true,
    },
    {
      id: 3,
      code: 'PT-NEU-001',
      name: 'Neurological Rehabilitation',
      category: 'NEUROLOGICAL',
      typical_duration_minutes: 45,
      recommended_sessions: 20,
      cost_per_session: '3000.00',
      sha_claimable: true,
      is_active: true,
    },
  ],
};

const mockPatients = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      mrn: 'MRN-20260226-0001',
      first_name: 'John',
      last_name: 'Doe',
      full_name: 'John Doe',
      date_of_birth: '1970-05-15',
      gender: 'M',
    },
    {
      id: 2,
      mrn: 'MRN-20260226-0002',
      first_name: 'Jane',
      last_name: 'Smith',
      full_name: 'Jane Smith',
      date_of_birth: '1985-08-20',
      gender: 'F',
    },
  ],
};

const mockPatient = mockPatients.results[0];

const mockEncounter = {
  id: 100,
  patient: 1,
  patient_name: 'John Doe',
  encounter_type: 'OPD',
  encounter_date: '2026-02-26',
  chief_complaint: 'Knee pain after surgery',
  status: 'IN_PROGRESS',
};

const mockCreateMutation = {
  mutate: jest.fn(),
  mutateAsync: jest.fn(),
  isPending: false,
  isError: false,
  error: null,
};

const mockUpdateMutation = {
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

// =============================================================================
// DEFAULT MOCK SETUP
// =============================================================================

const setupMocks = () => {
  mockUsePhysioTreatmentTypes.mockReturnValue({
    data: mockTreatmentTypes,
    isLoading: false,
    error: null,
  });

  mockUsePatients.mockReturnValue({
    data: mockPatients,
    isLoading: false,
    error: null,
  });

  mockUsePatient.mockReturnValue({
    data: mockPatient,
    isLoading: false,
    error: null,
  });

  mockUseEncounter.mockReturnValue({
    data: mockEncounter,
    isLoading: false,
    error: null,
  });

  mockUseCreatePhysioOrder.mockReturnValue(mockCreateMutation);
  mockUseUpdatePhysioOrder.mockReturnValue(mockUpdateMutation);
};

// =============================================================================
// FORM RENDERING TESTS
// =============================================================================

describe('PhysioOrderForm - Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('should render patient selection field', () => {
    renderWithWrapper(<PhysioOrderForm />);
    
    expect(screen.getByLabelText(/patient/i)).toBeInTheDocument();
  });

  it('should render treatment type selection field', () => {
    renderWithWrapper(<PhysioOrderForm />);
    
    expect(screen.getByLabelText(/treatment type/i)).toBeInTheDocument();
  });

  it('should render referral reason field', () => {
    renderWithWrapper(<PhysioOrderForm />);
    
    expect(screen.getByLabelText(/referral reason/i)).toBeInTheDocument();
  });

  it('should render clinical indication textarea', () => {
    renderWithWrapper(<PhysioOrderForm />);
    
    expect(screen.getByLabelText(/clinical indication/i)).toBeInTheDocument();
  });

  it('should render total sessions input', () => {
    renderWithWrapper(<PhysioOrderForm />);
    
    expect(screen.getByLabelText(/total sessions/i)).toBeInTheDocument();
  });

  it('should render frequency input', () => {
    renderWithWrapper(<PhysioOrderForm />);
    
    expect(screen.getByLabelText(/frequency/i)).toBeInTheDocument();
  });

  it('should render priority selection', () => {
    renderWithWrapper(<PhysioOrderForm />);
    
    expect(screen.getByLabelText(/priority/i)).toBeInTheDocument();
  });

  it('should render treatment goals textarea', () => {
    renderWithWrapper(<PhysioOrderForm />);
    
    expect(screen.getByLabelText(/treatment goals/i)).toBeInTheDocument();
  });

  it('should render submit button', () => {
    renderWithWrapper(<PhysioOrderForm />);
    
    expect(screen.getByRole('button', { name: /create order|submit/i })).toBeInTheDocument();
  });

  it('should render cancel button', () => {
    renderWithWrapper(<PhysioOrderForm />);
    
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('should pre-populate patient when patientId is provided', () => {
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    expect(screen.getByText(/john doe/i)).toBeInTheDocument();
  });

  it('should pre-populate encounter context when encounterId is provided', () => {
    renderWithWrapper(<PhysioOrderForm encounterId={100} />);
    
    // Encounter info should be displayed
    expect(screen.getByText(/knee pain after surgery/i)).toBeInTheDocument();
  });
});

// =============================================================================
// REQUIRED FIELD VALIDATION TESTS
// =============================================================================

describe('PhysioOrderForm - Required Field Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('should show error when patient is not selected', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm />);
    
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/patient is required/i)).toBeInTheDocument();
    });
  });

  it('should show error when treatment type is not selected', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/treatment type is required/i)).toBeInTheDocument();
    });
  });

  it('should show error when clinical indication is empty', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    // Select treatment type but leave clinical indication empty
    await user.click(screen.getByLabelText(/treatment type/i));
    await user.click(screen.getByText(/post-surgery rehabilitation/i));
    
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/clinical indication is required/i)).toBeInTheDocument();
    });
  });

  it('should show error when total sessions is empty', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    // Clear the total sessions field
    const sessionsInput = screen.getByLabelText(/total sessions/i);
    await user.clear(sessionsInput);
    
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/total sessions is required/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// FIELD VALUE VALIDATION TESTS
// =============================================================================

describe('PhysioOrderForm - Field Value Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('should show error when total sessions exceeds 52', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    const sessionsInput = screen.getByLabelText(/total sessions/i);
    await user.clear(sessionsInput);
    await user.type(sessionsInput, '100');
    
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/sessions must be between 1 and 52/i)).toBeInTheDocument();
    });
  });

  it('should show error when total sessions is less than 1', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    const sessionsInput = screen.getByLabelText(/total sessions/i);
    await user.clear(sessionsInput);
    await user.type(sessionsInput, '0');
    
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/sessions must be between 1 and 52/i)).toBeInTheDocument();
    });
  });

  it('should show error when total sessions is negative', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    const sessionsInput = screen.getByLabelText(/total sessions/i);
    await user.clear(sessionsInput);
    await user.type(sessionsInput, '-5');
    
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/sessions must be between 1 and 52/i)).toBeInTheDocument();
    });
  });

  it('should accept valid session count within range', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    const sessionsInput = screen.getByLabelText(/total sessions/i);
    await user.clear(sessionsInput);
    await user.type(sessionsInput, '12');
    
    // Should not show validation error
    expect(screen.queryByText(/sessions must be between/i)).not.toBeInTheDocument();
  });

  it('should validate clinical indication minimum length', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    const clinicalIndication = screen.getByLabelText(/clinical indication/i);
    await user.type(clinicalIndication, 'ab'); // Too short
    
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/must be at least.*characters/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// TREATMENT TYPE SELECTION TESTS
// =============================================================================

describe('PhysioOrderForm - Treatment Type Selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('should display available treatment types', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    await user.click(screen.getByLabelText(/treatment type/i));
    
    await waitFor(() => {
      expect(screen.getByText(/post-surgery rehabilitation/i)).toBeInTheDocument();
      expect(screen.getByText(/sports injury recovery/i)).toBeInTheDocument();
      expect(screen.getByText(/neurological rehabilitation/i)).toBeInTheDocument();
    });
  });

  it('should auto-populate recommended sessions when treatment type is selected', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    await user.click(screen.getByLabelText(/treatment type/i));
    await user.click(screen.getByText(/post-surgery rehabilitation/i));
    
    const sessionsInput = screen.getByLabelText(/total sessions/i);
    expect(sessionsInput).toHaveValue(12); // recommended_sessions from mock
  });

  it('should show SHA claimable indicator for covered treatments', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    await user.click(screen.getByLabelText(/treatment type/i));
    await user.click(screen.getByText(/post-surgery rehabilitation/i));
    
    expect(screen.getByText(/sha claimable/i)).toBeInTheDocument();
  });

  it('should display cost per session when treatment type is selected', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    await user.click(screen.getByLabelText(/treatment type/i));
    await user.click(screen.getByText(/post-surgery rehabilitation/i));
    
    expect(screen.getByText(/2,?000/)).toBeInTheDocument(); // KES 2000
  });
});

// =============================================================================
// PATIENT SELECTION TESTS
// =============================================================================

describe('PhysioOrderForm - Patient Selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('should search patients by name', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm />);
    
    const patientInput = screen.getByLabelText(/patient/i);
    await user.type(patientInput, 'John');
    
    await waitFor(() => {
      expect(screen.getByText(/john doe/i)).toBeInTheDocument();
    });
  });

  it('should search patients by MRN', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm />);
    
    const patientInput = screen.getByLabelText(/patient/i);
    await user.type(patientInput, 'MRN-20260226-0001');
    
    await waitFor(() => {
      expect(screen.getByText(/john doe/i)).toBeInTheDocument();
    });
  });

  it('should display patient MRN after selection', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm />);
    
    const patientInput = screen.getByLabelText(/patient/i);
    await user.type(patientInput, 'John');
    await user.click(screen.getByText(/john doe/i));
    
    expect(screen.getByText(/MRN-20260226-0001/)).toBeInTheDocument();
  });

  it('should disable patient selection when patientId is provided', () => {
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    const patientInput = screen.getByLabelText(/patient/i);
    expect(patientInput).toBeDisabled();
  });
});

// =============================================================================
// FORM SUBMISSION TESTS
// =============================================================================

describe('PhysioOrderForm - Submission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
    mockCreateMutation.mutateAsync.mockResolvedValue({
      id: 1,
      order_number: 'PHYSIO-20260226-0001',
    });
  });

  it('should submit form with valid data', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    // Fill form
    await user.click(screen.getByLabelText(/treatment type/i));
    await user.click(screen.getByText(/post-surgery rehabilitation/i));
    
    await user.type(screen.getByLabelText(/clinical indication/i), 'Post knee replacement rehabilitation');
    
    await user.clear(screen.getByLabelText(/total sessions/i));
    await user.type(screen.getByLabelText(/total sessions/i), '12');
    
    await user.type(screen.getByLabelText(/frequency/i), '3x per week');
    
    // Submit
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: 1,
          treatment_type_id: 1,
          clinical_indication: 'Post knee replacement rehabilitation',
          total_sessions: 12,
          frequency: '3x per week',
        })
      );
    });
  });

  it('should include encounter_id when provided', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} encounterId={100} />);
    
    // Fill minimum required fields
    await user.click(screen.getByLabelText(/treatment type/i));
    await user.click(screen.getByText(/post-surgery rehabilitation/i));
    await user.type(screen.getByLabelText(/clinical indication/i), 'Test indication');
    
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          encounter_id: 100,
        })
      );
    });
  });

  it('should show loading state during submission', async () => {
    mockUseCreatePhysioOrder.mockReturnValue({
      ...mockCreateMutation,
      isPending: true,
    });
    
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    expect(screen.getByRole('button', { name: /creating|submitting|loading/i })).toBeDisabled();
  });

  it('should show success message after submission', async () => {
    const user = userEvent.setup();
    mockCreateMutation.mutateAsync.mockResolvedValue({
      id: 1,
      order_number: 'PHYSIO-20260226-0001',
    });
    
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    // Fill and submit
    await user.click(screen.getByLabelText(/treatment type/i));
    await user.click(screen.getByText(/post-surgery rehabilitation/i));
    await user.type(screen.getByLabelText(/clinical indication/i), 'Test indication');
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/order created|success/i)).toBeInTheDocument();
    });
  });

  it('should show error message on submission failure', async () => {
    mockCreateMutation.mutateAsync.mockRejectedValue(new Error('Network error'));
    
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    // Fill and submit
    await user.click(screen.getByLabelText(/treatment type/i));
    await user.click(screen.getByText(/post-surgery rehabilitation/i));
    await user.type(screen.getByLabelText(/clinical indication/i), 'Test indication');
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/failed|error/i)).toBeInTheDocument();
    });
  });

  it('should navigate to order detail after successful creation', async () => {
    const user = userEvent.setup();
    mockCreateMutation.mutateAsync.mockResolvedValue({
      id: 1,
      order_number: 'PHYSIO-20260226-0001',
    });
    
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    // Fill and submit
    await user.click(screen.getByLabelText(/treatment type/i));
    await user.click(screen.getByText(/post-surgery rehabilitation/i));
    await user.type(screen.getByLabelText(/clinical indication/i), 'Test indication');
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/allied-health/physiotherapy/orders/1');
    });
  });

  it('should navigate back on cancel', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm />);
    
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    
    expect(mockBack).toHaveBeenCalled();
  });
});

// =============================================================================
// EDIT MODE TESTS
// =============================================================================

describe('PhysioOrderForm - Edit Mode', () => {
  const existingOrder = {
    id: 1,
    order_number: 'PHYSIO-20260226-0001',
    patient_id: 1,
    treatment_type_id: 1,
    referral_reason: 'POST_SURGERY',
    clinical_indication: 'Existing clinical indication',
    total_sessions: 12,
    frequency: '3x per week',
    priority: 'ROUTINE',
    treatment_goals: 'Existing goals',
    precautions: 'Existing precautions',
    contraindications: '',
    status: 'PENDING',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('should show "Update Order" button in edit mode', () => {
    renderWithWrapper(<PhysioOrderForm order={existingOrder} />);
    
    expect(screen.getByRole('button', { name: /update order|save/i })).toBeInTheDocument();
  });

  it('should pre-populate form fields with existing order data', () => {
    renderWithWrapper(<PhysioOrderForm order={existingOrder} />);
    
    expect(screen.getByLabelText(/clinical indication/i)).toHaveValue('Existing clinical indication');
    expect(screen.getByLabelText(/total sessions/i)).toHaveValue(12);
    expect(screen.getByLabelText(/frequency/i)).toHaveValue('3x per week');
    expect(screen.getByLabelText(/treatment goals/i)).toHaveValue('Existing goals');
  });

  it('should call update mutation in edit mode', async () => {
    mockUpdateMutation.mutateAsync.mockResolvedValue({
      ...existingOrder,
      clinical_indication: 'Updated indication',
    });
    
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm order={existingOrder} />);
    
    // Update a field
    const clinicalIndication = screen.getByLabelText(/clinical indication/i);
    await user.clear(clinicalIndication);
    await user.type(clinicalIndication, 'Updated indication');
    
    // Submit
    await user.click(screen.getByRole('button', { name: /update order|save/i }));
    
    await waitFor(() => {
      expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith({
        id: 1,
        data: expect.objectContaining({
          clinical_indication: 'Updated indication',
        }),
      });
    });
  });

  it('should disable status-related fields for completed orders', () => {
    const completedOrder = { ...existingOrder, status: 'COMPLETED' };
    renderWithWrapper(<PhysioOrderForm order={completedOrder} />);
    
    expect(screen.getByLabelText(/treatment type/i)).toBeDisabled();
    expect(screen.getByLabelText(/total sessions/i)).toBeDisabled();
  });
});

// =============================================================================
// PRIORITY SELECTION TESTS
// =============================================================================

describe('PhysioOrderForm - Priority Selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('should display priority options', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    await user.click(screen.getByLabelText(/priority/i));
    
    await waitFor(() => {
      expect(screen.getByText(/routine/i)).toBeInTheDocument();
      expect(screen.getByText(/urgent/i)).toBeInTheDocument();
      expect(screen.getByText(/emergency/i)).toBeInTheDocument();
    });
  });

  it('should default to ROUTINE priority', () => {
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    expect(screen.getByText(/routine/i)).toBeInTheDocument();
  });

  it('should include priority in submission', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    // Fill required fields
    await user.click(screen.getByLabelText(/treatment type/i));
    await user.click(screen.getByText(/post-surgery rehabilitation/i));
    await user.type(screen.getByLabelText(/clinical indication/i), 'Test indication');
    
    // Select urgent priority
    await user.click(screen.getByLabelText(/priority/i));
    await user.click(screen.getByText(/urgent/i));
    
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'URGENT',
        })
      );
    });
  });
});

// =============================================================================
// REFERRAL REASON TESTS
// =============================================================================

describe('PhysioOrderForm - Referral Reason Selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('should display referral reason options', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    await user.click(screen.getByLabelText(/referral reason/i));
    
    await waitFor(() => {
      expect(screen.getByText(/post.?surgery|post-surgical/i)).toBeInTheDocument();
      expect(screen.getByText(/sports injury/i)).toBeInTheDocument();
      expect(screen.getByText(/chronic pain/i)).toBeInTheDocument();
    });
  });

  it('should include referral reason in submission', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    // Fill required fields
    await user.click(screen.getByLabelText(/treatment type/i));
    await user.click(screen.getByText(/post-surgery rehabilitation/i));
    await user.type(screen.getByLabelText(/clinical indication/i), 'Test indication');
    
    // Select referral reason
    await user.click(screen.getByLabelText(/referral reason/i));
    await user.click(screen.getByText(/post.?surgery|post-surgical/i));
    
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          referral_reason: expect.stringMatching(/POST_SURGERY|SURGERY/i),
        })
      );
    });
  });
});

// =============================================================================
// OPTIONAL FIELDS TESTS
// =============================================================================

describe('PhysioOrderForm - Optional Fields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('should render precautions field', () => {
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    expect(screen.getByLabelText(/precautions/i)).toBeInTheDocument();
  });

  it('should render contraindications field', () => {
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    expect(screen.getByLabelText(/contraindications/i)).toBeInTheDocument();
  });

  it('should render relevant history field', () => {
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    expect(screen.getByLabelText(/relevant history|medical history/i)).toBeInTheDocument();
  });

  it('should render diagnosis field', () => {
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    expect(screen.getByLabelText(/diagnosis/i)).toBeInTheDocument();
  });

  it('should include optional fields in submission when filled', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<PhysioOrderForm patientId={1} />);
    
    // Fill required fields
    await user.click(screen.getByLabelText(/treatment type/i));
    await user.click(screen.getByText(/post-surgery rehabilitation/i));
    await user.type(screen.getByLabelText(/clinical indication/i), 'Test indication');
    
    // Fill optional fields
    await user.type(screen.getByLabelText(/precautions/i), 'Weight bearing as tolerated');
    await user.type(screen.getByLabelText(/contraindications/i), 'Avoid full flexion');
    await user.type(screen.getByLabelText(/treatment goals/i), 'Full ROM restoration');
    
    await user.click(screen.getByRole('button', { name: /create order|submit/i }));
    
    await waitFor(() => {
      expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          precautions: 'Weight bearing as tolerated',
          contraindications: 'Avoid full flexion',
          treatment_goals: 'Full ROM restoration',
        })
      );
    });
  });
});
