'use client';

import Link from 'next/link';
import { CheckCircle2, XCircle, Loader2, RefreshCcw, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useClearanceStatus } from '@/lib/hooks/use-inpatient';
import type { DepartmentClearance } from '@/lib/types/inpatient';

interface ClearanceStatusPanelProps {
  admissionId: number;
}

function ClearanceRow({
  label,
  department,
  resolveHref,
}: {
  label: string;
  department: DepartmentClearance | undefined;
  resolveHref?: string;
}) {
  if (!department) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
        department.cleared
          ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
          : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {department.cleared ? (
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
        ) : (
          <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{department.reason}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {department.cleared ? (
          <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-300 dark:border-green-700">
            Cleared
          </Badge>
        ) : (
          <>
            <Badge variant="outline" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-red-300 dark:border-red-700">
              Pending
            </Badge>
            {resolveHref && (
              <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                <Link href={resolveHref}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  <span className="hidden sm:inline">Resolve</span>
                </Link>
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
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
          <div className="grid gap-3 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
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
            <div className="grid gap-3 md:grid-cols-2">
              <ClearanceRow
                label="Billing"
                department={clearance?.billing}
                resolveHref={
                  clearance?.billing?.first_pending_id
                    ? `/billing/invoices/${clearance.billing.first_pending_id}`
                    : `/billing/invoices?admission=${admissionId}`
                }
              />
              <ClearanceRow
                label="Pharmacy"
                department={clearance?.pharmacy}
                resolveHref={
                  clearance?.pharmacy?.first_pending_id
                    ? `/pharmacy/prescriptions/${clearance.pharmacy.first_pending_id}`
                    : `/pharmacy/prescriptions?admission=${admissionId}`
                }
              />
              <ClearanceRow
                label="Laboratory"
                department={clearance?.laboratory}
                resolveHref={
                  clearance?.laboratory?.first_pending_order_number
                    ? `/laboratory/orders/${clearance.laboratory.first_pending_order_number}`
                    : `/laboratory/orders?admission=${admissionId}`
                }
              />
              <ClearanceRow
                label="Nursing"
                department={clearance?.nursing}
                resolveHref={`/admissions/${admissionId}?tab=nursing`}
              />
            </div>
            {clearance && !clearance.all_cleared && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-4">
                ⚠️ All departments must be cleared before a normal discharge can be processed. Use the &ldquo;Resolve&rdquo; links to address pending items.
              </p>
            )}
            {clearance?.all_cleared && (
              <p className="text-sm text-green-600 dark:text-green-400 mt-4">
                ✓ All department clearances verified — ready for discharge.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
