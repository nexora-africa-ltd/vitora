import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';

import MARScreen from '@/app/inpatient/nursing/mar';
import { inpatientApi } from '@/lib/api/inpatient';
import { nursingApi } from '@/lib/api/nursing';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ admission: '42' }),
}));

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: require('@/constants/theme').lightTheme,
    isDarkMode: false,
  }),
}));

jest.mock('@/lib/api/inpatient', () => ({
  inpatientApi: {
    getAdmission: jest.fn(),
  },
}));

jest.mock('@/lib/api/nursing', () => ({
  nursingApi: {
    listMedicationAdministrations: jest.fn(),
    recordAdministration: jest.fn(),
  },
}));

const mockedInpatientApi = inpatientApi as jest.Mocked<typeof inpatientApi>;
const mockedNursingApi = nursingApi as jest.Mocked<typeof nursingApi>;

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MARScreen />
    </QueryClientProvider>
  );

  return { ...rendered, queryClient };
}

describe('MARScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedInpatientApi.getAdmission.mockResolvedValue({
      id: 42,
      admission_number: 'ADM-20260311-0042',
      patient: 1,
      patient_name: 'Jane Doe',
      patient_mrn: 'MRN-20260311-0001',
      ward: 1,
      ward_name: 'Medical Ward 1',
      bed: 1,
      bed_number: 'B-001',
      admission_status: 'ACTIVE',
      admission_status_display: 'Active',
      admission_date: '2026-03-10',
    } as never);

    mockedNursingApi.listMedicationAdministrations.mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          admission: 42,
          admission_number: 'ADM-20260311-0042',
          patient_name: 'Jane Doe',
          prescription_item: 10,
          drug_name: 'Amoxicillin 500mg',
          scheduled_time: '2026-03-11T08:00:00Z',
          actual_time: null,
          status: 'SCHEDULED',
          status_display: 'Scheduled',
          dose_given: '500mg',
          route: 'Oral',
          administered_by: null,
          administered_by_username: null,
          notes: '',
          is_prn: false,
          is_overdue: true,
          created_at: '2026-03-10T12:00:00Z',
          updated_at: '2026-03-10T12:00:00Z',
        },
        {
          id: 2,
          admission: 42,
          admission_number: 'ADM-20260311-0042',
          patient_name: 'Jane Doe',
          prescription_item: 11,
          drug_name: 'Paracetamol 1g',
          scheduled_time: '2026-03-11T06:00:00Z',
          actual_time: '2026-03-11T06:05:00Z',
          status: 'GIVEN',
          status_display: 'Given',
          dose_given: '1g',
          route: 'Oral',
          administered_by: 5,
          administered_by_username: 'nurse_njeri',
          notes: '',
          is_prn: false,
          is_overdue: false,
          created_at: '2026-03-10T12:00:00Z',
          updated_at: '2026-03-11T06:05:00Z',
        },
      ],
    });
  });

  it('renders the MAR screen with scheduled and recorded entries', async () => {
    const rendered = renderScreen();

    expect(await screen.findByText('Medication Administration')).toBeTruthy();
    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByText('Amoxicillin 500mg')).toBeTruthy();
    expect(screen.getByText('Paracetamol 1g')).toBeTruthy();

    rendered.unmount();
    rendered.queryClient.clear();
  });

  it('shows summary pills for scheduled, recorded, and overdue counts', async () => {
    const rendered = renderScreen();

    expect(await screen.findByText('1 scheduled')).toBeTruthy();
    expect(screen.getByText('1 recorded')).toBeTruthy();
    expect(screen.getByText('1 overdue')).toBeTruthy();

    rendered.unmount();
    rendered.queryClient.clear();
  });

  it('shows administered nurse username for completed doses', async () => {
    const rendered = renderScreen();

    expect(await screen.findByText('By: nurse_njeri')).toBeTruthy();

    rendered.unmount();
    rendered.queryClient.clear();
  });

  it('shows empty state when no MAR entries exist', async () => {
    mockedNursingApi.listMedicationAdministrations.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    const rendered = renderScreen();

    expect(await screen.findByText('No scheduled doses')).toBeTruthy();

    rendered.unmount();
    rendered.queryClient.clear();
  });
});
