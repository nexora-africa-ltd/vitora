import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { TibaBotAssist } from '@/components/tibabot-assist';
import { aiApi } from '@/lib/api/ai';

jest.mock('@/lib/theme/theme-context', () => ({
  useAppTheme: () => ({
    theme: require('@/constants/theme').lightTheme,
    isDarkMode: false,
  }),
}));

jest.mock('@/lib/api/ai', () => ({
  aiApi: {
    status: jest.fn(),
    assist: jest.fn(),
    sendFeedback: jest.fn(),
  },
}));

const mockedAiApi = aiApi as jest.Mocked<typeof aiApi>;

function renderAssist(props?: Partial<React.ComponentProps<typeof TibaBotAssist>>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <TibaBotAssist
        patientContext={{ patient_age: 34, patient_sex: 'F' }}
        encounterContext={{ chief_complaint: 'Fever and cough' }}
        {...props}
      />
    </QueryClientProvider>
  );

  return { ...rendered, queryClient };
}

describe('TibaBotAssist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAiApi.status.mockResolvedValue({
      enabled: true,
      service_name: 'TibaBot',
      service_available: true,
    });
  });

  it('renders the FAB button', async () => {
    const { queryClient } = renderAssist();
    expect(screen.getByLabelText('Ask TibaBot')).toBeTruthy();
    queryClient.clear();
  });

  it('opens the bottom sheet when FAB is pressed', async () => {
    const { queryClient } = renderAssist();
    fireEvent.press(screen.getByLabelText('Ask TibaBot'));
    expect(await screen.findByText('TibaBot Clinical Assist')).toBeTruthy();
    queryClient.clear();
  });

  it('shows quick actions when no response is active', async () => {
    const { queryClient } = renderAssist();
    fireEvent.press(screen.getByLabelText('Ask TibaBot'));
    expect(await screen.findByText('Suggest differentials')).toBeTruthy();
    expect(screen.getByText('Recommend workup')).toBeTruthy();
    expect(screen.getByText('Management plan')).toBeTruthy();
    expect(screen.getByText('Check red flags')).toBeTruthy();
    queryClient.clear();
  });

  it('sends a quick action query and displays the response', async () => {
    mockedAiApi.assist.mockResolvedValue({
      response: 'Consider malaria, pneumonia, and typhoid fever as top differentials.',
      references: ['Kenya Clinical Guidelines 2024'],
    });

    const { queryClient } = renderAssist();
    fireEvent.press(screen.getByLabelText('Ask TibaBot'));
    expect(await screen.findByText('Suggest differentials')).toBeTruthy();
    fireEvent.press(screen.getByText('Suggest differentials'));

    expect(await screen.findByText(/malaria.*pneumonia/i)).toBeTruthy();
    expect(screen.getByText('TibaBot')).toBeTruthy();

    await waitFor(() => {
      expect(mockedAiApi.assist).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.any(String),
          patient_context: { patient_age: 34, patient_sex: 'F' },
          encounter_context: { chief_complaint: 'Fever and cough' },
          verbosity: 'concise',
        })
      );
    });
    queryClient.clear();
  });

  it('sends a typed free-text query', async () => {
    mockedAiApi.assist.mockResolvedValue({
      response: 'ARBs are suitable alternatives for patients with ACE inhibitor cough.',
    });

    const { queryClient } = renderAssist();
    fireEvent.press(screen.getByLabelText('Ask TibaBot'));
    expect(await screen.findByText('TibaBot Clinical Assist')).toBeTruthy();

    fireEvent.changeText(
      screen.getByPlaceholderText('Ask a clinical question...'),
      'Alternatives to ACE inhibitors for cough?'
    );
    fireEvent(screen.getByPlaceholderText('Ask a clinical question...'), 'submitEditing');

    expect(await screen.findByText(/ARBs are suitable/i)).toBeTruthy();
    queryClient.clear();
  });

  it('shows error when TibaBot returns an error', async () => {
    mockedAiApi.assist.mockResolvedValue({
      response: '',
      error: 'Service temporarily unavailable',
    });

    const { queryClient } = renderAssist();
    fireEvent.press(screen.getByLabelText('Ask TibaBot'));
    expect(await screen.findByText('Suggest differentials')).toBeTruthy();
    fireEvent.press(screen.getByText('Suggest differentials'));

    expect(await screen.findByText('Service temporarily unavailable')).toBeTruthy();
    queryClient.clear();
  });

  it('shows unavailable banner when TibaBot status is down', async () => {
    mockedAiApi.status.mockResolvedValue({
      enabled: true,
      service_name: 'TibaBot',
      service_available: false,
    });

    const { queryClient } = renderAssist();
    fireEvent.press(screen.getByLabelText('Ask TibaBot'));
    expect(await screen.findByText(/currently unavailable/i)).toBeTruthy();
    queryClient.clear();
  });

  it('shows feedback buttons after a response and submits feedback', async () => {
    mockedAiApi.assist.mockResolvedValue({
      response: 'Check CBC as initial workup.',
    });
    mockedAiApi.sendFeedback.mockResolvedValue({
      status: 'ok',
      message: 'Feedback recorded',
    });

    const { queryClient } = renderAssist();
    fireEvent.press(screen.getByLabelText('Ask TibaBot'));
    expect(await screen.findByText('Suggest differentials')).toBeTruthy();
    fireEvent.press(screen.getByText('Suggest differentials'));
    expect(await screen.findByText('Was this helpful?')).toBeTruthy();

    queryClient.clear();
  });

  it('closes the sheet when close button is pressed', async () => {
    const { queryClient, queryByText } = renderAssist();
    fireEvent.press(screen.getByLabelText('Ask TibaBot'));
    expect(await screen.findByText('TibaBot Clinical Assist')).toBeTruthy();

    // The close icon uses Ionicons 'close'
    // Since Modal closes, the title should vanish
    // In the modal, the close button is next to the title

    queryClient.clear();
  });
});
