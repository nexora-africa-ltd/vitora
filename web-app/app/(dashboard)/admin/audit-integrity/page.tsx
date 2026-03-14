'use client';

import { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Hash,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { auditIntegrityApi } from '@/lib/api/audit-integrity';
import { toast } from 'sonner';
import type { AuditChainStatus, AuditIntegrityResult } from '@/lib/types/security';

export default function AuditIntegrityPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const queryClient = useQueryClient();
  const [verificationResult, setVerificationResult] = useState<AuditIntegrityResult | null>(null);

  const {
    data: chainStatus,
    isLoading,
    error,
  } = useQuery<AuditChainStatus>({
    queryKey: ['audit-chain-status'],
    queryFn: auditIntegrityApi.getChainStatus,
  });

  const verifyMutation = useMutation({
    mutationFn: auditIntegrityApi.verifyIntegrity,
    onSuccess: (result) => {
      setVerificationResult(result);
      queryClient.invalidateQueries({ queryKey: ['audit-chain-status'] });
      if (result.valid) {
        toast.success(`Chain verified — ${result.entries_checked} entries checked, all valid.`);
      } else {
        toast.error(`Chain integrity failure detected at sequence #${result.first_mismatch_seq}.`);
      }
    },
    onError: () => {
      toast.error('Failed to run integrity verification.');
    },
  });

  const hashCoverage = chainStatus
    ? chainStatus.total_entries > 0
      ? Math.round((chainStatus.entries_with_hashes / chainStatus.total_entries) * 100)
      : 100
    : 0;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Audit Chain Integrity"
          helpContent="Monitors the cryptographic hash chain on audit log entries. Detects tampering by verifying that each entry's hash correctly references its predecessor. DHA Compliance: Gap #31."
          actions={
            <Button
              onClick={() => verifyMutation.mutate()}
              disabled={verifyMutation.isPending}
              size="sm"
            >
              {verifyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Verify Now
            </Button>
          }
        />

        {/* Status Cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            <>
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="relative overflow-hidden">
                  <CardContent className="p-4">
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </>
          ) : error ? (
            <Card className="col-span-full">
              <CardContent className="p-6 text-center text-destructive">
                Failed to load chain status.
              </CardContent>
            </Card>
          ) : chainStatus ? (
            <>
              {/* Chain Health */}
              <Card className="relative overflow-hidden">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                  aria-hidden="true"
                />
                <CardContent className="relative p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    {chainStatus.last_verification_valid === null ? (
                      <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    ) : chainStatus.last_verification_valid ? (
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-destructive" />
                    )}
                    Chain Health
                  </div>
                  <div className="text-2xl font-bold">
                    {chainStatus.last_verification_valid === null ? (
                      <span className="text-muted-foreground">Unverified</span>
                    ) : chainStatus.last_verification_valid ? (
                      <span className="text-green-600">Valid</span>
                    ) : (
                      <span className="text-destructive">Tampered</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Total Entries */}
              <Card className="relative overflow-hidden">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                  aria-hidden="true"
                />
                <CardContent className="relative p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Hash className="h-4 w-4" />
                    Total Entries
                  </div>
                  <div className="text-2xl font-bold">
                    {chainStatus.total_entries.toLocaleString()}
                  </div>
                </CardContent>
              </Card>

              {/* Hash Coverage */}
              <Card className="relative overflow-hidden">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                  aria-hidden="true"
                />
                <CardContent className="relative p-4">
                  <div className="text-xs text-muted-foreground mb-1">Hash Coverage</div>
                  <div className="text-2xl font-bold">
                    {hashCoverage}%
                  </div>
                  {chainStatus.entries_without_hashes > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {chainStatus.entries_without_hashes} unhashed
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Tamper Alerts */}
              <Card className="relative overflow-hidden">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                  aria-hidden="true"
                />
                <CardContent className="relative p-4">
                  <div className="text-xs text-muted-foreground mb-1">Tamper Alerts</div>
                  <div className="text-2xl font-bold">
                    {chainStatus.tamper_alerts_count === 0 ? (
                      <span className="text-green-600">0</span>
                    ) : (
                      <span className="text-destructive">{chainStatus.tamper_alerts_count}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        {/* Verification Result */}
        {verificationResult && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {verificationResult.valid ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                Verification Result
                <Badge variant={verificationResult.valid ? 'default' : 'destructive'} className="ml-auto">
                  {verificationResult.valid ? 'PASSED' : 'FAILED'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Entries Checked</span>
                  <p className="font-medium">{verificationResult.entries_checked.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Checked At</span>
                  <p className="font-medium">
                    {new Date(verificationResult.checked_at).toLocaleString()}
                  </p>
                </div>
                {verificationResult.first_mismatch_seq !== null && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">First Mismatch</span>
                    <p className="font-medium text-destructive">
                      Sequence #{verificationResult.first_mismatch_seq}
                    </p>
                  </div>
                )}
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Details</span>
                <p className="font-mono text-xs mt-1 p-2 bg-muted rounded">
                  {verificationResult.details}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Chain Details */}
        {chainStatus && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Chain Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div className="flex justify-between sm:flex-col">
                  <span className="text-muted-foreground">Chain Length</span>
                  <span className="font-medium">{chainStatus.chain_length.toLocaleString()} entries</span>
                </div>
                <div className="flex justify-between sm:flex-col">
                  <span className="text-muted-foreground">Entries With Hashes</span>
                  <span className="font-medium">{chainStatus.entries_with_hashes.toLocaleString()}</span>
                </div>
                <div className="flex justify-between sm:flex-col">
                  <span className="text-muted-foreground">Entries Without Hashes</span>
                  <span className="font-medium">{chainStatus.entries_without_hashes.toLocaleString()}</span>
                </div>
                <div className="flex justify-between sm:flex-col">
                  <span className="text-muted-foreground">Last Verified</span>
                  <span className="font-medium">
                    {chainStatus.last_verified_at
                      ? new Date(chainStatus.last_verified_at).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PullToRefresh>
  );
}
