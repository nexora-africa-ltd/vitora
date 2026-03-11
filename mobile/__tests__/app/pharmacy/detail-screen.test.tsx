import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import PharmacyDetailScreen from '@/app/pharmacy/[id]';
import { pharmacyApi } from '@/lib/api/pharmacy';

let mockParams: Record<string, string> = { id: '42' };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: require('@/constants/theme').lightTheme,
    isDarkMode: false,
  }),
}));

jest.mock('@/lib/api/pharmacy', () => ({
  pharmacyApi: {
    getPrescription: jest.fn(),
    getStockLevel: jest.fn(),
    dispense: jest.fn(),
    cancelPrescription: jest.fn(),
  },
}));

const mockedPharmacyApi = pharmacyApi as jest.Mocked<typeof pharmacyApi>;

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <PharmacyDetailScreen />
    </QueryClientProvider>
  );

  return { ...rendered, queryClient };
}

describe('PharmacyDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockParams = { id: '42' };

    mockedPharmacyApi.getPrescription.mockResolvedValue({
      id: 42,
      prescription_number: 'RX-20260311-0042',
      encounter: 55,
      patient: 14,
      patient_name: 'Jane Doe',
      patient_mrn: 'MRN-20260311-0001',
      prescriber_name: 'Dr One',
      prescribed_at: '2026-03-11T09:00:00Z',
      valid_until: '2026-04-10',
      status: 'PENDING',
      clinical_notes: 'Treat fever',
      is_valid: true,
      is_valid_prescription: true,
      is_fully_dispensed: false,
      is_fully_dispensed_status: false,
      items: [
        {
          id: 88,
          prescription: 42,
          drug: 3,
          drug_name: 'Paracetamol',
          drug_code: 'PCM500',
          quantity: 20,
          quantity_prescribed: 20,
          dosage: '500mg',
          frequency: 'TDS',
          duration: '5 days',
          route: 'oral',
          instructions: 'Take after meals',
          is_substitutable: true,
          quantity_dispensed: 0,
          remaining_qty: 20,
          remaining_quantity: 20,
          is_cancelled: false,
          cancellation_reason: null,
          created_at: '2026-03-11T09:00:00Z',
          updated_at: '2026-03-11T09:00:00Z',
        },
      ],
      created_at: '2026-03-11T09:00:00Z',
      updated_at: '2026-03-11T09:00:00Z',
    } as never);

    mockedPharmacyApi.getStockLevel.mockResolvedValue({
      drugId: 3,
      availableQuantity: 50,
      outOfStock: false,
      lowStock: false,
      batches: [],
    });

    mockedPharmacyApi.dispense.mockResolvedValue([
      {
        id: 11,
        prescription_item: 88,
        patient: 14,
        drug: 3,
        quantity_dispensed: 20,
        quantity_returned: 0,
        patient_counseled: true,
        dispensed_at: '2026-03-11T10:00:00Z',
        created_at: '2026-03-11T10:00:00Z',
      },
    ] as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('dispenses a medication item using the prefilled remaining quantity', async () => {
    const rendered = renderScreen();

    expect(await screen.findByText('Medication items')).toBeTruthy();
    expect(await screen.findByDisplayValue('20')).toBeTruthy();

    fireEvent.press(screen.getByText('Dispense medication'));

    await waitFor(() => {
      expect(mockedPharmacyApi.dispense).toHaveBeenCalledWith({
        drug_id: 3,
        patient_id: 14,
        quantity: 20,
        prescription_item_id: 88,
      });
    });

    expect(Alert.alert).toHaveBeenCalledWith('Dispensed', '1 stock batch record created for this medication.');

    rendered.unmount();
    rendered.queryClient.clear();
  });
});
