import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';

import BillingDetailScreen from '@/app/billing/[id]';
import { lightTheme } from '@/constants/theme';
import { billingApi } from '@/lib/api/billing';

const mockLightTheme = lightTheme;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '8' }),
}));

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: mockLightTheme,
    isDarkMode: false,
  }),
}));

jest.mock('@/lib/api/billing', () => ({
  billingApi: {
    getInvoice: jest.fn(),
    listPayments: jest.fn(),
  },
}));

const mockedBillingApi = billingApi as jest.Mocked<typeof billingApi>;

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BillingDetailScreen />
    </QueryClientProvider>
  );
}

describe('BillingDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedBillingApi.getInvoice.mockResolvedValue({
      id: 8,
      invoice_number: 'INV-20260313-0008',
      patient: 14,
      patient_name: 'Jane Doe',
      patient_mrn: 'MRN-20260311-0001',
      encounter: 55,
      invoice_date: '2026-03-13',
      due_date: null,
      status: 'partial',
      payment_type: 'cash',
      subtotal: 1500,
      discount_amount: 0,
      tax_amount: 0,
      total_amount: 1500,
      amount_paid: 500,
      balance: 1000,
      balance_due: 1000,
      insurance_provider: 'SHA',
      sha_claim_number: 'SHA-123',
      created_at: '2026-03-13T08:00:00Z',
      updated_at: '2026-03-13T08:00:00Z',
      items: [
        {
          id: 90,
          description: 'Consultation fee',
          quantity: 1,
          unit_price: 1500,
          discount_amount: 0,
          line_total: 1500,
          is_covered_by_insurance: false,
        },
      ],
    });
    mockedBillingApi.listPayments.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 33,
          payment_reference: 'PAY-33',
          invoice: 8,
          invoice_number: 'INV-20260313-0008',
          method: 'cash',
          amount: 500,
          status: 'completed',
          payment_date: '2026-03-13',
        },
      ],
    });
  });

  it('renders invoice summary, items, and payments', async () => {
    renderScreen();

    expect(await screen.findByText('INV-20260313-0008')).toBeTruthy();
    expect(screen.getByText('Consultation fee')).toBeTruthy();
    expect(screen.getByText(/SHA-123/)).toBeTruthy();
    expect(screen.getAllByText('cash').length).toBeGreaterThan(0);
  });
});
