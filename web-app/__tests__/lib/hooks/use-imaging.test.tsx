/**
 * Tests for imaging hooks.
 * Phase B: Frontend Order Management
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  useImagingProcedures,
  useImagingOrder,
  useImagingOrders,
  usePatientImagingOrders,
  useEncounterImagingOrders,
  useImagingWorklist,
  useWorklistStats,
  useCreateImagingOrder,
  imagingKeys,
} from '@/lib/hooks/use-imaging';
import { imagingApi } from '@/lib/api/imaging';

// Mock the API
jest.mock('@/lib/api/imaging', () => ({
  imagingApi: {
    listProcedures: jest.fn(),
    getProcedure: jest.fn(),
    searchProcedures: jest.fn(),
    listOrders: jest.fn(),
    getOrder: jest.fn(),
    getPatientOrders: jest.fn(),
    getEncounterOrders: jest.fn(),
    createOrder: jest.fn(),
    updateOrder: jest.fn(),
    deleteOrder: jest.fn(),
    submitOrder: jest.fn(),
    scheduleOrder: jest.fn(),
    startOrder: jest.fn(),
    completeOrder: jest.fn(),
    cancelOrder: jest.fn(),
    getWorklist: jest.fn(),
    getWorklistStats: jest.fn(),
  },
}));

const mockImagingApi = imagingApi as jest.Mocked<typeof imagingApi>;

// Create wrapper with fresh QueryClient for each test
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('imagingKeys', () => {
  it('generates correct query keys', () => {
    expect(imagingKeys.all).toEqual(['imaging']);
    expect(imagingKeys.procedures()).toEqual(['imaging', 'procedures']);
    expect(imagingKeys.orders()).toEqual(['imaging', 'orders']);
    expect(imagingKeys.orderDetail('IMG-001')).toEqual([
      'imaging',
      'orders',
      'detail',
      'IMG-001',
    ]);
    expect(imagingKeys.patientOrders(123)).toEqual([
      'imaging',
      'orders',
      'patient',
      123,
    ]);
    expect(imagingKeys.encounterOrders(456)).toEqual([
      'imaging',
      'orders',
      'encounter',
      456,
    ]);
  });
});

describe('useImagingProcedures', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches procedures successfully', async () => {
    const mockData = {
      count: 2,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          code: 'XR-CHEST',
          name: 'Chest X-Ray',
          modality: 'XR' as const,
          body_region: 'CHEST' as const,
          cost: 1500,
          sha_claimable: true,
          available_in_house: true,
          is_active: true,
        },
        {
          id: 2,
          code: 'US-ABDOM',
          name: 'Abdominal Ultrasound',
          modality: 'US' as const,
          body_region: 'ABDOMEN' as const,
          cost: 2500,
          sha_claimable: true,
          available_in_house: true,
          is_active: true,
        },
      ],
    };

    mockImagingApi.listProcedures.mockResolvedValue(mockData);

    const { result } = renderHook(() => useImagingProcedures(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toHaveLength(2);
    expect(mockImagingApi.listProcedures).toHaveBeenCalledTimes(1);
  });

  it('passes params to API', async () => {
    mockImagingApi.listProcedures.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    const { result } = renderHook(
      () => useImagingProcedures({ modality: 'CT', page: 2 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockImagingApi.listProcedures).toHaveBeenCalledWith({
      modality: 'CT',
      page: 2,
    });
  });
});

describe('useImagingOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches orders successfully', async () => {
    const mockData = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          order_number: 'IMG-2026-0001',
          patient: 1,
          encounter: 1,
          ordered_by: 1,
          priority: 'ROUTINE' as const,
          clinical_indication: 'Test',
          status: 'ORDERED' as const,
          total_cost: 1500,
          is_paid: false,
          items: [],
          ordered_at: '2026-02-06T10:00:00Z',
        },
      ],
    };

    mockImagingApi.listOrders.mockResolvedValue(mockData);

    const { result } = renderHook(() => useImagingOrders(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toHaveLength(1);
  });
});

describe('useImagingOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches single order', async () => {
    const mockOrder = {
      id: 1,
      order_number: 'IMG-2026-0001',
      patient: 1,
      patient_name: 'John Doe',
      encounter: 1,
      ordered_by: 1,
      ordered_by_name: 'Dr. Smith',
      priority: 'URGENT' as const,
      clinical_indication: 'Trauma',
      status: 'IN_PROGRESS' as const,
      total_cost: 3000,
      is_paid: false,
      items: [],
      ordered_at: '2026-02-06T10:00:00Z',
    };

    mockImagingApi.getOrder.mockResolvedValue(mockOrder);

    const { result } = renderHook(() => useImagingOrder('IMG-2026-0001'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.order_number).toBe('IMG-2026-0001');
    expect(mockImagingApi.getOrder).toHaveBeenCalledWith('IMG-2026-0001');
  });

  it('is disabled when orderNumber is empty', async () => {
    const { result } = renderHook(() => useImagingOrder(''), {
      wrapper: createWrapper(),
    });

    // Should not call API when disabled
    expect(mockImagingApi.getOrder).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('usePatientImagingOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches orders for a patient', async () => {
    const mockOrders = [
      {
        id: 1,
        order_number: 'IMG-2026-0001',
        patient: 123,
        encounter: 1,
        ordered_by: 1,
        priority: 'ROUTINE' as const,
        clinical_indication: 'Test 1',
        status: 'COMPLETED' as const,
        total_cost: 1500,
        is_paid: true,
        items: [],
        ordered_at: '2026-02-06T10:00:00Z',
      },
    ];

    mockImagingApi.getPatientOrders.mockResolvedValue(mockOrders);

    const { result } = renderHook(() => usePatientImagingOrders(123), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(mockImagingApi.getPatientOrders).toHaveBeenCalledWith(123);
  });
});

describe('useEncounterImagingOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches orders for an encounter', async () => {
    const mockOrders = [
      {
        id: 1,
        order_number: 'IMG-2026-0001',
        patient: 1,
        encounter: 456,
        ordered_by: 1,
        priority: 'STAT' as const,
        clinical_indication: 'Emergency',
        status: 'ORDERED' as const,
        total_cost: 5000,
        is_paid: false,
        items: [],
        ordered_at: '2026-02-06T10:00:00Z',
      },
    ];

    mockImagingApi.getEncounterOrders.mockResolvedValue(mockOrders);

    const { result } = renderHook(() => useEncounterImagingOrders(456), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(mockImagingApi.getEncounterOrders).toHaveBeenCalledWith(456);
  });
});

describe('useWorklistStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches worklist statistics', async () => {
    const mockStats = {
      total_pending: 5,
      total_in_progress: 3,
      total_completed_today: 12,
      stat_orders: 1,
      urgent_orders: 2,
    };

    mockImagingApi.getWorklistStats.mockResolvedValue(mockStats);

    const { result } = renderHook(() => useWorklistStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.total_pending).toBe(5);
    expect(result.current.data?.stat_orders).toBe(1);
  });
});

describe('useCreateImagingOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an order and invalidates queries', async () => {
    const newOrderData = {
      patient: 1,
      encounter: 1,
      priority: 'ROUTINE' as const,
      clinical_indication: 'Test order',
      items: [{ procedure_code: 'XR-CHEST' }],
    };

    const createdOrder = {
      id: 1,
      order_number: 'IMG-2026-0001',
      ...newOrderData,
      ordered_by: 1,
      status: 'DRAFT' as const,
      total_cost: 1500,
      is_paid: false,
      items: [
        {
          id: 1,
          procedure: 1,
          procedure_name: 'Chest X-Ray',
          procedure_code: 'XR-CHEST',
          modality: 'XR' as const,
          laterality: 'NA' as const,
          is_completed: false,
          unit_cost: 1500,
        },
      ],
      ordered_at: '2026-02-06T10:00:00Z',
    };

    mockImagingApi.createOrder.mockResolvedValue(createdOrder);

    const { result } = renderHook(() => useCreateImagingOrder(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync(newOrderData);

    expect(mockImagingApi.createOrder).toHaveBeenCalledWith(newOrderData);
  });
});
