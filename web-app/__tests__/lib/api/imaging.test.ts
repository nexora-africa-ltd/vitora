/**
 * Tests for imaging API client.
 * Phase B: Frontend Order Management
 */

import { imagingApi } from '@/lib/api/imaging';

// Mock the API client
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/lib/api/client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

// Mock parseResponse to pass through data
jest.mock('@/lib/schemas/validation', () => ({
  parseResponse: jest.fn((schema: unknown, data: unknown) => data),
}));

describe('imagingApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listProcedures', () => {
    it('calls GET /api/imaging/procedures/', async () => {
      const mockResponse = {
        data: {
          count: 1,
          next: null,
          previous: null,
          results: [
            {
              id: 1,
              code: 'XR-CHEST',
              name: 'Chest X-Ray',
              modality: 'XR',
              body_region: 'CHEST',
              cost: 1500,
              sha_claimable: true,
              available_in_house: true,
              is_active: true,
            },
          ],
        },
      };
      mockGet.mockResolvedValue(mockResponse);

      const result = await imagingApi.listProcedures({ page: 1 });

      expect(mockGet).toHaveBeenCalledWith('/api/imaging/procedures/', {
        params: { page: 1 },
      });
      expect(result.results).toHaveLength(1);
    });
  });

  describe('getProcedure', () => {
    it('calls GET /api/imaging/procedures/{code}/', async () => {
      const mockResponse = {
        data: {
          id: 1,
          code: 'XR-CHEST',
          name: 'Chest X-Ray',
          modality: 'XR',
          body_region: 'CHEST',
          cost: 1500,
          sha_claimable: true,
          available_in_house: true,
          is_active: true,
        },
      };
      mockGet.mockResolvedValue(mockResponse);

      const result = await imagingApi.getProcedure('XR-CHEST');

      expect(mockGet).toHaveBeenCalledWith('/api/imaging/procedures/XR-CHEST/');
      expect(result.code).toBe('XR-CHEST');
    });
  });

  describe('searchProcedures', () => {
    it('calls GET with search query', async () => {
      const mockResponse = {
        data: {
          results: [
            {
              id: 1,
              code: 'XR-CHEST',
              name: 'Chest X-Ray',
              modality: 'XR',
              body_region: 'CHEST',
              cost: 1500,
              sha_claimable: true,
              available_in_house: true,
              is_active: true,
            },
          ],
        },
      };
      mockGet.mockResolvedValue(mockResponse);

      await imagingApi.searchProcedures('chest');

      expect(mockGet).toHaveBeenCalledWith('/api/imaging/procedures/', {
        params: { search: 'chest' },
      });
    });
  });

  describe('listOrders', () => {
    it('calls GET /api/imaging/orders/', async () => {
      const mockResponse = {
        data: {
          count: 0,
          next: null,
          previous: null,
          results: [],
        },
      };
      mockGet.mockResolvedValue(mockResponse);

      await imagingApi.listOrders({ status: 'ORDERED' });

      expect(mockGet).toHaveBeenCalledWith('/api/imaging/orders/', {
        params: { status: 'ORDERED' },
      });
    });
  });

  describe('getOrder', () => {
    it('calls GET /api/imaging/orders/{orderNumber}/', async () => {
      const mockResponse = {
        data: {
          id: 1,
          order_number: 'RAD-20250101-0001',
          patient: 123,
          encounter: 456,
          ordered_by: 789,
          priority: 'ROUTINE',
          clinical_indication: 'Test',
          status: 'ORDERED',
          total_cost: 1500,
          is_paid: false,
          items: [],
          ordered_at: '2025-01-01T10:00:00Z',
        },
      };
      mockGet.mockResolvedValue(mockResponse);

      const result = await imagingApi.getOrder('RAD-20250101-0001');

      expect(mockGet).toHaveBeenCalledWith('/api/imaging/orders/RAD-20250101-0001/');
      expect(result.order_number).toBe('RAD-20250101-0001');
    });
  });

  describe('getPatientOrders', () => {
    it('filters by patient ID', async () => {
      const mockResponse = {
        data: {
          results: [],
        },
      };
      mockGet.mockResolvedValue(mockResponse);

      await imagingApi.getPatientOrders(123);

      expect(mockGet).toHaveBeenCalledWith('/api/imaging/orders/', {
        params: { patient: 123 },
      });
    });
  });

  describe('getEncounterOrders', () => {
    it('filters by encounter ID', async () => {
      const mockResponse = {
        data: {
          results: [],
        },
      };
      mockGet.mockResolvedValue(mockResponse);

      await imagingApi.getEncounterOrders(456);

      expect(mockGet).toHaveBeenCalledWith('/api/imaging/orders/', {
        params: { encounter: 456 },
      });
    });
  });

  describe('createOrder', () => {
    it('calls POST /api/imaging/orders/', async () => {
      const orderData = {
        patient: 123,
        encounter: 456,
        priority: 'URGENT' as const,
        clinical_indication: 'Suspected fracture',
        items: [
          {
            procedure_code: 'XR-WRIST',
            laterality: 'LEFT' as const,
          },
        ],
      };
      const mockResponse = {
        data: {
          id: 1,
          order_number: 'RAD-20250101-0001',
          ...orderData,
          status: 'DRAFT',
          total_cost: 1500,
          is_paid: false,
          ordered_at: '2025-01-01T10:00:00Z',
        },
      };
      mockPost.mockResolvedValue(mockResponse);

      await imagingApi.createOrder(orderData);

      expect(mockPost).toHaveBeenCalledWith('/api/imaging/orders/', orderData);
    });
  });

  describe('updateOrder', () => {
    it('calls PATCH /api/imaging/orders/{orderNumber}/', async () => {
      const mockResponse = {
        data: {
          id: 1,
          order_number: 'RAD-20250101-0001',
          priority: 'STAT',
        },
      };
      mockPatch.mockResolvedValue(mockResponse);

      await imagingApi.updateOrder('RAD-20250101-0001', { priority: 'STAT' });

      expect(mockPatch).toHaveBeenCalledWith('/api/imaging/orders/RAD-20250101-0001/', {
        priority: 'STAT',
      });
    });
  });

  describe('deleteOrder', () => {
    it('calls DELETE /api/imaging/orders/{orderNumber}/', async () => {
      mockDelete.mockResolvedValue({});

      await imagingApi.deleteOrder('RAD-20250101-0001');

      expect(mockDelete).toHaveBeenCalledWith('/api/imaging/orders/RAD-20250101-0001/');
    });
  });

  describe('workflow actions', () => {
    it('submitOrder calls POST /submit/', async () => {
      const mockResponse = { data: { status: 'ORDERED' } };
      mockPost.mockResolvedValue(mockResponse);

      await imagingApi.submitOrder('RAD-20250101-0001');

      expect(mockPost).toHaveBeenCalledWith('/api/imaging/orders/RAD-20250101-0001/submit/');
    });

    it('scheduleOrder calls POST /schedule/', async () => {
      const mockResponse = { data: { status: 'SCHEDULED' } };
      mockPost.mockResolvedValue(mockResponse);

      await imagingApi.scheduleOrder('RAD-20250101-0001', {
        scheduled_datetime: '2025-01-02T10:00:00Z',
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/api/imaging/orders/RAD-20250101-0001/schedule/',
        { scheduled_datetime: '2025-01-02T10:00:00Z' }
      );
    });

    it('startOrder calls POST /start/', async () => {
      const mockResponse = { data: { status: 'IN_PROGRESS' } };
      mockPost.mockResolvedValue(mockResponse);

      await imagingApi.startOrder('RAD-20250101-0001');

      expect(mockPost).toHaveBeenCalledWith('/api/imaging/orders/RAD-20250101-0001/start/');
    });

    it('completeOrder calls POST /complete/', async () => {
      const mockResponse = { data: { status: 'COMPLETED' } };
      mockPost.mockResolvedValue(mockResponse);

      await imagingApi.completeOrder('RAD-20250101-0001');

      expect(mockPost).toHaveBeenCalledWith('/api/imaging/orders/RAD-20250101-0001/complete/');
    });

    it('cancelOrder calls POST /cancel/', async () => {
      const mockResponse = { data: { status: 'CANCELLED' } };
      mockPost.mockResolvedValue(mockResponse);

      await imagingApi.cancelOrder('RAD-20250101-0001', { reason: 'Patient declined' });

      expect(mockPost).toHaveBeenCalledWith('/api/imaging/orders/RAD-20250101-0001/cancel/', {
        reason: 'Patient declined',
      });
    });
  });
});
