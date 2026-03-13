import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import BillingScreen from '@/app/billing/index';
import { lightTheme } from '@/constants/theme';
import { billingApi } from '@/lib/api/billing';

const mockPush = jest.fn();
const mockLightTheme = lightTheme;

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    push: (...args: unknown[]) => mockPush(...args),
  },
  useLocalSearchParams: () => ({ patientId: '14' }),
}));

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: mockLightTheme,
    isDarkMode: false,
  }),
}));

jest.mock('@/lib/api/billing', () => ({
  billingApi: {
    listInvoices: jest.fn(),
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
      <BillingScreen />
    </QueryClientProvider>
  );
}

describe('BillingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedBillingApi.listInvoices.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
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
          created_at: '2026-03-13T08:00:00Z',
          updated_at: '2026-03-13T08:00:00Z',
          items: [],
        },
      ],
    });
  });

  it('renders invoice summaries and opens invoice detail', async () => {
    renderScreen();

    expect(await screen.findByText('Invoices')).toBeTruthy();
    expect(screen.getByText('INV-20260313-0008')).toBeTruthy();
    expect(screen.getByText(/Jane Doe/)).toBeTruthy();

    fireEvent.press(screen.getByText('INV-20260313-0008'));

    expect(mockPush).toHaveBeenCalledWith('/billing/8');
  });
});