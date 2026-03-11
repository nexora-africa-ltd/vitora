import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CDSAlertBanner } from '@/components/cds-alert-banner';
import { cdsApi } from '@/lib/api/cds';

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: require('@/constants/theme').lightTheme,
    isDarkMode: false,
  }),
}));

jest.mock('@/lib/api/cds', () => ({
  cdsApi: {
    getEncounterAlerts: jest.fn(),
    acknowledgeAlert: jest.fn(),
    overrideAlert: jest.fn(),
  },
}));

const mockedCdsApi = cdsApi as jest.Mocked<typeof cdsApi>;

function renderBanner(encounterId = 55) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <CDSAlertBanner encounterId={encounterId} />
    </QueryClientProvider>
  );

  return { ...rendered, queryClient };
}

const MOCK_ALERT = {
  id: 1,
  rule: 10,
  rule_code: 'DRUG_ALLERGY_001',
  rule_name: 'Penicillin allergy contraindication',
  patient: 14,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260311-0001',
  encounter: 55,
  priority: 'CRITICAL',
  status: 'PENDING',
  message: 'Patient has documented penicillin allergy. Amoxicillin is contraindicated.',
  suggestion: 'Consider azithromycin or erythromycin as alternatives.',
  suggested_actions: [],
  category: 'DRUG_ALLERGY',
  is_pending: true,
  is_critical: true,
  created_at: '2026-03-11T10:00:00Z',
};

describe('CDSAlertBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when no alerts exist', async () => {
    mockedCdsApi.getEncounterAlerts.mockResolvedValue([]);
    const { queryByText, queryClient } = renderBanner();
    await waitFor(() => expect(mockedCdsApi.getEncounterAlerts).toHaveBeenCalledWith(55));
    expect(queryByText('Clinical alerts')).toBeNull();
    queryClient.clear();
  });

  it('renders alerts with banner title and critical count', async () => {
    mockedCdsApi.getEncounterAlerts.mockResolvedValue([MOCK_ALERT]);
    const { queryClient } = renderBanner();
    expect(await screen.findByText('Clinical alerts (1)')).toBeTruthy();
    expect(screen.getByText('Penicillin allergy contraindication')).toBeTruthy();
    expect(screen.getByText(/Amoxicillin is contraindicated/i)).toBeTruthy();
    expect(screen.getByText(/azithromycin/i)).toBeTruthy();
    queryClient.clear();
  });

  it('acknowledges an alert when Acknowledge is pressed', async () => {
    mockedCdsApi.getEncounterAlerts.mockResolvedValue([MOCK_ALERT]);
    mockedCdsApi.acknowledgeAlert.mockResolvedValue({ id: 1, status: 'ACKNOWLEDGED' });
    const { queryClient } = renderBanner();

    expect(await screen.findByText('Acknowledge')).toBeTruthy();
    fireEvent.press(screen.getByText('Acknowledge'));

    await waitFor(() => {
      expect(mockedCdsApi.acknowledgeAlert).toHaveBeenCalledWith(1);
    });
    queryClient.clear();
  });

  it('shows override form and submits with reason', async () => {
    mockedCdsApi.getEncounterAlerts.mockResolvedValue([MOCK_ALERT]);
    mockedCdsApi.overrideAlert.mockResolvedValue({ id: 1, status: 'OVERRIDDEN' });
    const { queryClient } = renderBanner();

    expect(await screen.findByText('Override')).toBeTruthy();
    fireEvent.press(screen.getByText('Override'));

    expect(await screen.findByPlaceholderText('Clinical reason for override...')).toBeTruthy();

    fireEvent.changeText(
      screen.getByPlaceholderText('Clinical reason for override...'),
      'Patient tolerated penicillin in the past without reaction.'
    );

    fireEvent.press(screen.getByText('Confirm override'));

    await waitFor(() => {
      expect(mockedCdsApi.overrideAlert).toHaveBeenCalledWith(1, {
        override_reason: 'Patient tolerated penicillin in the past without reaction.',
      });
    });
    queryClient.clear();
  });

  it('renders multiple alerts with separate priorities', async () => {
    const lowAlert = {
      ...MOCK_ALERT,
      id: 2,
      rule_code: 'GUIDELINE_001',
      rule_name: 'Blood glucose monitoring',
      priority: 'LOW',
      message: 'Consider monitoring blood glucose for diabetic patients.',
      suggestion: '',
      category: 'GUIDELINE',
      is_critical: false,
    };

    mockedCdsApi.getEncounterAlerts.mockResolvedValue([MOCK_ALERT, lowAlert]);
    const { queryClient } = renderBanner();

    expect(await screen.findByText('Clinical alerts (2)')).toBeTruthy();
    expect(screen.getByText('Penicillin allergy contraindication')).toBeTruthy();
    expect(screen.getByText('Blood glucose monitoring')).toBeTruthy();
    queryClient.clear();
  });
});
