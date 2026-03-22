'use client';

import { useParams } from 'next/navigation';
import { PatientProvider } from '@/lib/context/patient-context';
import { useInvoice } from '@/lib/hooks/billing';

/**
 * Wraps invoice detail sub-pages in PatientProvider.
 * Resolves patient ID from the invoice record so all child components
 * (InvoiceDetail, PaymentForm, SHAClaimForm, etc.) share a single
 * cached patient fetch and have access to usePatientContext().
 */
export default function InvoiceDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const invoiceId = Number(params.id);
  const { data: invoice } = useInvoice(invoiceId);

  return (
    <PatientProvider patientId={invoice?.patient ?? null}>
      {children}
    </PatientProvider>
  );
}
