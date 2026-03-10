import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ICD10Picker } from './icd10-picker';
import { encountersApi } from '@/lib/api/encounters';

jest.mock('@/lib/api/encounters', () => ({
  encountersApi: {
    searchICD10: jest.fn(),
  },
}));

const mockedEncountersApi = encountersApi as jest.Mocked<typeof encountersApi>;

describe('ICD10Picker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows ICD-10 search results and returns the selected diagnosis', async () => {
    mockedEncountersApi.searchICD10.mockResolvedValueOnce([
      {
        id: 1,
        code: 'B50.9',
        short_description: 'Malaria',
        description: 'Malaria, unspecified',
        long_description: 'Malaria, unspecified',
        category: 'B50',
        chapter: 'Certain infectious diseases',
        is_billable: true,
        is_active: true,
      },
    ]);

    const onSelect = jest.fn();
    const onChangeText = jest.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });

    const rendered = render(
      <QueryClientProvider client={queryClient}>
        <ICD10Picker value="malaria" onChangeText={onChangeText} onSelect={onSelect} debounceMs={0} />
      </QueryClientProvider>
    );

    const input = screen.getByPlaceholderText('Search malaria, pneumonia, hypertension...');
    fireEvent(input, 'focus');

    await waitFor(() => {
      expect(mockedEncountersApi.searchICD10).toHaveBeenCalledWith('malaria');
    });

    const result = await screen.findByText('Malaria, unspecified');
    fireEvent.press(result);

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ code: 'B50.9' }));

    rendered.unmount();
    queryClient.clear();
  });
});