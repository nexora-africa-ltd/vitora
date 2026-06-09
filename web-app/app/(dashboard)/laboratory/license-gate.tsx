'use client';

import { LicenseGate } from '@/components/shared/license-gate';

export function LaboratoryLicenseGate({ children }: { children: React.ReactNode }) {
  return <LicenseGate feature="laboratory">{children}</LicenseGate>;
}
