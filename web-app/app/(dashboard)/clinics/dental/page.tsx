/**
 * Dental Clinic Page
 *
 * Route: /clinics/dental
 */
'use client';

import { ClinicTypePage } from '@/components/clinics/clinic-type-page';

export default function DentalClinicPage() {
  return (
    <ClinicTypePage
      title="Dental Clinic"
      description="Dental and oral health services"
      clinicTypes={['DENTAL']}
    />
  );
}
