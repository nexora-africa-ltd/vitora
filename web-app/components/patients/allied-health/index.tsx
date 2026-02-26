'use client';

import { PatientPhysioOrders } from './patient-physio-orders';
import { PatientNutritionConsultations } from './patient-nutrition-consultations';
import { PatientCounsellingReferrals } from './patient-counselling-referrals';
import { PatientOTOrders } from './patient-ot-orders';
import { PatientSWReferrals } from './patient-sw-referrals';

interface PatientAlliedHealthTabProps {
  patientId: number;
}

/**
 * Patient Allied Health Tab
 * Shows all allied health orders, consultations, and referrals for a patient.
 * Used in the Patient Detail page.
 */
export function PatientAlliedHealthTab({ patientId }: PatientAlliedHealthTabProps) {
  return (
    <div className="space-y-4">
      {/* Physiotherapy */}
      <PatientPhysioOrders patientId={patientId} />

      {/* Nutrition */}
      <PatientNutritionConsultations patientId={patientId} />

      {/* Occupational Therapy */}
      <PatientOTOrders patientId={patientId} />

      {/* Counselling */}
      <PatientCounsellingReferrals patientId={patientId} />

      {/* Social Work */}
      <PatientSWReferrals patientId={patientId} />
    </div>
  );
}

// Export individual components for more granular use
export { PatientPhysioOrders } from './patient-physio-orders';
export { PatientNutritionConsultations } from './patient-nutrition-consultations';
export { PatientCounsellingReferrals } from './patient-counselling-referrals';
export { PatientOTOrders } from './patient-ot-orders';
export { PatientSWReferrals } from './patient-sw-referrals';
