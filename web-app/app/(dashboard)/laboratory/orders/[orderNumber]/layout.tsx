'use client';

import { useParams } from 'next/navigation';
import { PatientProvider } from '@/lib/context/patient-context';
import { useLabOrder } from '@/lib/hooks/use-laboratory';

/**
 * Wraps lab order detail sub-pages in PatientProvider.
 * Resolves patient ID from the lab order record so child components
 * (LabOrderDetail, result entry forms, etc.) have access to
 * usePatientContext() for allergy data, SHA status, and sensitivity flags.
 */
export default function LabOrderDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const orderNumber = params.orderNumber as string;
  const { data: order } = useLabOrder(orderNumber);

  return (
    <PatientProvider patientId={order?.patient ?? null}>
      {children}
    </PatientProvider>
  );
}
