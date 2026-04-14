import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import NewLaboratoryOrderScreen from '@/app/laboratory/new';
import { encountersApi } from '@/lib/api/encounters';
import { laboratoryApi } from '@/lib/api/laboratory';
import { patientsApi } from '@/lib/api/patients';

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
  },
}));

jest.mock('@/lib/api/patients', () => ({
  patientsApi: {
    list: jest.fn(),
  },
}));

jest.mock('@/lib/api/laboratory', () => ({
  laboratoryApi: {
    listTests: jest.fn(),
    createOrder: jest.fn(),
  },
}));

const mockedEncountersApi = encountersApi as jest.Mocked<typeof encountersApi>;
const mockedPatientsApi = patientsApi as jest.Mocked<typeof patientsApi>;
const mockedLaboratoryApi = laboratoryApi as jest.Mocked<typeof laboratoryApi>;

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <NewLaboratoryOrderScreen />
    </QueryClientProvider>
  );

  return { ...rendered, queryClient };
}

describe('NewLaboratoryOrderScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { encounterId: '55', patientId: '14' };
    mockedEncountersApi.get.mockResolvedValue({
      id: 55,
      patient: 14,
      patient_name: 'Jane Doe',
      patient_mrn: 'MRN-20260311-0001',
    } as never);
    mockedPatientsApi.list.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    mockedLaboratoryApi.listTests.mockResolvedValue([
      {
        id: 2,
        code: 'FBC',
        name: 'Full Blood Count',
        short_name: 'FBC',
        category: 'HEMATOLOGY',
        specimen_type: 'BLOOD',
        cost: 450,
        sha_claimable: true,
        available_in_house: true,
        is_active: true,
      },
    ]);
    mockedLaboratoryApi.createOrder.mockResolvedValue({
      id: 9,
      order_number: 'LAB-20260311-0009',
      patient: 14,
      encounter: 55,
      order_type: 'IN_HOUSE',
      priority: 'ROUTINE',
      clinical_notes: 'Fever and cough',
      status: 'DRAFT',
      specimen_collected: false,
      total_cost: 450,
      items: [],
      ordered_at: '2026-03-11T10:00:00Z',
      created_at: '2026-03-11T10:00:00Z',
      updated_at: '2026-03-11T10:00:00Z',
    } as never);
  });

  it('creates an encounter-linked lab order with selected tests', async () => {
    const rendered = renderScreen();

    expect(await screen.findByText('Find tests')).toBeTruthy();

    fireEvent.press(screen.getByText('Full Blood Count'));
    fireEvent.changeText(screen.getByPlaceholderText('Reason for ordering, symptoms, relevant findings'), 'Fever and cough');
    fireEvent.press(screen.getByText('Create lab order'));

    await waitFor(() => {
      expect(mockedLaboratoryApi.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          patient: 14,
          encounter: 55,
          items: [{ test_code: 'FBC', special_instructions: undefined }],
        })
      );
    });

    expect(mockReplace).toHaveBeenCalledWith('/laboratory/LAB-20260311-0009');

    rendered.unmount();
    rendered.queryClient.clear();
  });
});
