/**
 * MCH / Welfare Clinics Page
 *
 * Route: /clinics/mch
 */
'use client';

import { ClinicTypePage } from '@/components/clinics/clinic-type-page';

export default function MCHPage() {
  return (
    <ClinicTypePage
      title="MCH / Welfare"
      description="Maternal and child health clinics including ANC, PNC, CWC, and Family Planning"
      clinicTypes={['ANC', 'PNC', 'CWC', 'FP', 'NUTRITION']}
    />
  );
}
