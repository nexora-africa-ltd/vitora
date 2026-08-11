/**
 * @jest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ProcedureOrderForm } from '@/components/procedures/procedure-order-form';

const mockCreateOrder = jest.fn();
const mockCreateExternalRequest = jest.fn();
const mockListCatalog = jest.fn();
const mockToast = jest.fn();

jest.mock('@/lib/hooks/use-debounce', () => ({
  useDebounce: (value: string) => value,
}));

jest.mock('@/lib/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

jest.mock('@/lib/api/procedures', () => ({
  proceduresApi: {
    listCatalog: (...args: unknown[]) => mockListCatalog(...args),
    createOrder: (...args: unknown[]) => mockCreateOrder(...args),
    createExternalRequest: (...args: unknown[]) => mockCreateExternalRequest(...args),
  },
}));

const procedureEntry = {
  id: 55,
  code: 'PROC-55',
  name: 'Appendectomy',
  tibabot_procedure_key: 'appendectomy',
  description: 'Appendix removal',
  category: 'General Surgery',
  body_system: 'Digestive',
  risk_level: 'MEDIUM',
  ichi_code: 'ICHI-1',
  cpt_code: 'CPT-1',
  consent_required: true,
  typical_duration_minutes: 45,
  base_fee: 12000,
  sha_tariff_code: 'SHA-1',
  is_active: true,
  default_clinics: [],
  default_clinics_detail: [],
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  Wrapper.displayName = 'QueryClientTestWrapper';
  return Wrapper;
}

describe('ProcedureOrderForm external request flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockListCatalog.mockImplementation(async (params?: Record<string, string>) => {
      if (params?.search) {
        return {
          count: 1,
          next: null,
          previous: null,
          results: [procedureEntry],
        };
      }

      return {
        count: 1,
        next: null,
        previous: null,
        results: [procedureEntry],
      };
    });

    mockCreateExternalRequest.mockResolvedValue({
      id: 99,
      request_number: 'EPR-20260810-0001',
    });
    mockCreateOrder.mockResolvedValue({ id: 5, order_number: 'PO-20260810-0001' });
  });

  it('shows external fields after switching mode and submits external request', async () => {
    const user = userEvent.setup();
    const onSuccess = jest.fn();

    render(
      <ProcedureOrderForm patientId={12} encounterId={7} onSuccess={onSuccess} />,
      { wrapper: createWrapper() }
    );

    await user.type(screen.getByPlaceholderText(/search by procedure name or code/i), 'app');
    await user.click(await screen.findByRole('button', { name: /appendectomy/i }));

    expect(screen.queryByLabelText(/destination facility/i)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/request destination/i));
    await user.click(screen.getByRole('option', { name: /external procedure request/i }));

    expect(screen.getByLabelText(/destination facility/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/referring clinician/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/clinical indication/i), 'Referral for specialist care');
    await user.type(screen.getByLabelText(/destination facility/i), 'City Heart Center');
    await user.type(screen.getByLabelText(/referring clinician/i), 'Dr. Anyango');

    await user.click(screen.getByRole('button', { name: /create external request/i }));

    await waitFor(() => {
      expect(mockCreateExternalRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          patient: 12,
          encounter: 7,
          procedure: 55,
          indication: 'Referral for specialist care',
          sending_facility: 'City Heart Center',
          referring_clinician: 'Dr. Anyango',
        })
      );
    });

    expect(mockCreateOrder).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('EPR-20260810-0001');
    });
  });
});
