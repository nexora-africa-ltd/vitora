import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { signaturesApi } from '@/lib/api/certificates';
import type { CreateDocumentShareData } from '@/lib/types/security';

export const documentHubKeys = {
  all: ['document-hub'] as const,
  list: (params?: Record<string, unknown>) => [...documentHubKeys.all, 'list', params] as const,
  shares: (params?: Record<string, unknown>) => [...documentHubKeys.all, 'shares', params] as const,
};

export function useDocumentHub(params?: {
  tab?: 'mine' | 'shared' | 'signed' | 'pending';
  q?: string;
  document_type?: string;
  page?: number;
  page_size?: number;
}) {
  return useQuery({
    queryKey: documentHubKeys.list(params),
    queryFn: () => signaturesApi.listDocumentHub(params),
  });
}

export function useDocumentShares(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: documentHubKeys.shares(params),
    queryFn: () => signaturesApi.listDocumentShares(params),
  });
}

export function useShareDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDocumentShareData) => signaturesApi.shareDocument(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentHubKeys.all });
    },
  });
}

export function useRevokeDocumentShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shareId: number) => signaturesApi.revokeDocumentShare(shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentHubKeys.all });
    },
  });
}

export function useSignFromHub() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ document_type, document_id }: { document_type: string; document_id: number }) =>
      signaturesApi.sign({ document_type, document_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentHubKeys.all });
    },
  });
}
