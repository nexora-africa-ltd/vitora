/**
 * Tests for imaging calendar/scheduling hooks.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useImagingResources,
  useImagingResource,
  useResourceAvailability,
  useResourceWeeklyAvailability,
  useImagingCalendar,
  useCheckSlotAvailability,
} from '@/lib/hooks/use-imaging';
import { imagingApi } from '@/lib/api/imaging';

// Mock the imaging API
jest.mock('@/lib/api/imaging', () => ({
  imagingApi: {
    listResources: jest.fn(),
    getResource: jest.fn(),
    getResourceAvailability: jest.fn(),
    getResourceWeeklyAvailability: jest.fn(),
    getCalendar: jest.fn(),
    checkSlotAvailability: jest.fn(),
  },
}));

const mockImagingApi = imagingApi as jest.Mocked<typeof imagingApi>;

// Helper to create wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });

  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
};

describe('Imaging Calendar Hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useImagingResources', () => {
    const mockResources = [
      {
        id: 1,
        name: 'X-Ray Room 1',
        code: 'XR-ROOM-1',
        resource_type: 'ROOM',
        is_active: true,
        metadata: { department: 'radiology', modalities: ['XR'] },
      },
      {
        id: 2,
        name: 'CT Scanner',
        code: 'CT-SCANNER-1',
        resource_type: 'EQUIPMENT',
        is_active: true,
        metadata: { department: 'radiology', modalities: ['CT'] },
      },
    ];

    it('fetches imaging resources', async () => {
      mockImagingApi.listResources.mockResolvedValueOnce(mockResources);

      const { result } = renderHook(() => useImagingResources(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data?.[0].name).toBe('X-Ray Room 1');
    });

    it('can filter by modality', async () => {
      const filteredResources = [mockResources[0]];
      mockImagingApi.listResources.mockResolvedValueOnce(filteredResources);

      const { result } = renderHook(() => useImagingResources('XR'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockImagingApi.listResources).toHaveBeenCalledWith('XR');
      expect(result.current.data).toHaveLength(1);
    });

    it('handles API errors', async () => {
      mockImagingApi.listResources.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useImagingResources(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
    });
  });

  describe('useImagingResource', () => {
    const mockResource = {
      id: 1,
      name: 'X-Ray Room 1',
      code: 'XR-ROOM-1',
      resource_type: 'ROOM',
      is_active: true,
      metadata: { department: 'radiology', modalities: ['XR'] },
    };

    it('fetches a single resource by ID', async () => {
      mockImagingApi.getResource.mockResolvedValueOnce(mockResource);

      const { result } = renderHook(() => useImagingResource(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.id).toBe(1);
      expect(result.current.data?.name).toBe('X-Ray Room 1');
    });

    it('does not fetch when resourceId is 0', async () => {
      const { result } = renderHook(() => useImagingResource(0), {
        wrapper: createWrapper(),
      });

      // Query should be disabled
      expect(result.current.isFetching).toBe(false);
      expect(mockImagingApi.getResource).not.toHaveBeenCalled();
    });
  });

  describe('useResourceAvailability', () => {
    const mockSlots = [
      {
        date: '2026-02-07',
        start_time: '08:00:00',
        end_time: '08:30:00',
        is_available: true,
        appointment: null,
      },
      {
        date: '2026-02-07',
        start_time: '08:30:00',
        end_time: '09:00:00',
        is_available: false,
        appointment: {
          id: 1,
          patient_name: 'John Doe',
          appointment_number: 'APT-001',
          status: 'CONFIRMED',
        },
      },
    ];

    it('fetches resource availability', async () => {
      mockImagingApi.getResourceAvailability.mockResolvedValueOnce(mockSlots);

      const { result } = renderHook(
        () => useResourceAvailability(1, { date: '2026-02-07' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data?.[0].is_available).toBe(true);
    });

    it('does not fetch when resourceId is 0', async () => {
      const { result } = renderHook(
        () => useResourceAvailability(0),
        { wrapper: createWrapper() }
      );

      expect(result.current.isFetching).toBe(false);
      expect(mockImagingApi.getResourceAvailability).not.toHaveBeenCalled();
    });
  });

  describe('useResourceWeeklyAvailability', () => {
    const mockWeeklyData = [
      {
        date: '2026-02-07',
        day_name: 'Saturday',
        slots: [],
        total_slots: 10,
        available_slots: 8,
      },
      {
        date: '2026-02-08',
        day_name: 'Sunday',
        slots: [],
        total_slots: 0,
        available_slots: 0,
      },
    ];

    it('fetches weekly availability', async () => {
      mockImagingApi.getResourceWeeklyAvailability.mockResolvedValueOnce(mockWeeklyData);

      const { result } = renderHook(
        () => useResourceWeeklyAvailability(1),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data?.[0].day_name).toBe('Saturday');
    });
  });

  describe('useImagingCalendar', () => {
    const mockCalendarData = {
      date: '2026-02-07',
      resources: [
        {
          resource: {
            id: 1,
            name: 'X-Ray Room 1',
            code: 'XR-ROOM-1',
            resource_type: 'ROOM',
            is_active: true,
            metadata: { department: 'radiology', modalities: ['XR'] },
          },
          slots: [
            {
              date: '2026-02-07',
              start_time: '08:00:00',
              end_time: '08:30:00',
              is_available: true,
              appointment: null,
            },
          ],
          total_slots: 10,
          available_slots: 8,
          booked_slots: 2,
        },
      ],
    };

    it('fetches imaging calendar', async () => {
      mockImagingApi.getCalendar.mockResolvedValueOnce(mockCalendarData);

      const { result } = renderHook(
        () => useImagingCalendar({ date: '2026-02-07' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.date).toBe('2026-02-07');
      expect(result.current.data?.resources).toHaveLength(1);
    });

    it('accepts modality parameter', async () => {
      mockImagingApi.getCalendar.mockResolvedValueOnce(mockCalendarData);

      const { result } = renderHook(
        () => useImagingCalendar({ date: '2026-02-07', modality: 'XR' }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockImagingApi.getCalendar).toHaveBeenCalledWith({
        date: '2026-02-07',
        modality: 'XR',
      });
    });

    it('handles errors gracefully', async () => {
      mockImagingApi.getCalendar.mockRejectedValueOnce(new Error('Server error'));

      const { result } = renderHook(
        () => useImagingCalendar(),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Server error');
    });
  });

  describe('useCheckSlotAvailability', () => {
    const mockCheckResponse = {
      is_available: true,
      resource_id: 1,
      date: '2026-02-07',
      start_time: '08:00',
      end_time: '08:30',
    };

    it('checks slot availability via mutation', async () => {
      mockImagingApi.checkSlotAvailability.mockResolvedValueOnce(mockCheckResponse);

      const { result } = renderHook(() => useCheckSlotAvailability(), {
        wrapper: createWrapper(),
      });

      // Trigger the mutation
      result.current.mutate({
        resourceId: 1,
        date: '2026-02-07',
        startTime: '08:00',
        endTime: '08:30',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.is_available).toBe(true);
      expect(mockImagingApi.checkSlotAvailability).toHaveBeenCalledWith(
        1,
        '2026-02-07',
        '08:00',
        '08:30'
      );
    });

    it('handles unavailable slots', async () => {
      const unavailableResponse = { ...mockCheckResponse, is_available: false };
      mockImagingApi.checkSlotAvailability.mockResolvedValueOnce(unavailableResponse);

      const { result } = renderHook(() => useCheckSlotAvailability(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        resourceId: 1,
        date: '2026-02-07',
        startTime: '08:30',
        endTime: '09:00',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.is_available).toBe(false);
    });
  });
});
