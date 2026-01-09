/**
 * New Drug Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DrugForm } from '@/components/pharmacy/drug-form';

export default function NewDrugPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Add New Drug</h1>
          <p className="text-muted-foreground">
            Add a new drug to the catalog
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl">
        <DrugForm />
      </div>
    </div>
  );
}
