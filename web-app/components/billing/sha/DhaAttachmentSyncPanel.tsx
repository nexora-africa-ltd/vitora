'use client';

import React from 'react';
import { Loader2, Paperclip, RefreshCw, UploadCloud } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { shaApi } from '@/lib/api/sha';

interface DhaAttachmentSyncPanelProps {
  claimId: number;
  claimUpdatedAt?: string;
  onSynced?: () => void;
}

export function DhaAttachmentSyncPanel({
  claimId,
  claimUpdatedAt,
  onSynced,
}: DhaAttachmentSyncPanelProps) {
  const queryClient = useQueryClient();
  const {
    data: syncStatus,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['sha-claim-dha-attachment-sync-status', claimId, claimUpdatedAt],
    queryFn: () => shaApi.ilmAttachmentSyncStatus(claimId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const matched = syncStatus?.matched ?? 0;
  const total = syncStatus?.total ?? 0;
  const synced = !!syncStatus?.all_matched;

  const refreshSyncAndDischargePanel = React.useCallback(async () => {
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['discharge-local-attachments', claimId] });
    onSynced?.();
  }, [claimId, onSynced, queryClient, refetch]);

  const pushMutation = useMutation({
    mutationFn: () => shaApi.ilmPushLocalAttachments(claimId),
    onSuccess: async (result) => {
      if (result.failed > 0) {
        toast.warning(
          `Uploaded ${result.uploaded} attachment(s); ${result.failed} failed. Check panel details.`
        );
      } else {
        toast.success(`Uploaded ${result.uploaded} attachment(s) to DHA.`);
      }
      queryClient.invalidateQueries({
        queryKey: ['sha-claim-dha-attachment-sync-status', claimId],
      });
      queryClient.invalidateQueries({
        queryKey: ['sha-claim-dha-attachment-sync-status-checklist', claimId],
      });
      queryClient.invalidateQueries({ queryKey: ['discharge-local-attachments', claimId] });
      await refreshSyncAndDischargePanel();
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { error?: string; message?: string } }; message?: string })
          ?.response?.data?.error ||
        (error as { response?: { data?: { error?: string; message?: string } }; message?: string })
          ?.response?.data?.message ||
        (error as { message?: string })?.message ||
        'Failed to push local attachments to DHA.';
      toast.error(message);
    },
  });

  if (synced && total > 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">DHA attachment sync</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void refreshSyncAndDischargePanel();
            }}
            disabled={isFetching || pushMutation.isPending}
          >
            {isFetching ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" />
            )}
            Check
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1 rounded border px-2 py-1">
            <Paperclip className="h-3.5 w-3.5" />
            Matched: {matched}/{total}
          </span>
        </div>

        {synced ? (
          <Alert>
            <AlertTitle>Attachments synced</AlertTitle>
            <AlertDescription>
              {matched}/{total} local files have strict type/name matches on DHA upload history.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <AlertTitle>DHA is missing attachments</AlertTitle>
            <AlertDescription>
              {matched}/{total} local files matched. Upload remaining attachments before discharge.
            </AlertDescription>
          </Alert>
        )}

        {!synced && total > 0 && (
          <Button
            type="button"
            onClick={() => pushMutation.mutate()}
            disabled={pushMutation.isPending || isFetching}
          >
            {pushMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="mr-2 h-4 w-4" />
            )}
            4. Upload local attachments to DHA
          </Button>
        )}

        {Array.isArray(syncStatus?.missing) && syncStatus.missing.length > 0 && (
          <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50/60 p-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {syncStatus.missing.slice(0, 8).map((item) => (
              <p key={`${item.attachment_id}`}>
                Missing on DHA: {item.attachment_name} ({item.attachment_type})
              </p>
            ))}
          </div>
        )}

        {pushMutation.data?.errors && pushMutation.data.errors.length > 0 && (
          <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50/60 p-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {pushMutation.data.errors.map((err, idx) => (
              <p key={`${err.attachment_id}-${idx}`}>
                {err.attachment_name}: {err.error}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
