import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ClaimDetailPage from '@/app/(dashboard)/insurance/claims/[id]/page';

const mockPush = jest.fn();
const mockToast = jest.fn();
const mockStartSession = jest.fn();
const mockRequestSessionOtp = jest.fn();

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

jest.mock('@/lib/hooks/billing', () => ({
  useInvoice: () => ({ data: undefined, isLoading: false }),
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
    external_claim_id: 'HC-CLAIM-001',
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
    useVisitAuthorizations: () => ({ data: { results: [] }, isLoading: false }),
    useSubmitClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useCancelClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useApproveClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useRejectClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useRespondToQuery: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useMarkClaimPaid: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useAppealClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useStartHealthcloudSession: () => ({
      mutateAsync: mockStartSession.mockResolvedValue({
        session: {
          id: 99,
          enrollment: 101,
          provider_config: 1,
          patient: 1,
          patient_name: 'Jane Doe',
          encounter: null,
          member_number: 'DEMO/001',
          payer_slade_code: 457,
          benefit_type: '',
          benefit_code: '',
          policy_number: 'POL/001',
          beneficiary_id: 636561,
          beneficiary_contact_id: null,
          beneficiary_contact_value: '',
          selected_beneficiary_contact_id: null,
          selected_beneficiary_contact_value: '',
          selected_benefit_type: '',
          selected_benefit_code: '',
          factors: [],
          eligibility_payload: {},
          workflow_step: 'eligibility_verified',
          status: 'pending',
          auth_token: '',
          authorization_guid: '',
          authorization_date: null,
          auth_expiry: null,
          auth_status: '',
          last_error: '',
          raw_payload: {},
          created_at: '',
          updated_at: '',
        },
        eligibility: {
          eligible: true,
          status: 'LIVE',
          plan_name: 'Muungano Scheme',
          member_number: 'DEMO/001',
          annual_balance: '968355.0',
          copay_percent: null,
          message: 'Eligibility retrieved from HealthCloud',
          raw_response: {
            member: {
              id: 636561,
              names: 'Jane Doe',
              contacts: [{ id: 5531, contactValue: '+254700***123' }],
            },
            cover: {
              policyNumber: 'POL/001',
              schemeName: 'Muungano Scheme',
              status: 'LIVE',
            },
            benefits: [
              {
                benefitCode: 'BEN/001',
                benefitType: 'OUTPATIENT',
                benefitName: 'Outpatient Shared',
              },
            ],
          },
        },
      }),
      isPending: false,
    }),
    useRequestHealthcloudSessionOtp: () => ({
      mutateAsync: mockRequestSessionOtp.mockResolvedValue({
        id: 99,
        enrollment: 101,
        provider_config: 1,
        patient: 1,
        patient_name: 'Jane Doe',
        encounter: null,
        member_number: 'DEMO/001',
        payer_slade_code: 457,
        benefit_type: '',
        benefit_code: '',
        policy_number: 'POL/001',
        beneficiary_id: 636561,
        beneficiary_contact_id: 5531,
        beneficiary_contact_value: '+254700***123',
        selected_beneficiary_contact_id: 5531,
        selected_beneficiary_contact_value: '+254700***123',
        selected_benefit_type: '',
        selected_benefit_code: '',
        factors: [],
        eligibility_payload: {},
        workflow_step: 'otp_requested',
        status: 'otp_requested',
        auth_token: '',
        authorization_guid: '',
        authorization_date: null,
        auth_expiry: null,
        auth_status: '',
        last_error: '',
        raw_payload: {},
        created_at: '',
        updated_at: '',
      }),
      isPending: false,
    }),
    useStartHealthcloudSessionVisit: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useValidateVisitAuthorization: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useReserveClaimBalance: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useSubmitClaimToHealthcloud: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useRefreshClaimExternalStatus: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useSubmitClaimInvoice: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useSubmitClaimCreditNote: () => ({ mutateAsync: jest.fn(), isPending: false }),
    useUploadClaimAttachmentFile: () => ({ mutateAsync: jest.fn(), isPending: false }),
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
    expect(screen.getByRole('button', { name: /run eligibility/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit claim to healthcloud/i })).toBeInTheDocument();
  });

  it('can trigger OTP request from workflow panel', async () => {
    const user = userEvent.setup();
    render(<ClaimDetailPage />);

    await user.click(screen.getByRole('button', { name: /run eligibility/i }));
    await user.click(screen.getByRole('button', { name: /request otp/i }));

    await waitFor(() => {
      expect(mockRequestSessionOtp).toHaveBeenCalled();
    });
  });

  it('shows credit-note action in workflow panel', () => {
    render(<ClaimDetailPage />);

    expect(screen.getByRole('button', { name: /create credit note/i })).toBeInTheDocument();
  });
});
