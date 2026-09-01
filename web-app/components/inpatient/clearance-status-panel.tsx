'use client';

import { useCallback } from 'react';
import { CheckCircle2, XCircle, Loader2, RefreshCcw, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useClearanceStatus } from '@/lib/hooks/use-inpatient';
import { useOptionalPatientContext } from '@/lib/context/patient-context';
import { useFacility } from '@/lib/context/facility-context';
import { useToast } from '@/lib/hooks/use-toast';
import type { DepartmentClearance } from '@/lib/types/inpatient';

interface ClearanceStatusPanelProps {
  admissionId: number;
}

function ClearanceRow({
  label,
  department,
  resolveHref,
  onResolveClick,
}: {
  label: string;
  department: DepartmentClearance | undefined;
  resolveHref?: string;
  onResolveClick?: (label: string, href: string) => void;
}) {
  if (!department) {
    return (
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${
        department.cleared
          ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
          : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {department.cleared ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
        ) : (
          <XCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="break-words text-xs text-muted-foreground">{department.reason}</p>
        </div>
      </div>
      <div className="ml-8 flex shrink-0 items-center gap-2 sm:ml-0">
        {department.cleared ? (
          <Badge
            variant="outline"
            className="border-green-300 bg-green-100 text-green-700 dark:border-green-700 dark:bg-green-900 dark:text-green-300"
          >
            Cleared
          </Badge>
        ) : (
          <>
            <Badge
              variant="outline"
              className="border-red-300 bg-red-100 text-red-700 dark:border-red-700 dark:bg-red-900 dark:text-red-300"
            >
              Pending
            </Badge>
            {resolveHref && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => onResolveClick?.(label, resolveHref)}
              >
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                <span className="hidden sm:inline">Resolve</span>
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ClearanceStatusPanel({ admissionId }: ClearanceStatusPanelProps) {
  const { data: clearance, isLoading, refetch, isFetching } = useClearanceStatus(admissionId);
  const patientContext = useOptionalPatientContext();
  const { hasModule } = useFacility();
  const { toast } = useToast();

  // Build search param from patient MRN or name for resolve links
  const patientSearchParam =
    patientContext?.patient?.mrn ||
    (patientContext?.patient
      ? `${patientContext.patient.first_name} ${patientContext.patient.last_name}`
      : '');
  const searchQuery = patientSearchParam ? `?search=${encodeURIComponent(patientSearchParam)}` : '';

  const handleResolveClick = useCallback(
    (label: string, href: string) => {
      window.open(href, '_blank', 'noopener,noreferrer');
      toast({
        title: `${label} opened in new tab`,
        description: 'Resolve the pending items, then refresh clearances here.',
      });
    },
    [toast]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              Department Clearances
            </CardTitle>
            <HelpPopover content="Clearances are checked automatically against each department's live records. Billing checks for outstanding invoices, pharmacy checks for undispensed prescriptions, laboratory checks for pending results, and nursing checks for active care plan entries." />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 px-2"
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            <span className="ml-1 hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                <Skeleton className="h-5 w-5 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ClearanceRow
                label="Billing"
                department={clearance?.billing}
                resolveHref={
                  clearance?.billing?.first_pending_id
                    ? `/transactions/invoices/${clearance.billing.first_pending_id}`
                    : `/transactions/invoices${searchQuery}`
                }
                onResolveClick={handleResolveClick}
              />
              {hasModule('pharmacy') && (
                <ClearanceRow
                  label="Pharmacy"
                  department={clearance?.pharmacy}
                  resolveHref={
                    clearance?.pharmacy?.first_pending_id
                      ? `/pharmacy/prescriptions/${clearance.pharmacy.first_pending_id}`
                      : `/pharmacy/prescriptions${searchQuery}`
                  }
                  onResolveClick={handleResolveClick}
                />
              )}
              {hasModule('laboratory') && (
                <ClearanceRow
                  label="Laboratory"
                  department={clearance?.laboratory}
                  resolveHref={
                    clearance?.laboratory?.first_pending_order_number
                      ? `/laboratory/orders/${clearance.laboratory.first_pending_order_number}`
                      : `/laboratory${searchQuery}`
                  }
                  onResolveClick={handleResolveClick}
                />
              )}
              <ClearanceRow
                label="Nursing"
                department={clearance?.nursing}
                resolveHref={`/admissions/${admissionId}?tab=nursing`}
                onResolveClick={handleResolveClick}
              />
            </div>
            {patientContext?.hasSHA && clearance?.billing && !clearance.billing.cleared && (
              <p className="mt-3 text-sm text-blue-600 dark:text-blue-400">
                This patient has SHA coverage. Ensure SHA claims are filed before clearing billing.
              </p>
            )}
            {clearance && !clearance.all_cleared && (
              <p className="mt-4 text-sm text-amber-600 dark:text-amber-400">
                ⚠️ All departments must be cleared before a normal discharge can be processed. Use
                the &ldquo;Resolve&rdquo; links to address pending items.
              </p>
            )}
            {clearance?.all_cleared && (
              <p className="mt-4 text-sm text-green-600 dark:text-green-400">
                ✓ All department clearances verified — ready for discharge.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
