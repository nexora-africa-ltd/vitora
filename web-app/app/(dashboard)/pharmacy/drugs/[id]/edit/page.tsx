/**
 * Edit Drug Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DrugForm } from '@/components/pharmacy/drug-form';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
    // Navigate back to detail page after successful update
    router.push(`/pharmacy/drugs/${updatedDrug.id}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="max-w-4xl space-y-6">
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (error || !drug) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof Error ? error.message : 'Drug not found'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

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
          <h1 className="text-2xl font-bold">Edit Drug</h1>
          <p className="text-muted-foreground">
            {drug.generic_name} ({drug.code})
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl">
        <DrugForm
          drug={drug}
          onSuccess={handleSuccess}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}
