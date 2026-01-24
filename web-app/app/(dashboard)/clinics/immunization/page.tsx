/**
 * Immunization Clinic Page
 *
 * Route: /clinics/immunization
 */
'use client';

import { ClinicTypePage } from '@/components/clinics/clinic-type-page';

export default function ImmunizationPage() {
  return (
    <ClinicTypePage
      title="Immunization"
      description="Immunization and vaccination services"
      clinicTypes={['IMMUNIZATION']}
    />
  );
}
