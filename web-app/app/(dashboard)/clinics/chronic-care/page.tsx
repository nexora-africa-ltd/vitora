/**
 * Chronic Care Clinics Page
 *
 * Route: /clinics/chronic-care
 */
'use client';

import { ClinicTypePage } from '@/components/clinics/clinic-type-page';

export default function ChronicCarePage() {
  return (
    <ClinicTypePage
      title="Chronic Care"
      description="CCC (HIV), Diabetic, Hypertension, TB, Mental Health, and other chronic care clinics"
      clinicTypes={['CCC', 'TB', 'DIABETIC', 'HYPERTENSION', 'MENTAL_HEALTH', 'ONCOLOGY', 'DIALYSIS']}
    />
  );
}
