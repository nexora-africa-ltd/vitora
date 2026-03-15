import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  otKeys,
  useApproveOTOrder,
  useAssignOTTherapist,
  useCancelOTOrder,
  useCancelOTSession,
  useCompleteOTOrder,
  useCompleteOTSession,
  useCreateOTOrder,
  useCreateOTSession,
  useDeleteOTOrder,
  useGenerateOTSessions,
  useMarkOTSessionNoShow,
  useOTOrder,
  useOTOrderByNumber,
  useOTOrderSessions,
  useOTOrders,
  useOTSession,
  useOTSessions,
  useOTTreatmentType,
  useOTTreatmentTypes,
  useRejectOTOrder,
  useRescheduleOTSession,
  useStartOTOrder,
  useStartOTSession,
  useUpdateOTOrder,
} from '@/lib/hooks/use-occupational-therapy';
import { occupationalTherapyApi } from '@/lib/api/occupational-therapy';

jest.mock('@/lib/api/occupational-therapy', () => ({
  occupationalTherapyApi: {
    listTreatmentTypes: jest.fn(),
    getTreatmentType: jest.fn(),
    listOrders: jest.fn(),
    getOrder: jest.fn(),
    getOrderByNumber: jest.fn(),
    createOrder: jest.fn(),
    updateOrder: jest.fn(),
    deleteOrder: jest.fn(),
    approveOrder: jest.fn(),
    rejectOrder: jest.fn(),
    assignTherapist: jest.fn(),
    generateSessions: jest.fn(),
    startOrder: jest.fn(),
    completeOrder: jest.fn(),
    cancelOrder: jest.fn(),
    listSessions: jest.fn(),
    getSession: jest.fn(),
    getOrderSessions: jest.fn(),
    createSession: jest.fn(),
    startSession: jest.fn(),
    completeSession: jest.fn(),
    cancelSession: jest.fn(),
    markNoShow: jest.fn(),
    rescheduleSession: jest.fn(),
  },
}));

const mockOtApi = occupationalTherapyApi as jest.Mocked<typeof occupationalTherapyApi>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  wrapper.displayName = 'OTHookWrapper';
  return { wrapper, invalidateQueries };
}

describe('use-occupational-therapy hooks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('builds OT query keys and fetches order/session queries', async () => {
    expect(otKeys.order(1)).toEqual(['occupational-therapy', 'orders', 'detail', 1]);
    mockOtApi.listTreatmentTypes.mockResolvedValue([{ id: 1 }] as never);
    mockOtApi.getTreatmentType.mockResolvedValue({ id: 1 } as never);
    mockOtApi.listOrders.mockResolvedValue([{ id: 2 }] as never);
    mockOtApi.getOrder.mockResolvedValue({ id: 2 } as never);
    mockOtApi.getOrderByNumber.mockResolvedValue({ id: 2 } as never);
    mockOtApi.listSessions.mockResolvedValue([{ id: 3 }] as never);
    mockOtApi.getSession.mockResolvedValue({ id: 3 } as never);
    mockOtApi.getOrderSessions.mockResolvedValue([{ id: 3 }] as never);

    const wrapper = createWrapper().wrapper;
    const hooks = [
      renderHook(() => useOTTreatmentTypes({ is_active: true } as never), { wrapper }),
      renderHook(() => useOTTreatmentType(1), { wrapper }),
      renderHook(() => useOTOrders({ status: 'PENDING' } as never), { wrapper }),
      renderHook(() => useOTOrder(2), { wrapper }),
      renderHook(() => useOTOrderByNumber('OT-001'), { wrapper }),
      renderHook(() => useOTSessions({ status: 'SCHEDULED' } as never), { wrapper }),
      renderHook(() => useOTSession(3), { wrapper }),
      renderHook(() => useOTOrderSessions(2), { wrapper }),
    ];
    await waitFor(() => hooks.forEach((hook) => expect(hook.result.current.isSuccess).toBe(true)));
  });

  it('invalidates OT caches for order and session mutations', async () => {
    const ctx = createWrapper();
    const cases = [
      { useHook: useCreateOTOrder, api: mockOtApi.createOrder, input: { patient: 1 }, called: [{ patient: 1 }], keys: [otKeys.orders()] },
      { useHook: useUpdateOTOrder, api: mockOtApi.updateOrder, input: { id: 2, data: { notes: 'updated' } }, called: [2, { notes: 'updated' }], keys: [otKeys.order(2), otKeys.orders()] },
      { useHook: useDeleteOTOrder, api: mockOtApi.deleteOrder, input: 2, called: [2], keys: [otKeys.orders()] },
      { useHook: useApproveOTOrder, api: mockOtApi.approveOrder, input: 2, called: [2], keys: [otKeys.order(2), otKeys.orders()] },
      { useHook: useRejectOTOrder, api: mockOtApi.rejectOrder, input: { id: 2, reason: 'reject' }, called: [2, 'reject'], keys: [otKeys.order(2), otKeys.orders()] },
      { useHook: useAssignOTTherapist, api: mockOtApi.assignTherapist, input: { id: 2, therapistId: 7 }, called: [2, 7], keys: [otKeys.order(2), otKeys.orders()] },
      { useHook: useGenerateOTSessions, api: mockOtApi.generateSessions, input: { id: 2, count: 2 }, called: [2, 2], keys: [otKeys.order(2), otKeys.orderSessions(2), otKeys.sessions()] },
      { useHook: useStartOTOrder, api: mockOtApi.startOrder, input: 2, called: [2], keys: [otKeys.order(2), otKeys.orders()] },
      { useHook: useCompleteOTOrder, api: mockOtApi.completeOrder, input: 2, called: [2], keys: [otKeys.order(2), otKeys.orders()] },
      { useHook: useCancelOTOrder, api: mockOtApi.cancelOrder, input: { id: 2, reason: 'cancel' }, called: [2, 'cancel'], keys: [otKeys.order(2), otKeys.orders()] },
      { useHook: useCreateOTSession, api: mockOtApi.createSession, input: { order: 2 }, called: [{ order: 2 }], keys: [otKeys.sessions(), otKeys.orderSessions(2)] },
      { useHook: useStartOTSession, api: mockOtApi.startSession, input: 3, called: [3], keys: [otKeys.session(3), otKeys.sessions()] },
      { useHook: useCompleteOTSession, api: mockOtApi.completeSession, input: { id: 3, data: { summary: 'done' } }, called: [3, { summary: 'done' }], resolved: { order: 2 }, keys: [otKeys.session(3), otKeys.sessions(), otKeys.order(2)] },
      { useHook: useCancelOTSession, api: mockOtApi.cancelSession, input: { id: 3, reason: 'cancel' }, called: [3, 'cancel'], keys: [otKeys.session(3), otKeys.sessions()] },
      { useHook: useMarkOTSessionNoShow, api: mockOtApi.markNoShow, input: 3, called: [3], keys: [otKeys.session(3), otKeys.sessions()] },
      { useHook: useRescheduleOTSession, api: mockOtApi.rescheduleSession, input: { id: 3, newDate: '2026-03-20', newTime: '11:00' }, called: [3, '2026-03-20', '11:00'], keys: [otKeys.session(3), otKeys.sessions()] },
    ];
    for (const testCase of cases) {
      testCase.api.mockResolvedValueOnce((testCase as any).resolved ?? { ok: true });
      const { result } = renderHook(() => testCase.useHook(), { wrapper: ctx.wrapper });
      await act(async () => {
        await result.current.mutateAsync(testCase.input as never);
      });
      expect(testCase.api).toHaveBeenCalledWith(...(testCase.called as []));
      testCase.keys.forEach((key) => expect(ctx.invalidateQueries).toHaveBeenCalledWith({ queryKey: key }));
    }
  });
});import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  otKeys,
  useApproveOTOrder,
  useAssignOTTherapist,
  useCancelOTOrder,
  useCancelOTSession,
  useCompleteOTOrder,
  useCompleteOTSession,
  useCreateOTOrder,
  useCreateOTSession,
  useDeleteOTOrder,
  useGenerateOTSessions,
  useMarkOTSessionNoShow,
  useOTOrder,
  useOTOrderByNumber,
  useOTOrders,
  useOTOrderSessions,
  useOTSession,
  useOTSessions,
  useOTTreatmentType,
  useOTTreatmentTypes,
  useRejectOTOrder,
  useRescheduleOTSession,
  useStartOTOrder,
  useStartOTSession,
  useUpdateOTOrder,
} from '@/lib/hooks/use-occupational-therapy';
import { occupationalTherapyApi } from '@/lib/api/occupational-therapy';

jest.mock('@/lib/api/occupational-therapy', () => ({
  occupationalTherapyApi: {
    listTreatmentTypes: jest.fn(),
    getTreatmentType: jest.fn(),
    listOrders: jest.fn(),
    getOrder: jest.fn(),
    getOrderByNumber: jest.fn(),
    createOrder: jest.fn(),
    updateOrder: jest.fn(),
    deleteOrder: jest.fn(),
    approveOrder: jest.fn(),
    rejectOrder: jest.fn(),
    assignTherapist: jest.fn(),
    generateSessions: jest.fn(),
    startOrder: jest.fn(),
    completeOrder: jest.fn(),
    cancelOrder: jest.fn(),
    listSessions: jest.fn(),
    getSession: jest.fn(),
    getOrderSessions: jest.fn(),
    createSession: jest.fn(),
    startSession: jest.fn(),
    completeSession: jest.fn(),
    cancelSession: jest.fn(),
    markNoShow: jest.fn(),
    rescheduleSession: jest.fn(),
  },
}));

const mockOTApi = occupationalTherapyApi as jest.Mocked<typeof occupationalTherapyApi>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  wrapper.displayName = 'OTHookWrapper';
  return { wrapper, invalidateQueries };
}

const mockTreatmentType = {
  id: 1,
  code: 'OT-ADL-001',
  name: 'ADL Training',
  category: 'ADL',
  typical_duration_minutes: 60,
  recommended_sessions: 10,
  cost_per_session: '2500.00',
  sha_claimable: true,
  is_active: true,
};

const mockOrder = {
  id: 7,
  order_number: 'OT-20260315-0001',
  patient: 1,
  encounter_id: 100,
  treatment_type_id: 1,
  status: 'PENDING',
  total_sessions: 10,
  sessions_completed: 0,
  independence_score_initial: 65,
  independence_score_current: 65,
  created_at: '2026-03-15T10:00:00Z',
  updated_at: '2026-03-15T10:00:00Z',
};

const mockSession = {
  id: 9,
  order: 7,
  session_number: 'OTS-20260316-0001',
  status: 'SCHEDULED',
  session_date: '2026-03-16',
  created_at: '2026-03-15T11:00:00Z',
  updated_at: '2026-03-15T11:00:00Z',
};

describe('otKeys', () => {
  it('builds stable query keys', () => {
    expect(otKeys.all).toEqual(['occupational-therapy']);
    expect(otKeys.treatmentTypes()).toEqual(['occupational-therapy', 'treatment-types']);
    expect(otKeys.order(7)).toEqual(['occupational-therapy', 'orders', 'detail', 7]);
    expect(otKeys.orderSessions(7)).toEqual(['occupational-therapy', 'sessions', 'order', 7]);
  });
});

describe('occupational therapy query hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches treatment types, orders, and sessions', async () => {
    mockOTApi.listTreatmentTypes.mockResolvedValueOnce({ count: 1, results: [mockTreatmentType] } as never);
    mockOTApi.getTreatmentType.mockResolvedValueOnce(mockTreatmentType as never);
    mockOTApi.listOrders.mockResolvedValueOnce({ count: 1, results: [mockOrder] } as never);
    mockOTApi.getOrder.mockResolvedValueOnce(mockOrder as never);
    mockOTApi.getOrderByNumber.mockResolvedValueOnce(mockOrder as never);
    mockOTApi.listSessions.mockResolvedValueOnce({ count: 1, results: [mockSession] } as never);
    mockOTApi.getSession.mockResolvedValueOnce(mockSession as never);
    mockOTApi.getOrderSessions.mockResolvedValueOnce([mockSession] as never);

    const treatmentTypes = renderHook(() => useOTTreatmentTypes({ is_active: true } as never), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(treatmentTypes.result.current.isSuccess).toBe(true));
    expect(mockOTApi.listTreatmentTypes).toHaveBeenCalledWith({ is_active: true });

    const treatmentType = renderHook(() => useOTTreatmentType(1), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(treatmentType.result.current.isSuccess).toBe(true));
    expect(mockOTApi.getTreatmentType).toHaveBeenCalledWith(1);

    const orders = renderHook(() => useOTOrders({ status: 'PENDING' as never }), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(orders.result.current.isSuccess).toBe(true));
    expect(mockOTApi.listOrders).toHaveBeenCalledWith({ status: 'PENDING' });

    const order = renderHook(() => useOTOrder(7), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(order.result.current.isSuccess).toBe(true));
    expect(mockOTApi.getOrder).toHaveBeenCalledWith(7);

    const orderByNumber = renderHook(() => useOTOrderByNumber('OT-20260315-0001'), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(orderByNumber.result.current.isSuccess).toBe(true));
    expect(mockOTApi.getOrderByNumber).toHaveBeenCalledWith('OT-20260315-0001');

    const sessions = renderHook(() => useOTSessions({ status: 'SCHEDULED' as never }), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(sessions.result.current.isSuccess).toBe(true));
    expect(mockOTApi.listSessions).toHaveBeenCalledWith({ status: 'SCHEDULED' });

    const session = renderHook(() => useOTSession(9), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(session.result.current.isSuccess).toBe(true));
    expect(mockOTApi.getSession).toHaveBeenCalledWith(9);

    const orderSessions = renderHook(() => useOTOrderSessions(7), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(orderSessions.result.current.isSuccess).toBe(true));
    expect(mockOTApi.getOrderSessions).toHaveBeenCalledWith(7);
  });

  it('does not fetch disabled detail queries', () => {
    renderHook(() => useOTTreatmentType(undefined), { wrapper: createWrapper().wrapper });
    renderHook(() => useOTOrder(undefined), { wrapper: createWrapper().wrapper });
    renderHook(() => useOTOrderByNumber(undefined), { wrapper: createWrapper().wrapper });
    renderHook(() => useOTSession(undefined), { wrapper: createWrapper().wrapper });
    renderHook(() => useOTOrderSessions(undefined), { wrapper: createWrapper().wrapper });

    expect(mockOTApi.getTreatmentType).not.toHaveBeenCalled();
    expect(mockOTApi.getOrder).not.toHaveBeenCalled();
    expect(mockOTApi.getOrderByNumber).not.toHaveBeenCalled();
    expect(mockOTApi.getSession).not.toHaveBeenCalled();
    expect(mockOTApi.getOrderSessions).not.toHaveBeenCalled();
  });
});

describe('occupational therapy mutation hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invalidates order queries for order mutations', async () => {
    const cases = [
      { useHook: useCreateOTOrder, apiMock: mockOTApi.createOrder, input: { patient_id: 1, encounter_id: 100, treatment_type_id: 1, clinical_indication: 'ADL support' }, calledWith: [{ patient_id: 1, encounter_id: 100, treatment_type_id: 1, clinical_indication: 'ADL support' }], resolved: mockOrder, keys: [otKeys.orders()] },
      { useHook: useUpdateOTOrder, apiMock: mockOTApi.updateOrder, input: { id: 7, data: { clinical_indication: 'Updated' } }, calledWith: [7, { clinical_indication: 'Updated' }], resolved: mockOrder, keys: [otKeys.order(7), otKeys.orders()] },
      { useHook: useDeleteOTOrder, apiMock: mockOTApi.deleteOrder, input: 7, calledWith: [7], resolved: undefined, keys: [otKeys.orders()] },
      { useHook: useApproveOTOrder, apiMock: mockOTApi.approveOrder, input: 7, calledWith: [7], resolved: { ...mockOrder, status: 'APPROVED' }, keys: [otKeys.order(7), otKeys.orders()] },
      { useHook: useRejectOTOrder, apiMock: mockOTApi.rejectOrder, input: { id: 7, reason: 'Contraindication' }, calledWith: [7, 'Contraindication'], resolved: { ...mockOrder, status: 'REJECTED' }, keys: [otKeys.order(7), otKeys.orders()] },
      { useHook: useAssignOTTherapist, apiMock: mockOTApi.assignTherapist, input: { id: 7, therapistId: 11 }, calledWith: [7, 11], resolved: mockOrder, keys: [otKeys.order(7), otKeys.orders()] },
      { useHook: useGenerateOTSessions, apiMock: mockOTApi.generateSessions, input: { id: 7, count: 3 }, calledWith: [7, 3], resolved: [mockSession], keys: [otKeys.order(7), otKeys.orderSessions(7), otKeys.sessions()] },
      { useHook: useStartOTOrder, apiMock: mockOTApi.startOrder, input: 7, calledWith: [7], resolved: { ...mockOrder, status: 'IN_PROGRESS' }, keys: [otKeys.order(7), otKeys.orders()] },
      { useHook: useCompleteOTOrder, apiMock: mockOTApi.completeOrder, input: 7, calledWith: [7], resolved: { ...mockOrder, status: 'COMPLETED' }, keys: [otKeys.order(7), otKeys.orders()] },
      { useHook: useCancelOTOrder, apiMock: mockOTApi.cancelOrder, input: { id: 7, reason: 'Patient declined' }, calledWith: [7, 'Patient declined'], resolved: { ...mockOrder, status: 'CANCELLED' }, keys: [otKeys.order(7), otKeys.orders()] },
    ];

    for (const testCase of cases) {
      testCase.apiMock.mockResolvedValueOnce(testCase.resolved as never);
      const ctx = createWrapper();
      const { result } = renderHook(() => testCase.useHook(), { wrapper: ctx.wrapper });
      await act(async () => {
        await result.current.mutateAsync(testCase.input as never);
      });
      expect(testCase.apiMock).toHaveBeenCalledWith(...(testCase.calledWith as []));
      for (const key of testCase.keys) {
        expect(ctx.invalidateQueries).toHaveBeenCalledWith({ queryKey: key });
      }
    }
  });

  it('invalidates session queries for session mutations', async () => {
    const cases = [
      { useHook: useCreateOTSession, apiMock: mockOTApi.createSession, input: { order: 7, session_date: '2026-03-16' }, calledWith: [{ order: 7, session_date: '2026-03-16' }], resolved: mockSession, keys: [otKeys.sessions(), otKeys.orderSessions(7)] },
      { useHook: useStartOTSession, apiMock: mockOTApi.startSession, input: 9, calledWith: [9], resolved: { ...mockSession, status: 'IN_PROGRESS' }, keys: [otKeys.session(9), otKeys.sessions()] },
      { useHook: useCompleteOTSession, apiMock: mockOTApi.completeSession, input: { id: 9, data: { progress_notes: 'Improved', independence_score: 70 } }, calledWith: [9, { progress_notes: 'Improved', independence_score: 70 }], resolved: { ...mockSession, status: 'COMPLETED', order: 7 }, keys: [otKeys.session(9), otKeys.sessions(), otKeys.order(7)] },
      { useHook: useCancelOTSession, apiMock: mockOTApi.cancelSession, input: { id: 9, reason: 'Unwell' }, calledWith: [9, 'Unwell'], resolved: { ...mockSession, status: 'CANCELLED' }, keys: [otKeys.session(9), otKeys.sessions()] },
      { useHook: useMarkOTSessionNoShow, apiMock: mockOTApi.markNoShow, input: 9, calledWith: [9], resolved: { ...mockSession, status: 'NO_SHOW' }, keys: [otKeys.session(9), otKeys.sessions()] },
      { useHook: useRescheduleOTSession, apiMock: mockOTApi.rescheduleSession, input: { id: 9, newDate: '2026-03-20', newTime: '10:00:00' }, calledWith: [9, '2026-03-20', '10:00:00'], resolved: { ...mockSession, session_date: '2026-03-20' }, keys: [otKeys.session(9), otKeys.sessions()] },
    ];

    for (const testCase of cases) {
      testCase.apiMock.mockResolvedValueOnce(testCase.resolved as never);
      const ctx = createWrapper();
      const { result } = renderHook(() => testCase.useHook(), { wrapper: ctx.wrapper });
      await act(async () => {
        await result.current.mutateAsync(testCase.input as never);
      });
      expect(testCase.apiMock).toHaveBeenCalledWith(...(testCase.calledWith as []));
      for (const key of testCase.keys) {
        expect(ctx.invalidateQueries).toHaveBeenCalledWith({ queryKey: key });
      }
    }
  });
});