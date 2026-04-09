/**
 * New Invoice Page
 * Create a new invoice for a patient
 */
'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { InvoiceForm } from '@/components/billing/InvoiceForm';
import { EligibilityBanner } from '@/components/billing/sha';
import { useCreateInvoice, useServices } from '@/lib/hooks/billing';
import { usePatients } from '@/lib/hooks/use-patients';
import { useToast } from '@/lib/hooks/use-toast';
import type { InvoiceCreateData } from '@/lib/types/billing';

export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const createInvoice = useCreateInvoice();

  const patientIdFromUrl = searchParams.get('patient');
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(
    patientIdFromUrl ? parseInt(patientIdFromUrl) : null
  );

  const { isLoading: patientsLoading } = usePatients();
  const { data: patientsData } = usePatients();
  const { data: servicesData, isLoading: servicesLoading } = useServices();

  const handleSubmit = async (data: InvoiceCreateData) => {
    try {
      const invoice = await createInvoice.mutateAsync(data);
      if (!invoice) {
        toast({ title: 'Invoice created', description: 'Saved locally — will sync when online.' });
        router.push('/transactions/invoices');
        return;
      }
      toast({
        title: 'Invoice created',
        description: `Invoice ${invoice.invoice_number} has been created.`,
      });
      router.push(`/transactions/invoices/${invoice.id}`);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create invoice. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const isLoading = patientsLoading || servicesLoading;

  const patients =
    patientsData?.results?.map((p) => ({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      mrn: p.mrn,
    })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Invoice</h1>
          <p className="text-muted-foreground">Create a new invoice for a patient</p>
        </div>
      </div>

      {selectedPatientId && (
        <EligibilityBanner patientId={selectedPatientId} compact />
      )}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <InvoiceForm
          patients={patients}
          services={servicesData?.results || []}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isLoading={createInvoice.isPending}
          onPatientChange={(patientId) => setSelectedPatientId(patientId)}
          initialPatient={selectedPatientId || undefined}
        />
      )}
    </div>
  );
}
