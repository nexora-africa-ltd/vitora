'use client';

import { useCallback } from 'react';
import { usePermissions } from '@/lib/hooks/use-permissions';

const CREATE_ROUTE_PERMISSIONS: { prefix: string; permissions: string | string[] }[] = [
  { prefix: '/patients/new', permissions: 'patients.add_patient' },
  { prefix: '/encounters/new', permissions: 'encounters.add_encounter' },
  { prefix: '/triage/new', permissions: 'triage.add_triageassessment' },
  { prefix: '/pharmacy/drugs/new', permissions: 'pharmacy.add_drug' },
  { prefix: '/pharmacy/prescriptions/new', permissions: 'pharmacy.add_prescription' },
  { prefix: '/imaging/orders/new', permissions: 'imaging.add_imagingorder' },
  { prefix: '/imaging/equipment/new', permissions: 'imaging.add_imagingequipment' },
  { prefix: '/scheduling/appointments/new', permissions: 'scheduling.add_appointment' },
  { prefix: '/scheduling/shift-swaps/new', permissions: 'scheduling.add_shiftswaprequest' },
  { prefix: '/clinics/new', permissions: 'clinics.add_clinic' },
  { prefix: '/clinics/enrollments/new', permissions: 'clinics.add_clinicvisit' },
  { prefix: '/sick-notes/new', permissions: 'sick_notes.add_sicknote' },
  { prefix: '/referrals/new', permissions: 'referrals.add_clinicalreferral' },
  { prefix: '/surveillance/ihr/new', permissions: 'surveillance.add_ihrnotification' },
  { prefix: '/quality/measures/new', permissions: 'quality.add_qualitymeasure' },
  { prefix: '/procedures/orders/new', permissions: 'procedures.add_procedureorder' },
  { prefix: '/procedures/catalog/new', permissions: 'procedures.add_procedurecatalog' },
  { prefix: '/inventory/purchase-orders/new', permissions: 'inventory.add_purchaseorder' },
  { prefix: '/inventory/suppliers/new', permissions: 'inventory.add_supplier' },
  { prefix: '/inventory/store-locations/new', permissions: 'inventory.add_storelocation' },
  { prefix: '/inventory/transfers/new', permissions: 'inventory.add_stocktransfer' },
  { prefix: '/inventory/goods-receipt/new', permissions: 'inventory.add_goodsreceiptnote' },
  { prefix: '/inventory/stock-counts/new', permissions: 'inventory.add_stockcount' },
  { prefix: '/dialysis/orders/new', permissions: 'dialysis.add_dialysisorder' },
  { prefix: '/dialysis/accesses/new', permissions: 'dialysis.add_vascularaccess' },
  { prefix: '/dialysis/sessions/new', permissions: 'dialysis.add_dialysissession' },
  { prefix: '/blood-bank/donors/new', permissions: 'blood_bank.add_blooddonor' },
  { prefix: '/blood-bank/units/new', permissions: 'blood_bank.add_bloodunit' },
  { prefix: '/blood-bank/requests/new', permissions: 'blood_bank.add_bloodrequest' },
  { prefix: '/immunizations/aefi/new', permissions: 'immunizations.add_aefi' },
  { prefix: '/mch/new', permissions: 'mch.add_mchregistration' },
  { prefix: '/last-office/new', permissions: 'patients.add_deathrecord' },
  { prefix: '/theatre/cases/new', permissions: 'theatre.add_surgerycase' },
  { prefix: '/transactions/invoices/new', permissions: 'billing.add_invoice' },
  { prefix: '/transactions/preauths/new', permissions: 'insurance.add_insurancepreauthorization' },
  { prefix: '/transactions/supplier-bills/new', permissions: 'billing.add_supplierbill' },
  { prefix: '/wards/new', permissions: ['inpatient.add_ward', 'core.add_ward'] },
  { prefix: '/admissions/new', permissions: 'inpatient.add_admission' },
  { prefix: '/admissions/handover/new', permissions: 'inpatient.add_shifthandover' },
  {
    prefix: '/admissions/recommendations/new',
    permissions: 'inpatient.add_admissionrecommendation',
  },
  { prefix: '/insurance/providers/new', permissions: 'insurance.add_insuranceprovider' },
  { prefix: '/insurance/claims/new', permissions: 'insurance.add_insuranceclaim' },
  { prefix: '/insurance/enrollments/new', permissions: 'insurance.add_insuranceenrollment' },
  { prefix: '/allied-health/social-work/cases/new', permissions: 'social_work.add_socialworkcase' },
  {
    prefix: '/allied-health/social-work/referrals/new',
    permissions: 'social_work.add_socialworkreferral',
  },
  { prefix: '/allied-health/social-work/cases/', permissions: 'social_work.add_casenote' },
  {
    prefix: '/allied-health/counselling/referrals/new',
    permissions: 'counselling.add_counsellingreferral',
  },
  {
    prefix: '/allied-health/physiotherapy/orders/new',
    permissions: 'physiotherapy.add_physiotherapyorder',
  },
  {
    prefix: '/allied-health/occupational-therapy/orders/new',
    permissions: 'occupational_therapy.add_occupationaltherapyorder',
  },
  {
    prefix: '/allied-health/nutrition/consultations/new',
    permissions: 'nutrition.add_nutritionconsultation',
  },
  { prefix: '/allied-health/nutrition/diet-plans/new', permissions: 'nutrition.add_dietplan' },
  { prefix: '/laboratory/orders/new', permissions: 'laboratory.add_laborder' },
  { prefix: '/laboratory/tests/new', permissions: 'laboratory.add_testcatalog' },
  { prefix: '/laboratory/microbiology/new', permissions: 'laboratory.add_cultureresult' },
  { prefix: '/admin/organizations/new', permissions: 'core.add_organization' },
  { prefix: '/admin/departments/new', permissions: 'core.add_department' },
  { prefix: '/admin/facilities/new', permissions: 'core.add_facility' },
  { prefix: '/admin/roles/new', permissions: 'core.add_role' },
  { prefix: '/admin/staff/new', permissions: 'core.add_staffprofile' },
  { prefix: '/admin/subscription-plans/new', permissions: 'core.add_subscriptionplan' },
  { prefix: '/admin/organizations/', permissions: 'core.add_facility' },
  { prefix: '/cds/rules/new', permissions: 'cds.add_cdsrule' },
];

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function useCreateRouteAccess() {
  const { hasPermission } = usePermissions();

  return useCallback(
    (path: string): boolean => {
      const rule = CREATE_ROUTE_PERMISSIONS.find((item) => matches(path, item.prefix));
      if (!rule) return true;
      if (typeof rule.permissions === 'string') return hasPermission(rule.permissions);
      return rule.permissions.some((permission) => hasPermission(permission));
    },
    [hasPermission]
  );
}
