import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  shaQueryKeys,
  useActiveComponentsSearch,
  useCancelClaim,
  useCheckEligibility,
  useClaim,
  useClaims,
  useCreateClaim,
  useDrugsSearch,
  useFetchFromCR,
  useICD11Search,
  useICHISearch,
  useInterventionsSearch,
  useLOINCSearch,
  usePatientEligibility,
  useRegisterInCR,
  useResubmitClaim,
  useSHAMember,
  useSHAMembersByPatient,
  useSubmitClaim,
  useUpdateCR,
  useValidateFacility,
  useValidatePractitioner,
} from '@/lib/hooks/use-sha';
import { shaApi } from '@/lib/api/sha';

jest.mock('@/lib/api/sha', () => ({
  shaApi: {
    getSHAMembers: jest.fn(),
    getSHAMember: jest.fn(),
    checkPatientEligibility: jest.fn(),
    checkEligibility: jest.fn(),
    getClaims: jest.fn(),
    getClaim: jest.fn(),
    createClaim: jest.fn(),
    submitClaim: jest.fn(),
    resubmitClaim: jest.fn(),
    cancelClaim: jest.fn(),
    searchICD11: jest.fn(),
    searchInterventions: jest.fn(),
    searchICHI: jest.fn(),
    searchLOINC: jest.fn(),
    searchDrugs: jest.fn(),
    searchActiveComponents: jest.fn(),
    fetchFromClientRegistry: jest.fn(),
    registerInClientRegistry: jest.fn(),
    updateClientRegistry: jest.fn(),
    validateFacility: jest.fn(),
    validatePractitioner: jest.fn(),
  },
}));

const mockShaApi = shaApi as jest.Mocked<typeof shaApi>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  wrapper.displayName = 'SHAHookWrapper';
  return { wrapper, invalidateQueries };
}

describe('use-sha hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds stable SHA query keys', () => {
    expect(shaQueryKeys.membersByPatient(1)).toEqual(['sha', 'members', 'patient', 1]);
    expect(shaQueryKeys.claim(2)).toEqual(['sha', 'claims', 2]);
    expect(shaQueryKeys.icd11({ search: 'ab' } as never)).toEqual(['sha', 'terminology', 'icd11', { search: 'ab' }]);
  });

  it('fetches member, eligibility, claims, and terminology queries', async () => {
    mockShaApi.getSHAMembers.mockResolvedValue([{ id: 1 }] as never);
    mockShaApi.getSHAMember.mockResolvedValue({ id: 1 } as never);
    mockShaApi.checkPatientEligibility.mockResolvedValue({ eligible: true } as never);
    mockShaApi.getClaims.mockResolvedValue([{ id: 2 }] as never);
    mockShaApi.getClaim.mockResolvedValue({ id: 2, status: 'pending' } as never);
    mockShaApi.searchICD11.mockResolvedValue([{ code: 'A01' }] as never);
    mockShaApi.searchInterventions.mockResolvedValue([{ code: 'I1' }] as never);
    mockShaApi.searchICHI.mockResolvedValue([{ code: 'ICHI1' }] as never);
    mockShaApi.searchLOINC.mockResolvedValue([{ code: 'L1' }] as never);
    mockShaApi.searchDrugs.mockResolvedValue([{ code: 'D1' }] as never);
    mockShaApi.searchActiveComponents.mockResolvedValue([{ code: 'C1' }] as never);

    const wrapper = createWrapper().wrapper;
    const hooks = [
      renderHook(() => useSHAMembersByPatient(1), { wrapper }),
      renderHook(() => useSHAMember(1), { wrapper }),
      renderHook(() => usePatientEligibility(1), { wrapper }),
      renderHook(() => useClaims({ status: 'draft' } as never), { wrapper }),
      renderHook(() => useClaim(2), { wrapper }),
      renderHook(() => useICD11Search({ search: 'ab' } as never), { wrapper }),
      renderHook(() => useInterventionsSearch({ search: 'ab' } as never), { wrapper }),
      renderHook(() => useICHISearch({ search: 'ab' } as never), { wrapper }),
      renderHook(() => useLOINCSearch({ search: 'ab' } as never), { wrapper }),
      renderHook(() => useDrugsSearch({ search: 'ab' } as never), { wrapper }),
      renderHook(() => useActiveComponentsSearch({ search: 'ab' } as never), { wrapper }),
    ];

    await waitFor(() => hooks.forEach((hook) => expect(hook.result.current.isSuccess).toBe(true)));

    renderHook(() => useICD11Search({ search: 'a' } as never), { wrapper });
    renderHook(() => usePatientEligibility(undefined), { wrapper });
    expect(mockShaApi.searchICD11).toHaveBeenCalledTimes(1);
    expect(mockShaApi.checkPatientEligibility).toHaveBeenCalledTimes(1);
  });

  it('invalidates correct caches for SHA mutations and exposes passthrough actions', async () => {
    const ctx = createWrapper();
    const mutationCases = [
      { useHook: useCheckEligibility, api: mockShaApi.checkEligibility, input: { patient_id: 1 }, called: [{ patient_id: 1 }], keys: [shaQueryKeys.eligibility()] },
      { useHook: useCreateClaim, api: mockShaApi.createClaim, input: { patient_id: 1 }, called: [{ patient_id: 1 }], keys: [shaQueryKeys.claims()] },
      { useHook: useSubmitClaim, api: mockShaApi.submitClaim, input: 2, called: [2], keys: [shaQueryKeys.claim(2), shaQueryKeys.claims()] },
      { useHook: useResubmitClaim, api: mockShaApi.resubmitClaim, input: 2, called: [2], keys: [shaQueryKeys.claim(2), shaQueryKeys.claims()] },
      { useHook: useCancelClaim, api: mockShaApi.cancelClaim, input: 2, called: [2], keys: [shaQueryKeys.claim(2), shaQueryKeys.claims()] },
      { useHook: useFetchFromCR, api: mockShaApi.fetchFromClientRegistry, input: { patient_id: 1 }, called: [{ patient_id: 1 }], keys: [] },
      { useHook: useRegisterInCR, api: mockShaApi.registerInClientRegistry, input: { patient_id: 1 }, called: [{ patient_id: 1 }], keys: [['patient', 1], ['patients']] },
      { useHook: useUpdateCR, api: mockShaApi.updateClientRegistry, input: { patient_id: 1 }, called: [{ patient_id: 1 }], keys: [] },
      { useHook: useValidateFacility, api: mockShaApi.validateFacility, input: { code: '001' }, called: [{ code: '001' }], keys: [] },
      { useHook: useValidatePractitioner, api: mockShaApi.validatePractitioner, input: { license: 'ABC' }, called: [{ license: 'ABC' }], keys: [] },
    ];

    for (const testCase of mutationCases) {
      testCase.api.mockResolvedValueOnce({ ok: true } as never);
      const { result } = renderHook(() => testCase.useHook(), { wrapper: ctx.wrapper });
      await act(async () => {
        await result.current.mutateAsync(testCase.input as never);
      });
      expect(testCase.api.mock.calls[0]?.[0]).toEqual((testCase.called as any[])[0]);
      testCase.keys.forEach((key) => expect(ctx.invalidateQueries).toHaveBeenCalledWith({ queryKey: key }));
    }
  });
});
