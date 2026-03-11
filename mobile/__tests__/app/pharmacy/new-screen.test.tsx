import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import NewPrescriptionScreen from '@/app/pharmacy/new';
import { encountersApi } from '@/lib/api/encounters';
import { patientsApi } from '@/lib/api/patients';
import { pharmacyApi } from '@/lib/api/pharmacy';

const mockReplace = jest.fn();
let mockParams: Record<string, string> = { encounterId: '55', patientId: '14' };

jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    push: jest.fn(),
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: require('@/constants/theme').lightTheme,
    isDarkMode: false,
  }),
}));

jest.mock('@/lib/api/encounters', () => ({
  encountersApi: {
    get: jest.fn(),
    getTreatmentPlan: jest.fn(),
  },
}));

jest.mock('@/lib/api/patients', () => ({
  patientsApi: {
    list: jest.fn(),
  },
}));

jest.mock('@/lib/api/pharmacy', () => ({
  pharmacyApi: {
    searchDrugs: jest.fn(),
    createPrescription: jest.fn(),
  },
}));

const mockedEncountersApi = encountersApi as jest.Mocked<typeof encountersApi>;
const mockedPatientsApi = patientsApi as jest.Mocked<typeof patientsApi>;
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
      <NewPrescriptionScreen />
    </QueryClientProvider>
  );

  return { ...rendered, queryClient };
}

describe('NewPrescriptionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { encounterId: '55', patientId: '14' };
    mockedEncountersApi.get.mockResolvedValue({
      id: 55,
      patient: 14,
      patient_name: 'Jane Doe',
      patient_mrn: 'MRN-20260311-0001',
    } as never);
    mockedEncountersApi.getTreatmentPlan.mockResolvedValue({
      id: 12,
      encounter: 55,
      clinical_notes: 'Treat symptomatic malaria.',
      medications_json: null,
      procedures_json: null,
      follow_up_instructions: '',
      follow_up_date: null,
      diet_recommendations: '',
      activity_restrictions: '',
      referral_needed: false,
      referral_specialty: '',
      referral_notes: '',
      status: 'ACTIVE',
      medications: [
        {
          id: 1,
          treatment_plan: 12,
          name: 'Paracetamol',
          dosage: '500mg',
          frequency: 'TDS',
          duration: '5 days',
          route: 'oral',
          quantity: '15',
          instructions: 'Take after meals',
        },
      ],
      created_at: '2026-03-11T09:00:00Z',
      updated_at: '2026-03-11T09:00:00Z',
    } as never);
    mockedPatientsApi.list.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    mockedPharmacyApi.searchDrugs.mockResolvedValue([
      {
        id: 3,
        code: 'PCM500',
        generic_name: 'Paracetamol',
        brand_names: 'Panadol',
        strength: '500mg',
        form: 'TABLET',
        category: 'ANALGESIC',
        categories: ['ANALGESIC'],
        unit: 'tablet',
        schedule: 'P',
        is_essential: true,
        keml_code: null,
        nhif_code: null,
        requires_prescription: false,
        is_controlled: false,
        is_narcotic: false,
        default_reorder_level: 100,
        default_reorder_quantity: 200,
        shelf_life_months: 24,
        storage_requirements: '',
        reference_price: 5,
        is_active: true,
        display_name: 'Paracetamol 500mg TABLET',
        current_stock: 120,
        created_at: '2026-03-11T09:00:00Z',
        updated_at: '2026-03-11T09:00:00Z',
      },
    ]);
    mockedPharmacyApi.createPrescription.mockResolvedValue({
      id: 99,
      prescription_number: 'RX-20260311-0099',
      encounter: 55,
      patient: 14,
      status: 'PENDING',
      is_valid: true,
      is_valid_prescription: true,
      is_fully_dispensed: false,
      is_fully_dispensed_status: false,
      items: [],
      created_at: '2026-03-11T10:00:00Z',
      updated_at: '2026-03-11T10:00:00Z',
    } as never);
  });

  it('auto-populates draft items from treatment-plan medications and creates the prescription', async () => {
    const rendered = renderScreen();

    expect(await screen.findByText('Treatment plan context')).toBeTruthy();

    await waitFor(() => {
      expect(mockedPharmacyApi.searchDrugs).toHaveBeenCalledWith('Paracetamol');
    });

    expect(await screen.findByText('1 medication draft auto-populated from the treatment plan.')).toBeTruthy();
    expect(screen.getByDisplayValue('500mg')).toBeTruthy();
    expect(screen.getByDisplayValue('TDS')).toBeTruthy();
    expect(screen.getByDisplayValue('5 days')).toBeTruthy();

    fireEvent.press(screen.getByText('Create prescription'));

    await waitFor(() => {
      expect(mockedPharmacyApi.createPrescription).toHaveBeenCalledWith(
        expect.objectContaining({
          encounter: 55,
          patient: 14,
          items: [
            expect.objectContaining({
              drug: 3,
              quantity: 15,
              dosage: '500mg',
              frequency: 'TDS',
              duration: '5 days',
              route: 'oral',
              instructions: 'Take after meals',
            }),
          ],
        })
      );
    });

    expect(mockReplace).toHaveBeenCalledWith('/pharmacy/99');

    rendered.unmount();
    rendered.queryClient.clear();
  });
});