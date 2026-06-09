'use client';

import { LicenseGate } from '@/components/shared/license-gate';

export default function InsuranceLayout({ children }: { children: React.ReactNode }) {
  return <LicenseGate feature="sha_claims">{children}</LicenseGate>;
}
