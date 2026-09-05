// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** React Query hooks for DHA Shared Health Record consent requests. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shrApi } from '@/lib/api/shr';
import type { SHRConsentRequest } from '@/lib/types/shr';

export const shrQueryKeys = { all: ['shr'] as const, consent: (id: number) => ['shr', 'consent', id] as const };

export function useSHRConsents() {
  return useQuery({ queryKey: shrQueryKeys.all, queryFn: shrApi.listConsents });
}

export function useRequestSHRConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: SHRConsentRequest) => shrApi.requestConsent(request),
    onSuccess: (visit) => queryClient.invalidateQueries({ queryKey: shrQueryKeys.all }),
  });
}
