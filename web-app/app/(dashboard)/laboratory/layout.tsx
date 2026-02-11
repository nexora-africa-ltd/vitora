import { Metadata } from 'next';
import { LabClinicianSocketProvider } from '@/components/laboratory/lab-clinician-socket-provider';

export const metadata: Metadata = {
  title: 'Laboratory | Vitora HMIS',
  description: 'Laboratory management and test results',
};

export default function LaboratoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LabClinicianSocketProvider>
      {children}
    </LabClinicianSocketProvider>
  );
}
