/**
 * Eye Clinic Page
 *
 * Route: /clinics/eye
 */
'use client';

import { ClinicTypePage } from '@/components/clinics/clinic-type-page';

export default function EyeClinicPage() {
  return (
    <ClinicTypePage
      title="Eye Clinic"
      description="Ophthalmology and eye care services"
      clinicTypes={['EYE']}
    />
  );
}
