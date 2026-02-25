/**
 * Tests for Physiotherapy hooks.
 *
 * Tests the physiotherapy hooks for orders and sessions management.
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  usePhysiotherapyOrders,
  usePhysiotherapyOrder,
  usePhysiotherapySessions,
  useCreatePhysiotherapyOrder,
  physiotherapyKeys,
} from '@/lib/hooks/use-physiotherapy';
import { physiotherapyApi } from '@/lib/api/physiotherapy';

// Mock the API
jest.mock('@/lib/api/physiotherapy', () => ({
  physiotherapyApi: {
    listOrders: jest.fn(),
    getOrder: jest.fn(),
    getOrderByNumber: jest.fn(),
    createOrder: jest.fn(),
    updateOrder: jest.fn(),
    startOrder: jest.fn(),
    completeOrder: jest.fn(),
    cancelOrder: jest.fn(),
    listSessions: jest.fn(),
    getSession: jest.fn(),
    createSession: jest.fn(),
    updateSession: jest.fn(),
    startSession: jest.fn(),
    completeSession: jest.fn(),
    cancelSession: jest.fn(),
  },
}));

const mockPhysiotherapyApi = physiotherapyApi as jest.Mocked<typeof physiotherapyApi>;

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

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientTestWrapper';
  return Wrapper;
}

const mockOrder = {
  id: 1,
  order_number: 'PHYSIO-20260226-0001',
  patient: {
    id: 1,
    mrn: 'MRN-001',
    first_name: 'John',
    last_name: 'Doe',
    full_name: 'John Doe',
    date_of_birth: '1990-01-15',
    gender: 'M' as const,
  },
  patient_id: 1,
  encounter_id: 100,
  clinic_visit_id: null,
  treatment_type: {
    id: 1,
    code: 'PT-001',
    name: 'Post-Surgery Rehabilitation',
    category: 'POST_SURGICAL' as const,
    typical_duration_minutes: 45,
    cost_per_session: '2000.00',
    sha_claimable: true,
    is_active: true,
  },
  treatment_type_id: 1,
  ordered_by: {
    id: 10,
    username: 'dr.smith',
    first_name: 'Dr.',
    last_name: 'Smith',
    full_name: 'Dr. Smith',
  },
  ordered_by_id: 10,
  assigned_therapist: null,
  assigned_therapist_id: null,
  referral_reason: 'POST_SURGERY' as const,
  clinical_indication: 'Post knee surgery rehabilitation',
  relevant_history: 'ACL reconstruction 2 weeks ago',
  diagnosis: 'Post-operative knee stiffness',
  precautions: 'Weight bearing as tolerated',
  contraindications: '',
  total_sessions: 12,
  sessions_completed: 0,
  frequency: '3x per week',
  treatment_goals: 'Full ROM and strength restoration',
  priority: 'ROUTINE' as const,
  status: 'PENDING' as const,
  start_date: '2026-02-27',
  expected_end_date: '2026-04-15',
  clinical_notes: 'Initial assessment needed',
  is_sensitive: false,
  sha_code: 'PT001',
  sha_claimable: true,
  created_at: '2026-02-26T10:00:00Z',
  updated_at: '2026-02-26T10:00:00Z',
};

const mockOrderList = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      order_number: 'PHYSIO-20260226-0001',
      patient_name: 'John Doe',
      patient_mrn: 'MRN-001',
      treatment_type_name: 'Post-Surgery Rehabilitation',
      assigned_therapist_name: null,
      referral_reason: 'POST_SURGERY' as const,
      total_sessions: 12,
      sessions_completed: 0,
      priority: 'ROUTINE' as const,
      status: 'PENDING' as const,
      is_sensitive: false,
      created_at: '2026-02-26T10:00:00Z',
    },
  ],
};

describe('physiotherapyKeys', () => {
  it('generates correct query keys', () => {
    expect(physiotherapyKeys.all).toEqual(['physiotherapy']);
    expect(physiotherapyKeys.orders()).toEqual(['physiotherapy', 'orders']);
    expect(physiotherapyKeys.orderDetail(1)).toEqual([
      'physiotherapy',
      'orders',
      'detail',
      1,
    ]);
    expect(physiotherapyKeys.orderByNumber('PHYSIO-001')).toEqual([
      'physiotherapy',
      'orders',
      'number',
      'PHYSIO-001',
    ]);
    expect(physiotherapyKeys.sessions()).toEqual(['physiotherapy', 'sessions']);
    expect(physiotherapyKeys.sessionsByOrder(1)).toEqual([
      'physiotherapy',
      'sessions',
      'order',
      1,
    ]);
  });
});

describe('usePhysiotherapyOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches orders successfully', async () => {
    mockPhysiotherapyApi.listOrders.mockResolvedValueOnce(mockOrderList);

    const { result } = renderHook(() => usePhysiotherapyOrders(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockOrderList);
    expect(mockPhysiotherapyApi.listOrders).toHaveBeenCalledTimes(1);
  });

  it('passes filter params to API', async () => {
    mockPhysiotherapyApi.listOrders.mockResolvedValueOnce(mockOrderList);

    const params = { status: 'PENDING' as const, page: 1 };
    const { result } = renderHook(() => usePhysiotherapyOrders(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockPhysiotherapyApi.listOrders).toHaveBeenCalledWith(params);
  });
});

describe('usePhysiotherapyOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches single order by ID', async () => {
    mockPhysiotherapyApi.getOrder.mockResolvedValueOnce(mockOrder);

    const { result } = renderHook(() => usePhysiotherapyOrder(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockOrder);
    expect(mockPhysiotherapyApi.getOrder).toHaveBeenCalledWith(1);
  });

  it('does not fetch when ID is undefined', () => {
    const { result } = renderHook(() => usePhysiotherapyOrder(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(mockPhysiotherapyApi.getOrder).not.toHaveBeenCalled();
  });
});

describe('useCreatePhysiotherapyOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates order successfully', async () => {
    mockPhysiotherapyApi.createOrder.mockResolvedValueOnce(mockOrder);

    const { result } = renderHook(() => useCreatePhysiotherapyOrder(), {
      wrapper: createWrapper(),
    });

    const createData = {
      patient_id: 1,
      encounter_id: 100,
      treatment_type_id: 1,
      referral_reason: 'POST_SURGERY' as const,
      clinical_indication: 'Post knee surgery rehabilitation',
      total_sessions: 12,
      frequency: '3x per week',
    };

    await act(async () => {
      await result.current.mutateAsync(createData);
    });

    expect(mockPhysiotherapyApi.createOrder).toHaveBeenCalledWith(createData);
  });
});

describe('usePhysiotherapySessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches sessions for an order', async () => {
    const mockSessions = {
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          session_number: 'PS-20260226-0001',
          order_number: 'PHYSIO-20260226-0001',
          patient_name: 'John Doe',
          patient_mrn: 'MRN-001',
          therapist_name: 'Jane Therapist',
          session_date: '2026-02-27',
          status: 'SCHEDULED' as const,
          duration_minutes: 45,
          outcome: null,
          created_at: '2026-02-26T10:00:00Z',
        },
      ],
    };

    mockPhysiotherapyApi.listSessions.mockResolvedValueOnce(mockSessions);

    const { result } = renderHook(
      () => usePhysiotherapySessions({ order_id: 1 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockSessions);
    expect(mockPhysiotherapyApi.listSessions).toHaveBeenCalledWith({ order_id: 1 });
  });
});
