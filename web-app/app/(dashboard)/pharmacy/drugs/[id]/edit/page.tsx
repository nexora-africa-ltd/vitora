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
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { Drug } from '@/lib/types/pharmacy';
import { usePermissions } from '@/lib/hooks/use-permissions';

export default function EditDrugPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const drugId = parseInt(resolvedParams.id);
  const { hasPermission } = usePermissions();
  const canEditDrug = hasPermission('pharmacy.change_drug');
  const { data: bootstrap } = useQuery({
    queryKey: ['pharmacy-bootstrap'],
    queryFn: pharmacyApi.getBootstrap,
  });
  const canManageCatalog = bootstrap?.permissions.can_manage_catalog ?? true;
  const hasEditCatalogAccess = canEditDrug && canManageCatalog;

  const {
    data: drug,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['drug', drugId],
    queryFn: () => pharmacyApi.getDrug(drugId),
    enabled: hasEditCatalogAccess,
  });

  const handleSuccess = (updatedDrug: Drug) => {
    router.push(`/pharmacy/drugs/${updatedDrug.id}`);
  };

  if (!hasEditCatalogAccess) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Edit Item" />
        <Card className="p-6 text-center">
          <p className="text-sm font-medium">Access denied</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You do not have permission to edit catalog items.
          </p>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="mx-auto max-w-3xl space-y-4">
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

  const typeLabel =
    drug.item_type === 'REAGENT'
      ? 'Reagent'
      : drug.item_type === 'CONSUMABLE'
        ? 'Consumable'
        : 'Drug';

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Edit ${drug.generic_name}`}
        helpContent={`Update this ${typeLabel.toLowerCase()}'s details, categories, and inventory settings.`}
      />

      <div className="mx-auto max-w-3xl">
        <DrugForm
          drug={drug}
          onSuccess={handleSuccess}
          onCancel={() => router.push(`/pharmacy/drugs/${drug.id}`)}
        />
      </div>
    </div>
  );
}
