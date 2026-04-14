import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSmartSuggestions } from '@/lib/hooks/use-smart-suggestions';
import { aiApi } from '@/lib/api/ai';

jest.mock('@/lib/api/ai', () => ({
  aiApi: {
    autopopulate: jest.fn(),
  },
}));

jest.mock('@/lib/hooks/use-feature-flags', () => ({
  useFeatureFlag: jest.fn(() => true),
}));

jest.mock('@/lib/hooks/use-ai', () => ({
  useAIEnabled: jest.fn(() => true),
}));

const mockAiApi = aiApi as jest.Mocked<typeof aiApi>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  wrapper.displayName = 'SmartSuggestionsWrapper';
  return wrapper;
}

describe('useSmartSuggestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('merges CDS suggestions and supports accept/reject workflows', () => {
    const { result } = renderHook(
      () =>
        useSmartSuggestions({
          cdsActions: [
            {
              target_field: 'diagnosis',
              value: 'Malaria',
              confidence: 0.9,
              reason: 'Pattern match',
            } as never,
          ],
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.isAvailable).toBe(true);
    expect(result.current.pendingSuggestions).toHaveLength(1);
    expect(result.current.getFieldSuggestions('diagnosis')).toHaveLength(1);

    let accepted: unknown;
    act(() => {
      accepted = result.current.accept('cds-diagnosis-0');
    });
    expect(accepted).toBeUndefined();
    expect(result.current.pendingSuggestions).toHaveLength(1);

    act(() => {
      result.current.rejectAll();
    });
    expect(result.current.suggestions[0]?.status).toBe('pending');
  });

  it('fetches AI suggestions and supports bulk accept/reject', async () => {
    mockAiApi.autopopulate.mockResolvedValueOnce({
      error: null,
      suggested_fields: [
        { field_name: 'notes', value: 'Consider admission', confidence: 0.8, reason: 'AI reason', source: 'ai' },
        { field_name: 'plan', value: 'Order CBC', confidence: 0.7, reason: 'AI reason 2', source: 'history' },
      ],
    } as never);

    const { result } = renderHook(() => useSmartSuggestions(), { wrapper: createWrapper() });

    act(() => {
      result.current.fetchSuggestions({ encounter_id: 1 } as never);
    });

    await waitFor(() => expect(result.current.suggestions).toHaveLength(2));
    expect(result.current.pendingSuggestions).toHaveLength(2);

    let acceptedAll: Array<{ field_name: string; value: unknown }> = [];
    act(() => {
      acceptedAll = result.current.acceptAll();
    });
    expect(acceptedAll).toEqual([
      { field_name: 'notes', value: 'Consider admission' },
      { field_name: 'plan', value: 'Order CBC' },
    ]);

    act(() => {
      result.current.reject('ai-notes-0');
    });
    expect(result.current.suggestions.find((s) => s.id === 'ai-notes-0')?.status).toBe('rejected');
  });

  it('reports AI failures as a user-facing error', async () => {
    mockAiApi.autopopulate.mockRejectedValueOnce(new Error('unavailable'));
    const { result } = renderHook(() => useSmartSuggestions(), { wrapper: createWrapper() });

    act(() => {
      result.current.fetchSuggestions({ encounter_id: 2 } as never);
    });

    await waitFor(() => expect(result.current.error).toBe('AI suggestions temporarily unavailable.'));
  });
});
