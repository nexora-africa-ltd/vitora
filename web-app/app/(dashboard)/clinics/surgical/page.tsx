/**
 * Surgical Clinic Page
 *
 * Route: /clinics/surgical
 */
'use client';

import { ClinicTypePage } from '@/components/clinics/clinic-type-page';

export default function SurgicalClinicPage() {
  return (
    <ClinicTypePage
      title="Surgical Clinic"
      description="Surgical outpatient and minor procedure services"
      clinicTypes={['SURGICAL']}
    />
  );
}
