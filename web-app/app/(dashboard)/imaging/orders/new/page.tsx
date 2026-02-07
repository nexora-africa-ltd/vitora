/**
 * New imaging order page.
 * Creates order from URL params (patient, encounter) or selection.
 */
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ImagingOrderForm } from '@/components/imaging';

export default function NewImagingOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get patient and encounter from URL params
  const patientId = searchParams.get('patient');
  const patientName = searchParams.get('patientName');
  const encounterId = searchParams.get('encounter');

  const handleSuccess = (orderNumber: string) => {
    router.push(`/imaging/orders/${orderNumber}`);
  };

  const handleCancel = () => {
    router.back();
  };

  // If no patient/encounter provided, show error
  if (!patientId || !encounterId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">New Imaging Order</h1>
          </div>
        </div>

        <Card className="border-destructive">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Missing Context</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              Imaging orders must be created from a patient encounter. Please navigate
              to a patient&apos;s encounter and click &quot;Order Imaging&quot; from there.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => router.push('/patients')}>
                Go to Patients
              </Button>
              <Button variant="outline" onClick={() => router.push('/encounters')}>
                Go to Encounters
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Imaging Order</h1>
          <p className="text-muted-foreground">
            Create a new imaging order for this encounter
          </p>
        </div>
      </div>

      {/* Order Form */}
      <ImagingOrderForm
        patientId={parseInt(patientId, 10)}
        patientName={patientName || undefined}
        encounterId={parseInt(encounterId, 10)}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />
    </div>
  );
}
