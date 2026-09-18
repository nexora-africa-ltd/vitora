// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Shared route-access rules for client-side guards and sidebar filtering.
 *
 * Usage:
 * - Import `isStandardRouteAllowed(pathname, evaluators)` for non-LIS profiles.
 * - Import `isLISStandaloneRouteAllowed(pathname, evaluators)` for LIS standalone profiles.
 *
 * Inputs:
 * - pathname: current route path (e.g. `/admin/staff`).
 * - evaluators: callbacks for module/action/facility/permission checks.
 */

import type { FacilityModules } from '@/lib/auth/context';
import type { ModuleKey } from '@/lib/permissions/constants';
import type { ActionKey } from '@/lib/permissions/actions';

export interface RouteAccessRequirement {
  moduleKey?: ModuleKey;
  facilityModule?: keyof FacilityModules;
  actionKey?: ActionKey;
}

type RoutePermissionRule = {
  prefix: string;
  permissions: string | string[];
};

const ROUTE_VIEW_PERMISSION_RULES: RoutePermissionRule[] = [
  { prefix: '/admin', permissions: 'core.view_staffprofile' },
  { prefix: '/patients', permissions: 'patients.view_patient' },
  { prefix: '/encounters', permissions: 'encounters.view_encounter' },
  { prefix: '/triage', permissions: 'triage.view_triageassessment' },
  { prefix: '/pharmacy', permissions: 'pharmacy.view_prescription' },
  { prefix: '/laboratory', permissions: 'laboratory.view_laborder' },
  { prefix: '/imaging', permissions: 'imaging.view_imagingorder' },
  { prefix: '/scheduling', permissions: 'scheduling.view_appointment' },
  { prefix: '/inventory', permissions: 'inventory.view_purchaseorder' },
  { prefix: '/quality', permissions: 'quality.view_qualitymeasure' },
  { prefix: '/referrals', permissions: 'referrals.view_clinicalreferral' },
  { prefix: '/sick-notes', permissions: 'sick_notes.view_sicknote' },
  { prefix: '/surveillance', permissions: 'surveillance.view_notifiablecase' },
  { prefix: '/clinics', permissions: 'clinics.view_clinic' },
  { prefix: '/procedures', permissions: 'procedures.view_procedureorder' },
  { prefix: '/dialysis', permissions: 'dialysis.view_dialysissession' },
  { prefix: '/blood-bank', permissions: 'blood_bank.view_bloodunit' },
  { prefix: '/inpatient', permissions: 'inpatient.view_admission' },
  { prefix: '/admissions', permissions: 'inpatient.view_admission' },
  { prefix: '/wards', permissions: ['inpatient.view_ward', 'core.view_ward'] },
  { prefix: '/theatre', permissions: 'scheduling.view_schedule' },
  { prefix: '/immunizations', permissions: 'immunizations.view_immunizationrecord' },
  { prefix: '/insurance', permissions: 'billing.view_invoice' },
  { prefix: '/transactions', permissions: 'billing.view_invoice' },
  { prefix: '/finance', permissions: 'billing.view_invoice' },
  { prefix: '/analytics', permissions: 'analytics.view_facilitydailysummary' },
  { prefix: '/allied-health', permissions: 'physiotherapy.view_physiotherapyorder' },
  { prefix: '/last-office', permissions: 'patients.view_deathrecord' },
  { prefix: '/mch', permissions: 'mch.view_mchregistration' },
  { prefix: '/cds', permissions: 'cds.view_cdsrule' },
];

const ROUTE_CREATE_PERMISSION_RULES: RoutePermissionRule[] = [
  { prefix: '/patients/new', permissions: 'patients.add_patient' },
  { prefix: '/encounters/new', permissions: 'encounters.add_encounter' },
  { prefix: '/triage/new', permissions: 'triage.add_triageassessment' },
  { prefix: '/pharmacy/drugs/new', permissions: 'pharmacy.add_drug' },
  { prefix: '/pharmacy/prescriptions/new', permissions: 'pharmacy.add_prescription' },
  { prefix: '/imaging/orders/new', permissions: 'imaging.add_imagingorder' },
  { prefix: '/imaging/equipment/new', permissions: 'imaging.add_imagingequipment' },
  { prefix: '/scheduling/appointments/new', permissions: 'scheduling.add_appointment' },
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
  { prefix: '/blood-bank/crossmatch/new', permissions: 'blood_bank.add_crossmatch' },
  { prefix: '/immunizations/aefi/new', permissions: 'immunizations.add_aefi' },
  { prefix: '/mch/new', permissions: 'mch.add_mchregistration' },
  { prefix: '/last-office/new', permissions: 'patients.add_deathrecord' },
  { prefix: '/theatre/cases/new', permissions: 'theatre.add_surgerycase' },
  { prefix: '/transactions/invoices/new', permissions: 'billing.add_invoice' },
  { prefix: '/transactions/supplier-bills/new', permissions: 'billing.add_supplierbill' },
  { prefix: '/wards/new', permissions: ['inpatient.add_ward', 'core.add_ward'] },
  { prefix: '/admissions/new', permissions: 'inpatient.add_admission' },
  { prefix: '/insurance/providers/new', permissions: 'insurance.add_insuranceprovider' },
  { prefix: '/insurance/claims/new', permissions: 'insurance.add_insuranceclaim' },
  { prefix: '/insurance/enrollments/new', permissions: 'insurance.add_insuranceenrollment' },
  { prefix: '/admin/organizations/new', permissions: 'core.add_organization' },
  { prefix: '/admin/departments/new', permissions: 'core.add_department' },
  { prefix: '/admin/facilities/new', permissions: 'core.add_facility' },
  { prefix: '/admin/roles/new', permissions: 'core.add_role' },
  { prefix: '/admin/staff/new', permissions: 'core.add_staffprofile' },
  { prefix: '/admin/subscription-plans/new', permissions: 'core.add_subscriptionplan' },
];

export const STANDARD_ROUTE_ACCESS_MAP: [string, RouteAccessRequirement][] = [
  ['/document-hub', { actionKey: 'core.view_document_hub' }],
  ['/pharmacy', { moduleKey: 'pharmacy', facilityModule: 'pharmacy' }],
  ['/laboratory', { moduleKey: 'laboratory', facilityModule: 'laboratory' }],
  ['/imaging', { moduleKey: 'imaging', facilityModule: 'imaging' }],
  ['/billing', { moduleKey: 'billing', facilityModule: 'billing' }],
  ['/admissions', { moduleKey: 'inpatient', facilityModule: 'inpatient' }],
  ['/wards', { moduleKey: 'inpatient', facilityModule: 'inpatient' }],
  ['/inpatient', { moduleKey: 'inpatient', facilityModule: 'inpatient' }],
  ['/blood-bank', { moduleKey: 'blood_bank', facilityModule: 'blood_bank' }],
  ['/dialysis', { moduleKey: 'dialysis', facilityModule: 'dialysis' }],
  ['/allied-health', { moduleKey: 'allied_health', facilityModule: 'allied_health' }],
  ['/procedures', { moduleKey: 'procedures', facilityModule: 'procedures' }],
  ['/scheduling', { moduleKey: 'scheduling', facilityModule: 'scheduling' }],
  ['/inventory', { moduleKey: 'inventory', facilityModule: 'inventory' }],
  ['/immunizations', { moduleKey: 'immunizations', facilityModule: 'immunizations' }],
  ['/quality', { moduleKey: 'quality', facilityModule: 'quality' }],
  ['/cds', { moduleKey: 'cds', facilityModule: 'cds' }],
  ['/analytics', { moduleKey: 'analytics', facilityModule: 'analytics' }],
  ['/referrals', { moduleKey: 'referrals' }],
  ['/sick-notes', { actionKey: 'sick_notes.view' }],
  ['/last-office', { moduleKey: 'last_office' }],
  ['/reports/moh', { moduleKey: 'moh_reporting', facilityModule: 'moh_reporting' }],
  ['/transactions', { moduleKey: 'billing' }],
  ['/finance', { moduleKey: 'billing' }],
  ['/insurance', { moduleKey: 'billing', facilityModule: 'private_insurance' }],
  ['/encounters', { moduleKey: 'encounters', facilityModule: 'outpatient' }],
  ['/triage', { moduleKey: 'triage', facilityModule: 'outpatient' }],
  ['/emergency', { moduleKey: 'emergency', facilityModule: 'emergency' }],
  ['/surveillance', { moduleKey: 'surveillance' }],
  ['/clinics', { moduleKey: 'clinics' }],
  ['/theatre', { moduleKey: 'theatre', facilityModule: 'theatre' }],
  ['/mch', { moduleKey: 'mch', facilityModule: 'maternity' }],
  ['/ai', { actionKey: 'ai.use_chat' }],
  ['/admin', { moduleKey: 'admin' }],
  ['/patients', { moduleKey: 'patients' }],
];

export const LIS_STANDALONE_ROUTE_ACCESS_MAP: [string, RouteAccessRequirement][] = [
  ['/patients/new', { moduleKey: 'patients', actionKey: 'patients.create' }],
  ['/laboratory/orders/new', { moduleKey: 'laboratory', actionKey: 'lis.create_standalone_order' }],
  [
    '/inventory/purchase-orders/new',
    { moduleKey: 'inventory', actionKey: 'inventory.manage_procurement' },
  ],
  ['/inventory/goods-receipt/new', { moduleKey: 'inventory', actionKey: 'inventory.manage_procurement' }],
  ['/patients', { moduleKey: 'patients' }],
  ['/laboratory', { moduleKey: 'laboratory', facilityModule: 'laboratory' }],
  ['/inventory', { moduleKey: 'inventory', facilityModule: 'inventory' }],
  ['/admin/overview', { moduleKey: 'admin', actionKey: 'admin.view_overview' }],
  ['/admin/facilities', { moduleKey: 'admin', actionKey: 'admin.manage_departments' }],
  ['/admin/departments', { moduleKey: 'admin', actionKey: 'admin.manage_departments' }],
  ['/admin/roles', { moduleKey: 'admin', actionKey: 'admin.manage_roles' }],
  ['/admin/staff', { moduleKey: 'admin', actionKey: 'admin.manage_staff' }],
  ['/admin/hwr-lookup', { moduleKey: 'admin', actionKey: 'admin.manage_staff' }],
  ['/admin/facility-lookup', { moduleKey: 'admin', actionKey: 'admin.manage_departments' }],
  ['/admin/audit-logs', { moduleKey: 'admin', actionKey: 'admin.view_audit_logs' }],
  ['/admin/audit-integrity', { moduleKey: 'admin', actionKey: 'admin.view_audit_logs' }],
  ['/notifications', {}],
  ['/settings', {}],
];

const LIS_STANDALONE_BLOCKED_PREFIXES = [
  '/patients/checkin',
  '/transactions',
  '/finance',
  '/admin/join-requests',
  '/admin/emergency-access',
];

function matchesRoute(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function getRouteAccessRequirement(
  pathname: string,
  map: [string, RouteAccessRequirement][]
): RouteAccessRequirement | null {
  for (const [prefix, requirement] of map) {
    if (matchesRoute(pathname, prefix)) {
      return requirement;
    }
  }
  return null;
}

function hasRequiredPermission(
  pathname: string,
  rules: RoutePermissionRule[],
  hasPermission: (permission: string) => boolean
): boolean {
  for (const rule of rules) {
    if (!matchesRoute(pathname, rule.prefix)) continue;
    if (typeof rule.permissions === 'string') return hasPermission(rule.permissions);
    return rule.permissions.some((permission) => hasPermission(permission));
  }
  return true;
}

function passesRouteAccessRequirement(
  requirement: RouteAccessRequirement,
  evaluators: {
    canAccessModule: (moduleKey: ModuleKey) => boolean;
    hasModule: (module: keyof FacilityModules) => boolean;
    canPerformAction: (actionKey: ActionKey) => boolean;
  }
): boolean {
  if (requirement.moduleKey && !evaluators.canAccessModule(requirement.moduleKey)) return false;
  if (requirement.facilityModule && !evaluators.hasModule(requirement.facilityModule)) return false;
  if (requirement.actionKey && !evaluators.canPerformAction(requirement.actionKey)) return false;
  return true;
}

export function getStandardRouteAccessRequirement(pathname: string): RouteAccessRequirement | null {
  return getRouteAccessRequirement(pathname, STANDARD_ROUTE_ACCESS_MAP);
}

export function getLISStandaloneRouteAccessRequirement(
  pathname: string
): RouteAccessRequirement | null {
  if (LIS_STANDALONE_BLOCKED_PREFIXES.some((prefix) => matchesRoute(pathname, prefix))) {
    return null;
  }
  return getRouteAccessRequirement(pathname, LIS_STANDALONE_ROUTE_ACCESS_MAP);
}

export function isStandardRouteAllowed(
  pathname: string,
  evaluators: {
    canAccessModule: (moduleKey: ModuleKey) => boolean;
    hasModule: (module: keyof FacilityModules) => boolean;
    canPerformAction: (actionKey: ActionKey) => boolean;
    hasPermission: (permission: string) => boolean;
  }
): boolean {
  const requirement = getStandardRouteAccessRequirement(pathname);
  if (requirement && !passesRouteAccessRequirement(requirement, evaluators)) return false;
  if (!hasRequiredPermission(pathname, ROUTE_VIEW_PERMISSION_RULES, evaluators.hasPermission)) {
    return false;
  }
  if (!hasRequiredPermission(pathname, ROUTE_CREATE_PERMISSION_RULES, evaluators.hasPermission)) {
    return false;
  }
  return true;
}

export function isLISStandaloneRouteAllowed(
  pathname: string,
  evaluators: {
    canAccessModule: (moduleKey: ModuleKey) => boolean;
    hasModule: (module: keyof FacilityModules) => boolean;
    canPerformAction: (actionKey: ActionKey) => boolean;
  }
): boolean {
  const requirement = getLISStandaloneRouteAccessRequirement(pathname);
  if (!requirement) return false;
  return passesRouteAccessRequirement(requirement, evaluators);
}
