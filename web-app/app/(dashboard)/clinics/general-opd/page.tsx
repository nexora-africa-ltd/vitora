/**
 * General OPD Clinics Page
 *
 * Route: /clinics/general-opd
 */
'use client';

import { ClinicTypePage } from '@/components/clinics/clinic-type-page';

export default function GeneralOPDPage() {
  return (
    <ClinicTypePage
      title="General OPD"
      description="General outpatient and screening clinics"
      clinicTypes={['GENERAL_OPD', 'FILTER_CLINIC']}
    />
  );
}
