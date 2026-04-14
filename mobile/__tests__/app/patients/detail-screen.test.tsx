import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import PatientDetailScreen from '@/app/patients/[id]';
import { lightTheme } from '@/constants/theme';
import { encountersApi } from '@/lib/api/encounters';
import { upsertEncounters } from '@/lib/db';
import { useCheckPatientSHAEligibility, usePatientSHAEligibility } from '@/lib/hooks/use-patient-sha-eligibility';
import { useLocalEncounters } from '@/lib/hooks/use-local-encounters';
import { useLocalPatient } from '@/lib/hooks/use-local-patients';

const mockLightTheme = lightTheme;

const basePatient = {
  id: 14,
  mrn: 'MRN-20260311-0001',
  first_name: 'Jane',
  last_name: 'Doe',
  full_name: 'Jane Doe',
  date_of_birth: '1990-01-01',
  gender: 'F',
  county: 1,
  sub_county: 2,
  county_name: 'Nairobi',
  sub_county_name: 'Westlands',
  ward_name: 'Kitisuru',
  village: null,
  identification_number: '12345678',
  phone_number: '0700000000',
  referral_source: 'self',
  emergency_contact_name: null,
  emergency_contact_phone: null,
  emergency_contact_relationship: null,
  is_sensitive: false,
  consent_given: false,
  created_at: '2026-03-13T08:00:00Z',
  updated_at: '2026-03-13T08:00:00Z',
  local_only: false,
  sync_error: null,
  sync_state: 'synced',
  last_synced_at: '2026-03-13T08:00:00Z',
};

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
  },
  useLocalSearchParams: () => ({ id: '14' }),
}));

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: mockLightTheme,
    isDarkMode: false,
  }),
}));

jest.mock('@/components/patient-qr-code', () => ({
  PatientQRCode: () => null,
}));

jest.mock('@/lib/hooks/use-local-patients', () => ({
  useLocalPatient: jest.fn(),
}));

jest.mock('@/lib/hooks/use-local-encounters', () => ({
  useLocalEncounters: jest.fn(),
}));

jest.mock('@/lib/hooks/use-patient-sha-eligibility', () => ({
  usePatientSHAEligibility: jest.fn(),
  useCheckPatientSHAEligibility: jest.fn(),
}));

jest.mock('@/lib/api/encounters', () => ({
  encountersApi: {
    quickConsultation: jest.fn(),
  },
}));

jest.mock('@/lib/db', () => ({
  upsertEncounters: jest.fn(),
}));

const mockedUseLocalPatient = useLocalPatient as jest.MockedFunction<typeof useLocalPatient>;
const mockedUseLocalEncounters = useLocalEncounters as jest.MockedFunction<typeof useLocalEncounters>;
const mockedUsePatientSHAEligibility = usePatientSHAEligibility as jest.MockedFunction<typeof usePatientSHAEligibility>;
const mockedUseCheckPatientSHAEligibility = useCheckPatientSHAEligibility as jest.MockedFunction<typeof useCheckPatientSHAEligibility>;
const mockedEncountersApi = encountersApi as jest.Mocked<typeof encountersApi>;
const mockedUpsertEncounters = upsertEncounters as jest.MockedFunction<typeof upsertEncounters>;

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PatientDetailScreen />
    </QueryClientProvider>
  );
}

describe('PatientDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

    mockedUseLocalPatient.mockReturnValue({
      isLoading: false,
      patient: {
        ...basePatient,
        sha_coverage_status: 'not_covered',
        sha_ineligibility_reason: 'Membership inactive',
      },
    } as never);

    mockedUseLocalEncounters.mockReturnValue({
      encounters: [],
    } as never);

    mockedUsePatientSHAEligibility.mockReturnValue({
      data: {
        patient_id: 14,
        coverage_status: 'not_covered',
        checked_at: '2026-03-13T08:00:00Z',
        is_eligible: false,
        result: 'INELIGIBLE',
        ineligibility_reason: 'Membership inactive',
      },
    } as never);

    mockedUseCheckPatientSHAEligibility.mockReturnValue({
      isPending: false,
      mutateAsync: jest.fn(),
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blocks consultation when SHA coverage is not active', async () => {
    renderScreen();

    fireEvent.press(screen.getByText('Start consultation'));

    expect(Alert.alert).toHaveBeenCalledWith('Consultation blocked', 'Membership inactive');
    expect(mockedEncountersApi.quickConsultation).not.toHaveBeenCalled();
  });

  it('starts a consultation for covered patients and routes into the encounter', async () => {
    mockedUseLocalPatient.mockReturnValue({
      isLoading: false,
      patient: {
        ...basePatient,
        sha_coverage_status: 'covered',
        sha_ineligibility_reason: null,
      },
    } as never);
    mockedUsePatientSHAEligibility.mockReturnValue({
      data: {
        patient_id: 14,
        coverage_status: 'covered',
        checked_at: '2026-03-13T08:00:00Z',
        is_eligible: true,
        result: 'ELIGIBLE',
      },
    } as never);
    mockedEncountersApi.quickConsultation.mockResolvedValue({
      id: 77,
      patient: 14,
      encounter_type: 'OPD',
      encounter_date: '2026-03-13',
      chief_complaint: '',
      status: 'IN_PROGRESS',
      created_at: '2026-03-13T08:10:00Z',
    } as never);

    renderScreen();

    fireEvent.press(screen.getByText('Start consultation'));

    await waitFor(() => {
      expect(mockedEncountersApi.quickConsultation).toHaveBeenCalledWith({
        patient: 14,
        chief_complaint: '',
        encounter_type: 'OPD',
      });
    });

    expect(mockedUpsertEncounters).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/encounters/77');
  });
});
