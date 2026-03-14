import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  socialWorkKeys,
  useAcceptSWReferral,
  useAssignSWWorker,
  useCancelIntervention,
  useCaseNote,
  useCaseNotes,
  useCaseNotesByCaseId,
  useCloseSWCase,
  useCompleteIntervention,
  useCreateCaseFromReferral,
  useCreateCaseNote,
  useCreateIntervention,
  useCreateSWCase,
  useCreateSWReferral,
  useDeleteCaseNote,
  useDeleteIntervention,
  useDeleteSWCase,
  useDeleteSWReferral,
  useIntervention,
  useInterventions,
  useInterventionsByCaseId,
  useRejectSWReferral,
  useReopenSWCase,
  useStartIntervention,
  useSWCase,
  useSWCaseByNumber,
  useSWCases,
  useSWReferral,
  useSWReferralByNumber,
  useSWReferrals,
  useUpdateCaseNote,
  useUpdateIntervention,
  useUpdateSWCase,
  useUpdateSWReferral,
} from '@/lib/hooks/use-social-work';
import { socialWorkApi } from '@/lib/api/social-work';

jest.mock('@/lib/api/social-work', () => ({
  socialWorkApi: {
    listReferrals: jest.fn(),
    getReferral: jest.fn(),
    getReferralByNumber: jest.fn(),
    createReferral: jest.fn(),
    updateReferral: jest.fn(),
    deleteReferral: jest.fn(),
    acceptReferral: jest.fn(),
    rejectReferral: jest.fn(),
    assignWorker: jest.fn(),
    createCaseFromReferral: jest.fn(),
    listCases: jest.fn(),
    getCase: jest.fn(),
    getCaseByNumber: jest.fn(),
    createCase: jest.fn(),
    updateCase: jest.fn(),
    deleteCase: jest.fn(),
    closeCase: jest.fn(),
    reopenCase: jest.fn(),
    listCaseNotes: jest.fn(),
    getCaseNotes: jest.fn(),
    getCaseNote: jest.fn(),
    createCaseNote: jest.fn(),
    updateCaseNote: jest.fn(),
    deleteCaseNote: jest.fn(),
    listInterventions: jest.fn(),
    getCaseInterventions: jest.fn(),
    getIntervention: jest.fn(),
    createIntervention: jest.fn(),
    updateIntervention: jest.fn(),
    deleteIntervention: jest.fn(),
    startIntervention: jest.fn(),
    completeIntervention: jest.fn(),
    cancelIntervention: jest.fn(),
  },
}));

const mockSocialWorkApi = socialWorkApi as jest.Mocked<typeof socialWorkApi>;

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
  wrapper.displayName = 'SocialWorkHookWrapper';
  return { wrapper, invalidateQueries };
}

const mockReferral = {
  id: 4,
  referral_number: 'SW-20260315-0001',
  patient: 1,
  encounter_id: 100,
  reason: 'FINANCIAL',
  urgency: 'HIGH',
  status: 'PENDING',
  created_at: '2026-03-15T10:00:00Z',
  updated_at: '2026-03-15T10:00:00Z',
};

const mockCase = {
  id: 8,
  case_number: 'SWC-20260315-0001',
  referral: 4,
  patient: 1,
  status: 'OPEN',
  created_at: '2026-03-15T11:00:00Z',
  updated_at: '2026-03-15T11:00:00Z',
};

const mockCaseNote = {
  id: 11,
  case: 8,
  note_type: 'PROGRESS',
  content: 'Initial case review complete',
  created_at: '2026-03-15T12:00:00Z',
  updated_at: '2026-03-15T12:00:00Z',
};

const mockIntervention = {
  id: 14,
  case: 8,
  intervention_type: 'REFERRAL',
  description: 'Linked patient to NHIF desk',
  status: 'PENDING',
  created_at: '2026-03-15T13:00:00Z',
  updated_at: '2026-03-15T13:00:00Z',
};

describe('socialWorkKeys', () => {
  it('builds stable query keys', () => {
    expect(socialWorkKeys.all).toEqual(['social-work']);
    expect(socialWorkKeys.referrals()).toEqual(['social-work', 'referrals']);
    expect(socialWorkKeys.case(8)).toEqual(['social-work', 'cases', 'detail', 8]);
    expect(socialWorkKeys.caseInterventions(8)).toEqual([
      'social-work',
      'interventions',
      'case',
      8,
    ]);
  });
});

describe('social work query hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches referrals, cases, notes, and interventions', async () => {
    mockSocialWorkApi.listReferrals.mockResolvedValueOnce({ count: 1, results: [mockReferral] } as never);
    mockSocialWorkApi.getReferral.mockResolvedValueOnce(mockReferral as never);
    mockSocialWorkApi.getReferralByNumber.mockResolvedValueOnce(mockReferral as never);
    mockSocialWorkApi.listCases.mockResolvedValueOnce({ count: 1, results: [mockCase] } as never);
    mockSocialWorkApi.getCase.mockResolvedValueOnce(mockCase as never);
    mockSocialWorkApi.getCaseByNumber.mockResolvedValueOnce(mockCase as never);
    mockSocialWorkApi.listCaseNotes.mockResolvedValueOnce({ count: 1, results: [mockCaseNote] } as never);
    mockSocialWorkApi.getCaseNotes.mockResolvedValueOnce([mockCaseNote] as never);
    mockSocialWorkApi.getCaseNote.mockResolvedValueOnce(mockCaseNote as never);
    mockSocialWorkApi.listInterventions.mockResolvedValueOnce({ count: 1, results: [mockIntervention] } as never);
    mockSocialWorkApi.getCaseInterventions.mockResolvedValueOnce([mockIntervention] as never);
    mockSocialWorkApi.getIntervention.mockResolvedValueOnce(mockIntervention as never);

    const referrals = renderHook(() => useSWReferrals({ status: 'PENDING' as never }), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(referrals.result.current.isSuccess).toBe(true));
    expect(mockSocialWorkApi.listReferrals).toHaveBeenCalledWith({ status: 'PENDING' });

    const referral = renderHook(() => useSWReferral(4), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(referral.result.current.isSuccess).toBe(true));
    expect(mockSocialWorkApi.getReferral).toHaveBeenCalledWith(4);

    const referralByNumber = renderHook(() => useSWReferralByNumber('SW-20260315-0001'), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(referralByNumber.result.current.isSuccess).toBe(true));
    expect(mockSocialWorkApi.getReferralByNumber).toHaveBeenCalledWith('SW-20260315-0001');

    const cases = renderHook(() => useSWCases({ status: 'OPEN' as never }), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(cases.result.current.isSuccess).toBe(true));
    expect(mockSocialWorkApi.listCases).toHaveBeenCalledWith({ status: 'OPEN' });

    const oneCase = renderHook(() => useSWCase(8), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(oneCase.result.current.isSuccess).toBe(true));
    expect(mockSocialWorkApi.getCase).toHaveBeenCalledWith(8);

    const caseByNumber = renderHook(() => useSWCaseByNumber('SWC-20260315-0001'), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(caseByNumber.result.current.isSuccess).toBe(true));
    expect(mockSocialWorkApi.getCaseByNumber).toHaveBeenCalledWith('SWC-20260315-0001');

    const notes = renderHook(() => useCaseNotes({ case_id: 8 } as never), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(notes.result.current.isSuccess).toBe(true));
    expect(mockSocialWorkApi.listCaseNotes).toHaveBeenCalledWith({ case_id: 8 });

    const notesByCase = renderHook(() => useCaseNotesByCaseId(8), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(notesByCase.result.current.isSuccess).toBe(true));
    expect(mockSocialWorkApi.getCaseNotes).toHaveBeenCalledWith(8);

    const note = renderHook(() => useCaseNote(11), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(note.result.current.isSuccess).toBe(true));
    expect(mockSocialWorkApi.getCaseNote).toHaveBeenCalledWith(11);

    const interventions = renderHook(() => useInterventions({ case_id: 8 } as never), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(interventions.result.current.isSuccess).toBe(true));
    expect(mockSocialWorkApi.listInterventions).toHaveBeenCalledWith({ case_id: 8 });

    const interventionsByCase = renderHook(() => useInterventionsByCaseId(8), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(interventionsByCase.result.current.isSuccess).toBe(true));
    expect(mockSocialWorkApi.getCaseInterventions).toHaveBeenCalledWith(8);

    const intervention = renderHook(() => useIntervention(14), { wrapper: createWrapper().wrapper });
    await waitFor(() => expect(intervention.result.current.isSuccess).toBe(true));
    expect(mockSocialWorkApi.getIntervention).toHaveBeenCalledWith(14);
  });

  it('does not fetch disabled detail queries', () => {
    renderHook(() => useSWReferral(undefined), { wrapper: createWrapper().wrapper });
    renderHook(() => useSWReferralByNumber(undefined), { wrapper: createWrapper().wrapper });
    renderHook(() => useSWCase(undefined), { wrapper: createWrapper().wrapper });
    renderHook(() => useSWCaseByNumber(undefined), { wrapper: createWrapper().wrapper });
    renderHook(() => useCaseNotesByCaseId(undefined), { wrapper: createWrapper().wrapper });
    renderHook(() => useCaseNote(undefined), { wrapper: createWrapper().wrapper });
    renderHook(() => useInterventionsByCaseId(undefined), { wrapper: createWrapper().wrapper });
    renderHook(() => useIntervention(undefined), { wrapper: createWrapper().wrapper });

    expect(mockSocialWorkApi.getReferral).not.toHaveBeenCalled();
    expect(mockSocialWorkApi.getReferralByNumber).not.toHaveBeenCalled();
    expect(mockSocialWorkApi.getCase).not.toHaveBeenCalled();
    expect(mockSocialWorkApi.getCaseByNumber).not.toHaveBeenCalled();
    expect(mockSocialWorkApi.getCaseNotes).not.toHaveBeenCalled();
    expect(mockSocialWorkApi.getCaseNote).not.toHaveBeenCalled();
    expect(mockSocialWorkApi.getCaseInterventions).not.toHaveBeenCalled();
    expect(mockSocialWorkApi.getIntervention).not.toHaveBeenCalled();
  });
});

describe('social work mutation hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invalidates referral and case queries for referral and case mutations', async () => {
    const cases = [
      { useHook: useCreateSWReferral, apiMock: mockSocialWorkApi.createReferral, input: { patient_id: 1, encounter_id: 100, reason: 'FINANCIAL' }, calledWith: [{ patient_id: 1, encounter_id: 100, reason: 'FINANCIAL' }], resolved: mockReferral, keys: [socialWorkKeys.referrals()] },
      { useHook: useUpdateSWReferral, apiMock: mockSocialWorkApi.updateReferral, input: { id: 4, data: { urgency: 'URGENT' } }, calledWith: [4, { urgency: 'URGENT' }], resolved: mockReferral, keys: [socialWorkKeys.referral(4), socialWorkKeys.referrals()] },
      { useHook: useDeleteSWReferral, apiMock: mockSocialWorkApi.deleteReferral, input: 4, calledWith: [4], resolved: undefined, keys: [socialWorkKeys.referrals()] },
      { useHook: useAcceptSWReferral, apiMock: mockSocialWorkApi.acceptReferral, input: 4, calledWith: [4], resolved: { ...mockReferral, status: 'ACCEPTED' }, keys: [socialWorkKeys.referral(4), socialWorkKeys.referrals()] },
      { useHook: useRejectSWReferral, apiMock: mockSocialWorkApi.rejectReferral, input: { id: 4, reason: 'Duplicate' }, calledWith: [4, 'Duplicate'], resolved: { ...mockReferral, status: 'DECLINED' }, keys: [socialWorkKeys.referral(4), socialWorkKeys.referrals()] },
      { useHook: useAssignSWWorker, apiMock: mockSocialWorkApi.assignWorker, input: { id: 4, workerId: 22 }, calledWith: [4, 22], resolved: mockReferral, keys: [socialWorkKeys.referral(4), socialWorkKeys.referrals()] },
      { useHook: useCreateCaseFromReferral, apiMock: mockSocialWorkApi.createCaseFromReferral, input: { referralId: 4, caseData: { case_plan: 'Support plan' } }, calledWith: [4, { case_plan: 'Support plan' }], resolved: mockCase, keys: [socialWorkKeys.referral(4), socialWorkKeys.referrals(), socialWorkKeys.cases()] },
      { useHook: useCreateSWCase, apiMock: mockSocialWorkApi.createCase, input: { patient_id: 1, case_plan: 'Support plan' }, calledWith: [{ patient_id: 1, case_plan: 'Support plan' }], resolved: mockCase, keys: [socialWorkKeys.cases(), socialWorkKeys.referrals()] },
      { useHook: useUpdateSWCase, apiMock: mockSocialWorkApi.updateCase, input: { id: 8, data: { case_plan: 'Updated plan' } }, calledWith: [8, { case_plan: 'Updated plan' }], resolved: mockCase, keys: [socialWorkKeys.case(8), socialWorkKeys.cases()] },
      { useHook: useDeleteSWCase, apiMock: mockSocialWorkApi.deleteCase, input: 8, calledWith: [8], resolved: undefined, keys: [socialWorkKeys.cases()] },
      { useHook: useCloseSWCase, apiMock: mockSocialWorkApi.closeCase, input: { id: 8, closureReason: 'GOALS_MET', outcomeSummary: 'Stable housing secured' }, calledWith: [8, 'GOALS_MET', 'Stable housing secured'], resolved: { ...mockCase, status: 'CLOSED' }, keys: [socialWorkKeys.case(8), socialWorkKeys.cases()] },
      { useHook: useReopenSWCase, apiMock: mockSocialWorkApi.reopenCase, input: { id: 8, reason: 'Needs follow-up' }, calledWith: [8, 'Needs follow-up'], resolved: { ...mockCase, status: 'OPEN' }, keys: [socialWorkKeys.case(8), socialWorkKeys.cases()] },
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

  it('invalidates note and intervention queries for note and intervention mutations', async () => {
    const cases = [
      { useHook: useCreateCaseNote, apiMock: mockSocialWorkApi.createCaseNote, input: { case: 8, content: 'Initial note' }, calledWith: [{ case: 8, content: 'Initial note' }], resolved: mockCaseNote, keys: [socialWorkKeys.notes(), socialWorkKeys.caseNotes(8), socialWorkKeys.case(8)] },
      { useHook: useUpdateCaseNote, apiMock: mockSocialWorkApi.updateCaseNote, input: { id: 11, data: { content: 'Updated note' } }, calledWith: [11, { content: 'Updated note' }], resolved: mockCaseNote, keys: [socialWorkKeys.note(11), socialWorkKeys.notes()] },
      { useHook: useDeleteCaseNote, apiMock: mockSocialWorkApi.deleteCaseNote, input: 11, calledWith: [11], resolved: undefined, keys: [socialWorkKeys.notes()] },
      { useHook: useCreateIntervention, apiMock: mockSocialWorkApi.createIntervention, input: { case: 8, description: 'Linked to NHIF desk' }, calledWith: [{ case: 8, description: 'Linked to NHIF desk' }], resolved: mockIntervention, keys: [socialWorkKeys.interventions(), socialWorkKeys.caseInterventions(8), socialWorkKeys.case(8)] },
      { useHook: useUpdateIntervention, apiMock: mockSocialWorkApi.updateIntervention, input: { id: 14, data: { description: 'Updated intervention' } }, calledWith: [14, { description: 'Updated intervention' }], resolved: mockIntervention, keys: [socialWorkKeys.intervention(14), socialWorkKeys.interventions()] },
      { useHook: useDeleteIntervention, apiMock: mockSocialWorkApi.deleteIntervention, input: 14, calledWith: [14], resolved: undefined, keys: [socialWorkKeys.interventions()] },
      { useHook: useStartIntervention, apiMock: mockSocialWorkApi.startIntervention, input: 14, calledWith: [14], resolved: { ...mockIntervention, status: 'IN_PROGRESS' }, keys: [socialWorkKeys.intervention(14), socialWorkKeys.interventions()] },
      { useHook: useCompleteIntervention, apiMock: mockSocialWorkApi.completeIntervention, input: { id: 14, outcome: 'Patient enrolled' }, calledWith: [14, 'Patient enrolled'], resolved: { ...mockIntervention, status: 'COMPLETED' }, keys: [socialWorkKeys.intervention(14), socialWorkKeys.interventions()] },
      { useHook: useCancelIntervention, apiMock: mockSocialWorkApi.cancelIntervention, input: { id: 14, reason: 'Not needed' }, calledWith: [14, 'Not needed'], resolved: { ...mockIntervention, status: 'CANCELLED' }, keys: [socialWorkKeys.intervention(14), socialWorkKeys.interventions()] },
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