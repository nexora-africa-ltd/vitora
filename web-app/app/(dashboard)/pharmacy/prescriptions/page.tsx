/**
 * Prescriptions List Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Dedicated page for viewing all prescriptions.
 * Also accessible via the Prescriptions tab on /pharmacy
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PrescriptionsTable } from '@/components/pharmacy';
import { usePrescriptions, usePendingPrescriptions } from '@/lib/hooks/use-pharmacy';
import { PrescriptionStatus } from '@/lib/types/pharmacy';

export default function PrescriptionsPage() {
  const router = useRouter();

  // Prescriptions state
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PrescriptionStatus | ''>('');
  const [search, setSearch] = useState('');
  const pageSize = 20;

  // Data fetching
  const {
    data: prescriptionsData,
    isLoading,
    error,
  } = usePrescriptions({
    page,
    page_size: pageSize,
    status: status || undefined,
  });

  // Pending count for badge
  const { data: pendingData } = usePendingPrescriptions();
  const pendingCount = pendingData?.length || 0;

  // Calculate total pages
  const totalCount = prescriptionsData?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6" data-testid="prescriptions-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/pharmacy')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" />
              Prescriptions
              {pendingCount > 0 && (
                <span className="ml-2 bg-yellow-100 text-yellow-800 text-sm px-2 py-0.5 rounded-full">
                  {pendingCount} pending
                </span>
              )}
            </h1>
            <p className="text-muted-foreground">
              View and manage patient prescriptions
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/pharmacy/prescriptions/new">
            <Plus className="h-4 w-4 mr-2" />
            New Prescription
          </Link>
        </Button>
      </div>

      {/* Prescriptions Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Prescriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <PrescriptionsTable
            prescriptions={prescriptionsData?.results || []}
            isLoading={isLoading}
            error={error}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            onStatusFilter={setStatus}
            onSearch={setSearch}
          />
        </CardContent>
      </Card>
    </div>
  );
}
