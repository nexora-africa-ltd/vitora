import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  counsellingKeys,
  useAcceptCounsellingReferral,
  useAssignCounsellor,
  useCancelCounsellingReferral,
  useCancelCounsellingSession,
  useCompleteCounsellingReferral,
  useCompleteCounsellingSession,
  useCounsellingReferral,
  useCounsellingReferralByNumber,
  useCounsellingReferrals,
  useCounsellingReferralSessions,
  useCounsellingSession,
  useCounsellingSessions,
  useCounsellingType,
  useCounsellingTypes,
  useCreateCounsellingReferral,
  useCreateCounsellingSession,
  useDeleteCounsellingReferral,
  useGenerateCounsellingSessions,
  useMarkCounsellingSessionNoShow,
  useRejectCounsellingReferral,
  useRescheduleCounsellingSession,
  useStartCounsellingReferral,
  useStartCounsellingSession,
  useUpdateCounsellingReferral,
} from '@/lib/hooks/use-counselling';
import { counsellingApi } from '@/lib/api/counselling';

jest.mock('@/lib/api/counselling', () => ({
  counsellingApi: {
    listTypes: jest.fn(),
    getType: jest.fn(),
    listReferrals: jest.fn(),
    getReferral: jest.fn(),
    getReferralByNumber: jest.fn(),
    createReferral: jest.fn(),
    updateReferral: jest.fn(),
    deleteReferral: jest.fn(),
    acceptReferral: jest.fn(),
    rejectReferral: jest.fn(),
    assignCounsellor: jest.fn(),
    generateSessions: jest.fn(),
    startReferral: jest.fn(),
    completeReferral: jest.fn(),
    cancelReferral: jest.fn(),
    listSessions: jest.fn(),
    getSession: jest.fn(),
    getReferralSessions: jest.fn(),
    createSession: jest.fn(),
    startSession: jest.fn(),
    completeSession: jest.fn(),
    cancelSession: jest.fn(),
    markNoShow: jest.fn(),
    rescheduleSession: jest.fn(),
  },
}));

const mockCounsellingApi = counsellingApi as jest.Mocked<typeof counsellingApi>;

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
  wrapper.displayName = 'CounsellingHookWrapper';
  return { wrapper, invalidateQueries };
}

const mockType = {
  id: 1,
  code: 'COUN-IND',
  name: 'Individual Counselling',
  category: 'INDIVIDUAL',
  is_active: true,
};

const mockReferral = {
  id: 3,
  referral_number: 'COUN-20260315-0001',
  patient: 1,
  encounter_id: 100,
  counselling_type: 'INDIVIDUAL',
  reason: 'ANXIETY',
  urgency: 'MEDIUM',
  status: 'PENDING',
  total_sessions: 8,
  sessions_completed: 0,
  is_sensitive: false,
  created_at: '2026-03-15T10:00:00Z',
  updated_at: '2026-03-15T10:00:00Z',
};

const mockSession = {
  id: 5,
  referral: 3,
  session_number: 'CS-20260316-0001',
  status: 'SCHEDULED',
  scheduled_date: '2026-03-16',
  created_at: '2026-03-15T11:00:00Z',
  updated_at: '2026-03-15T11:00:00Z',
};

describe('counsellingKeys', () => {
  it('builds stable query keys', () => {
    expect(counsellingKeys.all).toEqual(['counselling']);
    expect(counsellingKeys.types()).toEqual(['counselling', 'types']);
    expect(counsellingKeys.referral(3)).toEqual(['counselling', 'referrals', 'detail', 3]);
    expect(counsellingKeys.referralSessions(3)).toEqual([
      'counselling',
      'sessions',
      'referral',
      3,
    ]);
  });
});

describe('counselling query hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches types, referrals, and sessions', async () => {
    mockCounsellingApi.listTypes.mockResolvedValueOnce({ count: 1, results: [mockType] } as never);
    mockCounsellingApi.getType.mockResolvedValueOnce(mockType as never);
    mockCounsellingApi.listReferrals.mockResolvedValueOnce({ count: 1, results: [mockReferral] } as never);
    mockCounsellingApi.getReferral.mockResolvedValueOnce(mockReferral as never);
    mockCounsellingApi.getReferralByNumber.mockResolvedValueOnce(mockReferral as never);
    mockCounsellingApi.listSessions.mockResolvedValueOnce({ count: 1, results: [mockSession] } as never);
    mockCounsellingApi.getSession.mockResolvedValueOnce(mockSession as never);
    mockCounsellingApi.getReferralSessions.mockResolvedValueOnce([mockSession] as never);

    const types = renderHook(() => useCounsellingTypes({ is_active: true } as never), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(types.result.current.isSuccess).toBe(true));
    expect(mockCounsellingApi.listTypes).toHaveBeenCalledWith({ is_active: true });

    const type = renderHook(() => useCounsellingType(1), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(type.result.current.isSuccess).toBe(true));
    expect(mockCounsellingApi.getType).toHaveBeenCalledWith(1);

    const referrals = renderHook(() => useCounsellingReferrals({ status: 'PENDING' as never }), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(referrals.result.current.isSuccess).toBe(true));
    expect(mockCounsellingApi.listReferrals).toHaveBeenCalledWith({ status: 'PENDING' });

    const referral = renderHook(() => useCounsellingReferral(3), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(referral.result.current.isSuccess).toBe(true));
    expect(mockCounsellingApi.getReferral).toHaveBeenCalledWith(3);

    const referralByNumber = renderHook(() => useCounsellingReferralByNumber('COUN-20260315-0001'), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(referralByNumber.result.current.isSuccess).toBe(true));
    expect(mockCounsellingApi.getReferralByNumber).toHaveBeenCalledWith('COUN-20260315-0001');

    const sessions = renderHook(() => useCounsellingSessions({ status: 'SCHEDULED' as never }), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(sessions.result.current.isSuccess).toBe(true));
    expect(mockCounsellingApi.listSessions).toHaveBeenCalledWith({ status: 'SCHEDULED' });

    const session = renderHook(() => useCounsellingSession(5), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(session.result.current.isSuccess).toBe(true));
    expect(mockCounsellingApi.getSession).toHaveBeenCalledWith(5);

    const referralSessions = renderHook(() => useCounsellingReferralSessions(3), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(referralSessions.result.current.isSuccess).toBe(true));
    expect(mockCounsellingApi.getReferralSessions).toHaveBeenCalledWith(3);
  });

  it('does not fetch disabled detail queries', () => {
    renderHook(() => useCounsellingType(undefined), { wrapper: createWrapper().wrapper });
    renderHook(() => useCounsellingReferral(undefined), { wrapper: createWrapper().wrapper });
    renderHook(() => useCounsellingReferralByNumber(undefined), { wrapper: createWrapper().wrapper });
    renderHook(() => useCounsellingSession(undefined), { wrapper: createWrapper().wrapper });
    renderHook(() => useCounsellingReferralSessions(undefined), { wrapper: createWrapper().wrapper });

    expect(mockCounsellingApi.getType).not.toHaveBeenCalled();
    expect(mockCounsellingApi.getReferral).not.toHaveBeenCalled();
    expect(mockCounsellingApi.getReferralByNumber).not.toHaveBeenCalled();
    expect(mockCounsellingApi.getSession).not.toHaveBeenCalled();
    expect(mockCounsellingApi.getReferralSessions).not.toHaveBeenCalled();
  });
});

describe('counselling mutation hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invalidates referral queries for referral mutations', async () => {
    const cases = [
      { useHook: useCreateCounsellingReferral, apiMock: mockCounsellingApi.createReferral, input: { patient_id: 1, encounter_id: 100, counselling_type: 'INDIVIDUAL', reason: 'ANXIETY' }, calledWith: [{ patient_id: 1, encounter_id: 100, counselling_type: 'INDIVIDUAL', reason: 'ANXIETY' }], resolved: mockReferral, keys: [counsellingKeys.referrals()] },
      { useHook: useUpdateCounsellingReferral, apiMock: mockCounsellingApi.updateReferral, input: { id: 3, data: { urgency: 'HIGH' } }, calledWith: [3, { urgency: 'HIGH' }], resolved: mockReferral, keys: [counsellingKeys.referral(3), counsellingKeys.referrals()] },
      { useHook: useDeleteCounsellingReferral, apiMock: mockCounsellingApi.deleteReferral, input: 3, calledWith: [3], resolved: undefined, keys: [counsellingKeys.referrals()] },
      { useHook: useAcceptCounsellingReferral, apiMock: mockCounsellingApi.acceptReferral, input: 3, calledWith: [3], resolved: { ...mockReferral, status: 'ACCEPTED' }, keys: [counsellingKeys.referral(3), counsellingKeys.referrals()] },
      { useHook: useRejectCounsellingReferral, apiMock: mockCounsellingApi.rejectReferral, input: { id: 3, reason: 'Insufficient details' }, calledWith: [3, 'Insufficient details'], resolved: { ...mockReferral, status: 'DECLINED' }, keys: [counsellingKeys.referral(3), counsellingKeys.referrals()] },
      { useHook: useAssignCounsellor, apiMock: mockCounsellingApi.assignCounsellor, input: { id: 3, counsellorId: 12 }, calledWith: [3, 12], resolved: mockReferral, keys: [counsellingKeys.referral(3), counsellingKeys.referrals()] },
      { useHook: useGenerateCounsellingSessions, apiMock: mockCounsellingApi.generateSessions, input: { id: 3, count: 4 }, calledWith: [3, 4], resolved: [mockSession], keys: [counsellingKeys.referral(3), counsellingKeys.referralSessions(3), counsellingKeys.sessions()] },
      { useHook: useStartCounsellingReferral, apiMock: mockCounsellingApi.startReferral, input: 3, calledWith: [3], resolved: { ...mockReferral, status: 'IN_PROGRESS' }, keys: [counsellingKeys.referral(3), counsellingKeys.referrals()] },
      { useHook: useCompleteCounsellingReferral, apiMock: mockCounsellingApi.completeReferral, input: 3, calledWith: [3], resolved: { ...mockReferral, status: 'COMPLETED' }, keys: [counsellingKeys.referral(3), counsellingKeys.referrals()] },
      { useHook: useCancelCounsellingReferral, apiMock: mockCounsellingApi.cancelReferral, input: { id: 3, reason: 'Patient deferred' }, calledWith: [3, 'Patient deferred'], resolved: { ...mockReferral, status: 'CANCELLED' }, keys: [counsellingKeys.referral(3), counsellingKeys.referrals()] },
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
      { useHook: useCreateCounsellingSession, apiMock: mockCounsellingApi.createSession, input: { referral: 3, scheduled_date: '2026-03-16' }, calledWith: [{ referral: 3, scheduled_date: '2026-03-16' }], resolved: mockSession, keys: [counsellingKeys.sessions(), counsellingKeys.referralSessions(3)] },
      { useHook: useStartCounsellingSession, apiMock: mockCounsellingApi.startSession, input: 5, calledWith: [5], resolved: { ...mockSession, status: 'IN_PROGRESS' }, keys: [counsellingKeys.session(5), counsellingKeys.sessions()] },
      { useHook: useCompleteCounsellingSession, apiMock: mockCounsellingApi.completeSession, input: { id: 5, data: { progress_notes: 'Improved coping' } }, calledWith: [5, { progress_notes: 'Improved coping' }], resolved: { ...mockSession, status: 'COMPLETED', referral: 3 }, keys: [counsellingKeys.session(5), counsellingKeys.sessions(), counsellingKeys.referral(3)] },
      { useHook: useCancelCounsellingSession, apiMock: mockCounsellingApi.cancelSession, input: { id: 5, reason: 'Scheduling conflict' }, calledWith: [5, 'Scheduling conflict'], resolved: { ...mockSession, status: 'CANCELLED' }, keys: [counsellingKeys.session(5), counsellingKeys.sessions()] },
      { useHook: useMarkCounsellingSessionNoShow, apiMock: mockCounsellingApi.markNoShow, input: 5, calledWith: [5], resolved: { ...mockSession, status: 'NO_SHOW' }, keys: [counsellingKeys.session(5), counsellingKeys.sessions()] },
      { useHook: useRescheduleCounsellingSession, apiMock: mockCounsellingApi.rescheduleSession, input: { id: 5, newDate: '2026-03-22', newTime: '14:00:00' }, calledWith: [5, '2026-03-22', '14:00:00'], resolved: { ...mockSession, scheduled_date: '2026-03-22' }, keys: [counsellingKeys.session(5), counsellingKeys.sessions()] },
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