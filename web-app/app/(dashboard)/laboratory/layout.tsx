import { Metadata } from 'next';
import { LabClinicianSocketProvider } from '@/components/laboratory/lab-clinician-socket-provider';
import { LaboratoryLicenseGate } from './license-gate';

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
    <LaboratoryLicenseGate>
      <LabClinicianSocketProvider>
        {children}
      </LabClinicianSocketProvider>
    </LaboratoryLicenseGate>
  );
}
