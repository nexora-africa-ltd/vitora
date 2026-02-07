/**
 * Tests for imaging calendar/scheduling API methods.
 */

import { imagingApi } from '@/lib/api/imaging';
import { apiClient } from '@/lib/api/client';

// Mock the API client
jest.mock('@/lib/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('imagingApi - Calendar/Scheduling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listResources', () => {
    const mockResourcesResponse = {
      count: 2,
      results: [
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
      ],
    };

    it('fetches resources without modality filter', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: mockResourcesResponse });

      const result = await imagingApi.listResources();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/imaging/resources/', {
        params: undefined,
      });
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('X-Ray Room 1');
    });

    it('fetches resources with modality filter', async () => {
      const filteredResponse = {
        count: 1,
        results: [mockResourcesResponse.results[0]],
      };
      mockApiClient.get.mockResolvedValueOnce({ data: filteredResponse });

      const result = await imagingApi.listResources('XR');

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/imaging/resources/', {
        params: { modality: 'XR' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('getResource', () => {
    const mockResource = {
      id: 1,
      name: 'X-Ray Room 1',
      code: 'XR-ROOM-1',
      resource_type: 'ROOM',
      is_active: true,
      metadata: { department: 'radiology', modalities: ['XR'] },
    };

    it('fetches a single resource by ID', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: mockResource });

      const result = await imagingApi.getResource(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/imaging/resources/1/');
      expect(result.id).toBe(1);
      expect(result.name).toBe('X-Ray Room 1');
    });
  });

  describe('getResourceAvailability', () => {
    const mockAvailabilityResponse = {
      resource_id: 1,
      date: '2026-02-07',
      slots: [
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
            appointment_number: 'APT-2026-001',
            status: 'CONFIRMED',
          },
        },
      ],
    };

    it('fetches resource availability without date', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: mockAvailabilityResponse });

      const result = await imagingApi.getResourceAvailability(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/imaging/resources/1/availability/', {
        params: undefined,
      });
      expect(result).toHaveLength(2);
      expect(result[0].is_available).toBe(true);
    });

    it('fetches resource availability for specific date', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: mockAvailabilityResponse });

      const result = await imagingApi.getResourceAvailability(1, { date: '2026-02-07' });

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/imaging/resources/1/availability/', {
        params: { date: '2026-02-07' },
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('getResourceWeeklyAvailability', () => {
    const mockWeeklyResponse = {
      resource_id: 1,
      days: [
        {
          date: '2026-02-07',
          day_name: 'Saturday',
          slots: [
            { date: '2026-02-07', start_time: '08:00:00', end_time: '08:30:00', is_available: true, appointment: null },
          ],
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
      ],
    };

    it('fetches weekly availability without start_date', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: mockWeeklyResponse });

      const result = await imagingApi.getResourceWeeklyAvailability(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/imaging/resources/1/availability/weekly/', {
        params: undefined,
      });
      expect(result).toHaveLength(2);
      expect(result[0].day_name).toBe('Saturday');
    });

    it('fetches weekly availability with start_date', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: mockWeeklyResponse });

      const result = await imagingApi.getResourceWeeklyAvailability(1, { start_date: '2026-02-07' });

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/imaging/resources/1/availability/weekly/', {
        params: { start_date: '2026-02-07' },
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('checkSlotAvailability', () => {
    const mockCheckResponse = {
      is_available: true,
      resource_id: 1,
      date: '2026-02-07',
      start_time: '08:00',
      end_time: '08:30',
    };

    it('checks slot availability with all required parameters', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: mockCheckResponse });

      const result = await imagingApi.checkSlotAvailability(1, '2026-02-07', '08:00', '08:30');

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/imaging/resources/1/availability/check/', {
        params: {
          date: '2026-02-07',
          start_time: '08:00',
          end_time: '08:30',
        },
      });
      expect(result.is_available).toBe(true);
    });

    it('returns false when slot is not available', async () => {
      const unavailableResponse = { ...mockCheckResponse, is_available: false };
      mockApiClient.get.mockResolvedValueOnce({ data: unavailableResponse });

      const result = await imagingApi.checkSlotAvailability(1, '2026-02-07', '08:30', '09:00');

      expect(result.is_available).toBe(false);
    });
  });

  describe('getCalendar', () => {
    const mockCalendarResponse = {
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
            { date: '2026-02-07', start_time: '08:00:00', end_time: '08:30:00', is_available: true, appointment: null },
          ],
          total_slots: 10,
          available_slots: 8,
          booked_slots: 2,
        },
      ],
    };

    it('fetches calendar without parameters', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: mockCalendarResponse });

      const result = await imagingApi.getCalendar();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/imaging/calendar/', { params: undefined });
      expect(result.date).toBe('2026-02-07');
      expect(result.resources).toHaveLength(1);
    });

    it('fetches calendar with date parameter', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: mockCalendarResponse });

      const result = await imagingApi.getCalendar({ date: '2026-02-07' });

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/imaging/calendar/', {
        params: { date: '2026-02-07' },
      });
      expect(result.resources[0].resource.name).toBe('X-Ray Room 1');
    });

    it('fetches calendar with modality filter', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: mockCalendarResponse });

      const result = await imagingApi.getCalendar({ date: '2026-02-07', modality: 'XR' });

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/imaging/calendar/', {
        params: { date: '2026-02-07', modality: 'XR' },
      });
    });

    it('returns empty resources when none available', async () => {
      const emptyResponse = { date: '2026-02-07', resources: [] };
      mockApiClient.get.mockResolvedValueOnce({ data: emptyResponse });

      const result = await imagingApi.getCalendar({ date: '2026-02-07' });

      expect(result.resources).toHaveLength(0);
    });
  });
});
