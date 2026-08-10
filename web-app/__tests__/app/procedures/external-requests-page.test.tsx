/**
 * @jest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ExternalProcedureRequestsPage from '@/app/(dashboard)/procedures/external-requests/page';

const mockListExternalRequests = jest.fn();
const mockAcceptExternalRequest = jest.fn();
const mockRejectExternalRequest = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const mockRefresh = jest.fn();

jest.mock('@/lib/api/procedures', () => ({
  proceduresApi: {
    listExternalRequests: (...args: unknown[]) => mockListExternalRequests(...args),
    acceptExternalRequest: (...args: unknown[]) => mockAcceptExternalRequest(...args),
    rejectExternalRequest: (...args: unknown[]) => mockRejectExternalRequest(...args),
  },
}));

jest.mock('@/lib/context/page-refresh-context', () => ({
  usePageRefresh: () => ({
    refresh: mockRefresh,
    isRefreshing: false,
  }),
}));

jest.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const requestItem = {
  id: 31,
  request_number: 'EPR-20260810-0031',
  patient: 7,
  patient_name: 'Jane Doe',
  encounter: 44,
  procedure: 101,
  procedure_name: 'Cardiac Catheterization',
  priority: 'URGENT',
  indication: 'Further evaluation',
  clinical_notes: '',
  body_site: '',
  laterality: 'NA',
  sending_facility: 'Nairobi Heart Institute',
  referring_clinician: 'Dr. Okello',
  status: 'RECEIVED',
  rejection_reason: '',
  procedure_order: null,
  procedure_order_number: null,
  processed_by: null,
  processed_at: null,
  created_at: '2026-08-10T10:00:00Z',
  updated_at: '2026-08-10T10:00:00Z',
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ExternalProcedureRequestsPage />
    </QueryClientProvider>
  );
}

describe('ExternalProcedureRequestsPage actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockListExternalRequests.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [requestItem],
    });
    mockAcceptExternalRequest.mockResolvedValue({ ...requestItem, status: 'ACCEPTED' });
    mockRejectExternalRequest.mockResolvedValue({
      ...requestItem,
      status: 'REJECTED',
      rejection_reason: 'No specialist available',
    });
  });

  it('accepts a received external request', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText('EPR-20260810-0031');

    await user.click(screen.getAllByRole('button', { name: /accept/i })[0]);

    await waitFor(() => {
      expect(mockAcceptExternalRequest).toHaveBeenCalledWith(31);
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      'External request accepted and procedure order created'
    );
  });

  it('opens reject dialog and submits rejection reason', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText('EPR-20260810-0031');

    await user.click(screen.getAllByRole('button', { name: /reject/i })[0]);
    expect(screen.getByRole('heading', { name: 'Reject Request' })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/enter reason/i), 'No specialist available');
    await user.click(screen.getByRole('button', { name: /^reject request$/i }));

    await waitFor(() => {
      expect(mockRejectExternalRequest).toHaveBeenCalledWith(31, 'No specialist available');
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('External request rejected');
  });
});
