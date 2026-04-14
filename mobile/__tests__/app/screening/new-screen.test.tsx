import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TextInput } from 'react-native';

import NewScreeningScreen from '@/app/screening/new';
import { screeningApi } from '@/lib/api/screening';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
  },
  useLocalSearchParams: () => ({ patientId: '14' }),
}));

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: require('@/constants/theme').lightTheme,
    isDarkMode: false,
  }),
}));

jest.mock('@/lib/hooks/use-local-patients', () => ({
  useLocalPatients: () => ({
    isLoading: false,
    patients: [
      {
        id: 14,
        mrn: 'MRN-20260310-0001',
        first_name: 'Jane',
        middle_name: null,
        last_name: 'Doe',
        full_name: 'Jane Doe',
      },
    ],
  }),
  useLocalPatient: () => ({
    patient: {
      id: 14,
      mrn: 'MRN-20260310-0001',
      first_name: 'Jane',
      middle_name: null,
      last_name: 'Doe',
      full_name: 'Jane Doe',
    },
  }),
}));

jest.mock('@/lib/api/screening', () => ({
  screeningApi: {
    createScreening: jest.fn(),
  },
}));

const mockedScreeningApi = screeningApi as jest.Mocked<typeof screeningApi>;

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <NewScreeningScreen />
    </QueryClientProvider>
  );
}

describe('NewScreeningScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedScreeningApi.createScreening.mockResolvedValue({
      id: -1,
      patient: 14,
      patient_name: 'Jane Doe',
      patient_mrn: 'MRN-20260310-0001',
      screening_type: 'MALNUTRITION',
      screening_date: '2026-03-13',
      chu_name: 'Kayole CHU 4',
      territory: 'Village A',
      result_summary: 'MUAC 110 mm',
      notes: '',
      muac_mm: 110,
      edema_present: true,
      fever_present: null,
      cough_duration_days: null,
      household_contact_name: '',
      malaria_rdt_result: null,
      malaria_treatment_referred: null,
      tb_referral_made: null,
      location: null,
      photo: null,
      created_at: '2026-03-13T08:00:00Z',
      updated_at: '2026-03-13T08:00:00Z',
      local_only: true,
      sync_status: 'pending_upload',
      sync_error: null,
    });
  });

  it('saves a malnutrition screening locally', async () => {
    const rendered = renderScreen();

    const textboxes = rendered.UNSAFE_getAllByType(TextInput);

    fireEvent.changeText(textboxes[0], 'Kayole CHU 4');
    fireEvent.changeText(textboxes[1], 'Village A');
    fireEvent.changeText(textboxes[2], '110');
    fireEvent.press(screen.getByText('Save screening offline'));

    await waitFor(() => {
      expect(mockedScreeningApi.createScreening).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/screening');
    });
  });
});
