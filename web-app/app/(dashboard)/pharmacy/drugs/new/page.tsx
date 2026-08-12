/**
 * New Drug Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { DrugForm } from '@/components/pharmacy/drug-form';
import { Card } from '@/components/ui/card';
import { usePermissions } from '@/lib/hooks/use-permissions';

export default function NewDrugPage() {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const canCreateDrug = hasPermission('pharmacy.add_drug');

  if (!canCreateDrug) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Add to Catalog" />
        <Card className="p-6 text-center">
          <p className="text-sm font-medium">Access denied</p>
          <p className="text-sm text-muted-foreground mt-1">
            You do not have permission to add catalog items.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Add to Catalog"
        helpContent="Add a medication, consumable, or reagent to the catalog. Choose the item type first, then fill in the relevant details."
      />

      <div className="max-w-3xl mx-auto">
        <DrugForm onCancel={() => router.push('/pharmacy?tab=drugs')} />
      </div>
    </div>
  );
}
