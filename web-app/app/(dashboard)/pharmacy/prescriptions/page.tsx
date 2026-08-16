/**
 * Prescriptions List Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Dedicated page for viewing all prescriptions.
 * Also accessible via the Prescriptions tab on /pharmacy
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { PrescriptionsTable } from '@/components/pharmacy';
import { usePrescriptions, usePendingPrescriptions } from '@/lib/hooks/use-pharmacy';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { PrescriptionStatus } from '@/lib/types/pharmacy';

export default function PrescriptionsPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const canCreatePrescription = hasPermission('pharmacy.add_prescription');

  // Prescriptions state
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PrescriptionStatus | ''>('');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebounce(search, 300);
  const patientParam = searchParams.get('patient');
  const patientId = patientParam ? Number(patientParam) : undefined;
  const pageSize = 20;

  // Data fetching
  const {
    data: prescriptionsData,
    isLoading,
    error,
  } = usePrescriptions({
    page,
    page_size: pageSize,
    patient: Number.isFinite(patientId) ? patientId : undefined,
    status: status || undefined,
    search: debouncedSearch || undefined,
  });

  // Pending count for badge
  const { data: pendingData } = usePendingPrescriptions();
  const pendingCount = pendingData?.length || 0;
  const capabilities = prescriptionsData?.capabilities;
  const canCreateFromCapabilities =
    (capabilities?.pharmacy_enabled ?? true) &&
    (capabilities?.permissions.can_create_prescription ?? true);

  // Calculate total pages
  const totalCount = prescriptionsData?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6" data-testid="prescriptions-page">
        <PageHeader
          title="Prescriptions"
          helpContent="View and manage patient prescriptions. Search by patient name, MRN, or prescriber. Filter by status to find specific prescriptions."
          actions={
            <div className="flex items-center gap-3">
              {pendingCount > 0 && (
                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  {pendingCount} pending
                </Badge>
              )}
              {canCreatePrescription && canCreateFromCapabilities ? (
                <Button asChild className="w-full sm:w-auto">
                  <Link href="/pharmacy/prescriptions/new">
                    <Plus className="h-4 w-4 mr-2" />
                    New Prescription
                  </Link>
                </Button>
              ) : null}
            </div>
          }
        />

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="w-fit">
            Pharmacy: {capabilities?.pharmacy_enabled ? 'Enabled' : 'Disabled'}
          </Badge>
          <Badge variant="outline" className="w-fit">
            Dispense: {capabilities?.permissions.can_dispense ? 'Allowed' : 'Restricted'}
          </Badge>
          <Badge variant="outline" className="w-fit">
            Realtime: {capabilities?.realtime.websocket_enabled ? 'WebSocket On' : 'WebSocket Off'}
          </Badge>
        </div>

        <PrescriptionsTable
          prescriptions={prescriptionsData?.results || []}
          isLoading={isLoading}
          error={error}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          onPageChange={setPage}
          onStatusFilter={(s) => { setStatus(s); setPage(1); }}
          onSearch={(q) => { setSearch(q); setPage(1); }}
        />
      </div>
    </PullToRefresh>
  );
}
