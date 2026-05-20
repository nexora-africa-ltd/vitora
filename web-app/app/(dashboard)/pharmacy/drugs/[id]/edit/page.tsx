/**
 * Edit Drug/Item Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { DrugForm } from '@/components/pharmacy/drug-form';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/page-header';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { Drug } from '@/lib/types/pharmacy';

export default function EditDrugPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const drugId = parseInt(resolvedParams.id);

  const { data: drug, isLoading, error } = useQuery({
    queryKey: ['drug', drugId],
    queryFn: () => pharmacyApi.getDrug(drugId),
  });

  const handleSuccess = (updatedDrug: Drug) => {
    router.push(`/pharmacy/drugs/${updatedDrug.id}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="max-w-3xl mx-auto space-y-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error || !drug) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Item Not Found" />
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof Error ? error.message : 'Item not found'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const typeLabel = drug.item_type === 'REAGENT' ? 'Reagent' : drug.item_type === 'CONSUMABLE' ? 'Consumable' : 'Drug';

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Edit ${drug.generic_name}`}
        helpContent={`Update this ${typeLabel.toLowerCase()}'s details, categories, and inventory settings.`}
      />

      <div className="max-w-3xl mx-auto">
        <DrugForm
          drug={drug}
          onSuccess={handleSuccess}
          onCancel={() => router.push(`/pharmacy/drugs/${drug.id}`)}
        />
      </div>
    </div>
  );
}
