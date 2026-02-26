/**
 * Unit Tests for SocialWorkReferralForm Component (TDD)
 *
 * Tests for the social work referral creation/edit form.
 * Written BEFORE implementation following TDD methodology.
 *
 * Test Categories:
 * 1. Form Rendering
 * 2. Required Field Validation
 * 3. Urgency Selection
 * 4. Sensitive Case Handling
 * 5. Form Submission
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SocialWorkReferralForm } from '@/components/allied-health/social-work/social-work-referral-form';

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
jest.mock('@/lib/hooks/use-social-work', () => ({
  useCreateSocialWorkReferral: jest.fn(),
  useUpdateSocialWorkReferral: jest.fn(),
}));

jest.mock('@/lib/hooks/use-patients', () => ({
  usePatient: jest.fn(),
}));

import { useCreateSocialWorkReferral, useUpdateSocialWorkReferral } from '@/lib/hooks/use-social-work';
import { usePatient } from '@/lib/hooks/use-patients';

const mockUseCreateSocialWorkReferral = useCreateSocialWorkReferral as jest.Mock;
const mockUseUpdateSocialWorkReferral = useUpdateSocialWorkReferral as jest.Mock;
const mockUsePatient = usePatient as jest.Mock;

// =============================================================================
// MOCK DATA
// =============================================================================

const mockPatient = {
  id: 1,
  mrn: 'MRN-20260226-0001',
  first_name: 'Jane',
  last_name: 'Doe',
  full_name: 'Jane Doe',
  date_of_birth: '1985-03-20',
  gender: 'F',
};

const mockCreateMutation = {
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

const setupMocks = () => {
  mockUsePatient.mockReturnValue({
    data: mockPatient,
    isLoading: false,
    error: null,
  });

  mockUseCreateSocialWorkReferral.mockReturnValue(mockCreateMutation);
  mockUseUpdateSocialWorkReferral.mockReturnValue(mockCreateMutation);
};

// =============================================================================
// FORM RENDERING TESTS
// =============================================================================

describe('SocialWorkReferralForm - Rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('should render patient information', () => {
    renderWithWrapper(<SocialWorkReferralForm patientId={1} />);
    
    expect(screen.getByText(/jane doe/i)).toBeInTheDocument();
  });

  it('should render referral reason textarea', () => {
    renderWithWrapper(<SocialWorkReferralForm patientId={1} />);
    
    expect(screen.getByLabelText(/referral reason/i)).toBeInTheDocument();
  });

  it('should render urgency selection', () => {
    renderWithWrapper(<SocialWorkReferralForm patientId={1} />);
    
    expect(screen.getByLabelText(/urgency/i)).toBeInTheDocument();
  });

  it('should render services requested field', () => {
    renderWithWrapper(<SocialWorkReferralForm patientId={1} />);
    
    expect(screen.getByLabelText(/services requested/i)).toBeInTheDocument();
  });

  it('should render sensitive case checkbox', () => {
    renderWithWrapper(<SocialWorkReferralForm patientId={1} />);
    
    expect(screen.getByLabelText(/sensitive case|mark as sensitive/i)).toBeInTheDocument();
  });

  it('should render submit button', () => {
    renderWithWrapper(<SocialWorkReferralForm patientId={1} />);
    
    expect(screen.getByRole('button', { name: /create referral|submit/i })).toBeInTheDocument();
  });
});

// =============================================================================
// REQUIRED FIELD VALIDATION TESTS
// =============================================================================

describe('SocialWorkReferralForm - Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('should show error when referral reason is empty', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<SocialWorkReferralForm patientId={1} />);
    
    await user.click(screen.getByRole('button', { name: /create referral|submit/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/referral reason is required/i)).toBeInTheDocument();
    });
  });

  it('should show error when services requested is empty', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<SocialWorkReferralForm patientId={1} />);
    
    await user.type(screen.getByLabelText(/referral reason/i), 'Test reason');
    await user.click(screen.getByRole('button', { name: /create referral|submit/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/services requested is required/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// URGENCY SELECTION TESTS
// =============================================================================

describe('SocialWorkReferralForm - Urgency Selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('should display urgency options', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<SocialWorkReferralForm patientId={1} />);
    
    await user.click(screen.getByRole('combobox', { name: /urgency/i }));
    
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /routine/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /urgent/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /critical/i })).toBeInTheDocument();
    });
  });

  it('should include urgency in submission', async () => {
    mockCreateMutation.mutateAsync.mockResolvedValue({ id: 1 });
    
    const user = userEvent.setup();
    renderWithWrapper(<SocialWorkReferralForm patientId={1} />);
    
    await user.click(screen.getByRole('combobox', { name: /referral reason/i }));
    await user.click(screen.getByRole('option', { name: /financial/i }));
    await user.type(screen.getByLabelText(/services requested/i), 'Counselling, Safe shelter');
    
    await user.click(screen.getByRole('combobox', { name: /urgency/i }));
    await user.click(screen.getByRole('option', { name: /critical/i }));
    
    await user.click(screen.getByRole('button', { name: /create referral|submit/i }));
    
    await waitFor(() => {
      expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          urgency: 'CRITICAL',
        })
      );
    });
  });
});

// =============================================================================
// SENSITIVE CASE HANDLING TESTS
// =============================================================================

describe('SocialWorkReferralForm - Sensitive Case Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('should enable sensitive case toggle', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<SocialWorkReferralForm patientId={1} />);
    
    const sensitiveCheckbox = screen.getByLabelText(/sensitive case|mark as sensitive/i);
    await user.click(sensitiveCheckbox);
    
    expect(sensitiveCheckbox).toBeChecked();
  });

  it('should show warning when sensitive case is enabled', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<SocialWorkReferralForm patientId={1} />);
    
    await user.click(screen.getByLabelText(/sensitive case|mark as sensitive/i));
    
    expect(screen.getByText(/restricted access|limited visibility/i)).toBeInTheDocument();
  });

  it('should show categories for sensitive case type', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<SocialWorkReferralForm patientId={1} />);
    
    await user.click(screen.getByLabelText(/sensitive case|mark as sensitive/i));
    
    // Should show checkboxes for GBV, HIV, Mental Health
    expect(screen.getByLabelText(/gbv|gender.?based/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hiv/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mental health/i)).toBeInTheDocument();
  });

  it('should include is_sensitive flag in submission', async () => {
    mockCreateMutation.mutateAsync.mockResolvedValue({ id: 1 });
    
    const user = userEvent.setup();
    renderWithWrapper(<SocialWorkReferralForm patientId={1} />);
    
    await user.click(screen.getByRole('combobox', { name: /referral reason/i }));
    await user.click(screen.getByRole('option', { name: /financial/i }));
    await user.type(screen.getByLabelText(/services requested/i), 'Shelter arrangement');
    await user.click(screen.getByLabelText(/sensitive case|mark as sensitive/i));
    
    await user.click(screen.getByRole('button', { name: /create referral|submit/i }));
    
    await waitFor(() => {
      expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          is_sensitive: true,
        })
      );
    });
  });
});

// =============================================================================
// FORM SUBMISSION TESTS
// =============================================================================

describe('SocialWorkReferralForm - Submission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
    mockCreateMutation.mutateAsync.mockResolvedValue({
      id: 1,
      referral_number: 'SW-20260226-0001',
    });
  });

  it('should submit form with valid data', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<SocialWorkReferralForm patientId={1} encounterId={100} />);
    
    await user.click(screen.getByRole('combobox', { name: /referral reason/i }));
    await user.click(screen.getByRole('option', { name: /financial/i }));
    await user.type(screen.getByLabelText(/services requested/i), 'NHIF enrollment assistance');
    
    await user.click(screen.getByRole('button', { name: /create referral|submit/i }));
    
    await waitFor(() => {
      expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: 1,
          encounter_id: 100,
          referral_reason: 'FINANCIAL',
          services_requested: 'NHIF enrollment assistance',
        })
      );
    });
  });

  it('should navigate to referral detail after successful creation', async () => {
    const user = userEvent.setup();
    renderWithWrapper(<SocialWorkReferralForm patientId={1} />);
    
    await user.click(screen.getByRole('combobox', { name: /referral reason/i }));
    await user.click(screen.getByRole('option', { name: /financial/i }));
    await user.type(screen.getByLabelText(/services requested/i), 'Test services');
    await user.click(screen.getByRole('button', { name: /create referral|submit/i }));
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/allied-health/social-work/referrals/1');
    });
  });
});
