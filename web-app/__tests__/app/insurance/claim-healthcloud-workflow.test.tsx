import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ClaimDetailPage from '@/app/(dashboard)/insurance/claims/[id]/page';

const mockPush = jest.fn();
const mockToast = jest.fn();
const mockRequestOtp = jest.fn();

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '1' }),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock('@/lib/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock('@/lib/hooks/use-permissions', () => ({
  __esModule: true,
  default: () => ({
    canPerformAction: () => true,
  }),
}));

jest.mock('@/lib/hooks/use-insurance', () => {
  const claim = {
    id: 1,
    claim_number: 'IC-20260805-0001',
    invoice: null,
    patient_insurance: 101,
    provider: 1,
    provider_name: 'Jubilee',
    patient: 1,
    patient_name: 'Jane Doe',
    member_number: 'DEMO/001',
    plan_name: 'Gold Plan',
    encounter: null,
    preauth: null,
    status: 'draft',
    claim_type: 'outpatient',
    diagnosis_codes: ['J10'],
    service_date: '2026-08-05',
    admission_date: null,
    discharge_date: null,
    submission_date: null,
    total_amount: '2500.00',
    approved_amount: '0.00',
    copay_amount: '0.00',
    paid_amount: '0.00',
    external_claim_id: '',
    external_preauth_id: '',
    rejection_reason: '',
    query_details: '',
    query_response: '',
    submitted_by: null,
    reviewed_by: null,
    notes: '',
    attachments_meta: [],
    days_since_submission: null,
    is_overdue: false,
    is_appealable: false,
    items: [
      {
        id: 1,
        claim: 1,
        invoice_item: null,
        service_description: 'Consultation',
        service_code: 'CONS-01',
        quantity: 1,
        unit_price: '2500.00',
        claimed_amount: '2500.00',
        approved_amount: '0.00',
        rejection_reason: '',
        tariff_code: '',
        status: 'pending',
        created_at: '',
        updated_at: '',
      },
    ],
    created_at: '',
    updated_at: '',
  };

  return {
    useInsuranceClaim: () => ({ data: claim, isLoading: false, refetch: jest.fn() }),
    useSubmitClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useCancelClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useApproveClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useRejectClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useRespondToQuery: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useMarkClaimPaid: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useAppealClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useRequestEnrollmentOtp: () => ({
      mutateAsync: mockRequestOtp.mockResolvedValue({ id: 99, auth_token: '', authorization_guid: '' }),
      isPending: false,
    }),
    useStartEnrollmentVisit: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useValidateVisitAuthorization: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useReserveClaimBalance: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useSubmitClaimToHealthcloud: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useSubmitClaimInvoice: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useSubmitClaimCreditNote: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useUploadClaimAttachment: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useCheckClaimRemittance: () => ({ mutateAsync: jest.fn(), isPending: false }),
  };
});

describe('Claim HealthCloud Workflow UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders HealthCloud workflow actions', () => {
    render(<ClaimDetailPage />);

    expect(screen.getByText('HealthCloud Workflow')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request otp/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start visit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit claim/i })).toBeInTheDocument();
  });

  it('can trigger OTP request from workflow panel', async () => {
    const user = userEvent.setup();
    render(<ClaimDetailPage />);

    await user.type(screen.getByPlaceholderText(/e\.g\. 5531/i), '5531');
    await user.click(screen.getByRole('button', { name: /request otp/i }));

    await waitFor(() => {
      expect(mockRequestOtp).toHaveBeenCalled();
    });
  });

  it('shows credit-note action in workflow panel', () => {
    render(<ClaimDetailPage />);

    expect(screen.getByRole('button', { name: /submit credit note/i })).toBeInTheDocument();
  });
});
