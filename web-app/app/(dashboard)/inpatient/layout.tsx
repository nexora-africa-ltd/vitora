'use client';

import { LicenseGate } from '@/components/shared/license-gate';

export default function InpatientLayout({ children }: { children: React.ReactNode }) {
  return <LicenseGate feature="inpatient">{children}</LicenseGate>;
}
