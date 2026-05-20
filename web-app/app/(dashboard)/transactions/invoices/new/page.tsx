/**
 * New Invoice Page
 * Create a new invoice for a patient
 */
'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
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
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Invoice"
        helpContent="Create a new invoice for a patient. Select the patient, add line items with services, and set a due date."
      />

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
