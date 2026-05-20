/**
 * New Drug Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { DrugForm } from '@/components/pharmacy/drug-form';

export default function NewDrugPage() {
  const router = useRouter();

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
