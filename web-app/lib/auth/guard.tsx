'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useFacility } from '@/lib/context/facility-context';
import type { FacilityModules } from '@/lib/auth/context';
import type { ModuleKey } from '@/lib/permissions/constants';
import type { ActionKey } from '@/lib/permissions/actions';

interface PermissionGuardProps {
  children: React.ReactNode;
  requiredPermission: string;
  fallback?: React.ReactNode;
}

/**
 * PermissionGuard checks if the user has the required permission.
 *
 * Note: Authentication is handled by middleware.ts (server-side redirect).
 * This component only handles permission-based access control.
 *
 * Uses usePermissions hook which properly handles:
 * - Superusers (bypass all permission checks)
 * - Admin roles (bypass all permission checks)
 * - Permission mapping (simple names to Django format)
 */
export function PermissionGuard({
  children,
  requiredPermission,
  fallback
}: PermissionGuardProps) {
  const { hasPermission, isAuthenticated } = usePermissions();

  // Check required permission (superusers/admins automatically pass)
  if (!isAuthenticated || !hasPermission(requiredPermission)) {
    return fallback ?? <AccessDenied />;
  }

  return <>{children}</>;
}

/**
 * Default access denied UI component
 */
function AccessDenied() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="mt-2 text-muted-foreground">
          You do not have permission to access this page.
        </p>
      </div>
    </div>
  );
}

/**
 * AuthGuard — redirects to /login when the user's session has expired.
 * Wraps the dashboard layout to force navigation on auth loss.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Redirect to login when session expires (e.g., desktop app restored from tray)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // Redirect to change-password when backend requires it (e.g., admin-generated credentials)
  useEffect(() => {
    if (!isLoading && isAuthenticated && mustChangePassword && pathname !== '/change-password') {
      router.replace('/change-password');
    }
  }, [isAuthenticated, isLoading, mustChangePassword, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}

// =============================================================================
// Route → Module mapping for RouteGuard
// =============================================================================

/**
 * Maps URL path prefixes to their required RBAC module key.
 * Routes not listed here are accessible to any authenticated user.
 * Order matters: more specific prefixes should come first.
 */
interface RouteAccessRequirement {
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

function pathStartsWith(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function hasRequiredPermission(
  pathname: string,
  rules: RoutePermissionRule[],
  hasPermission: (permission: string) => boolean,
): boolean {
  for (const rule of rules) {
    if (!pathStartsWith(pathname, rule.prefix)) continue;
    if (typeof rule.permissions === 'string') {
      return hasPermission(rule.permissions);
    }
    return rule.permissions.some((permission) => hasPermission(permission));
  }
  return true;
}

const ROUTE_ACCESS_MAP: [string, RouteAccessRequirement][] = [
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

/**
 * Resolve a pathname to its required ModuleKey, if any.
 */
export function getModuleForRoute(pathname: string): ModuleKey | null {
  for (const [prefix, requirement] of ROUTE_ACCESS_MAP) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return requirement.moduleKey ?? null;
    }
  }
  return null;
}

function getRouteAccessRequirement(pathname: string): RouteAccessRequirement | null {
  for (const [prefix, requirement] of ROUTE_ACCESS_MAP) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return requirement;
    }
  }
  return null;
}

interface RouteGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * RouteGuard protects pages by matching the current pathname to a required
 * RBAC module and blocking access when the user lacks that module permission.
 *
 * Wrap the dashboard layout (or individual page groups) so that navigating
 * to e.g. /pharmacy/* is denied for users whose role doesn't include the
 * pharmacy module.
 */
export function RouteGuard({ children, fallback }: RouteGuardProps) {
  const pathname = usePathname();
  const { canAccessModule, canPerformAction, hasPermission, isAuthenticated } = usePermissions();
  const { hasModule } = useFacility();

  if (!isAuthenticated) return <>{children}</>;

  const requirement = getRouteAccessRequirement(pathname);
  if (requirement?.moduleKey && !canAccessModule(requirement.moduleKey)) {
    return fallback ?? <AccessDenied />;
  }

  if (requirement?.facilityModule && !hasModule(requirement.facilityModule)) {
    return fallback ?? <AccessDenied />;
  }

  if (requirement?.actionKey && !canPerformAction(requirement.actionKey)) {
    return fallback ?? <AccessDenied />;
  }

  if (!hasRequiredPermission(pathname, ROUTE_VIEW_PERMISSION_RULES, hasPermission)) {
    return fallback ?? <AccessDenied />;
  }

  if (!hasRequiredPermission(pathname, ROUTE_CREATE_PERMISSION_RULES, hasPermission)) {
    return fallback ?? <AccessDenied />;
  }

  return <>{children}</>;
}
