import type { ActionKey } from '@/lib/permissions/actions';
import type { ModuleKey } from '@/lib/permissions/constants';
import type { FacilityModules } from '@/lib/auth/context';
import type { NavItem, NavItemType } from '@/lib/config/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  BedDouble,
  BrainCircuit,
  Building2,
  CalendarCheck,
  CheckSquare,
  ClipboardList,
  Clock3,
  FlaskConical,
  ListOrdered,
  Microscope,
  Monitor,
  Pill,
  ScanLine,
  Siren,
  SquareDashedTopSolid,
  Stethoscope,
  Syringe,
  CheckCircle2,
  Users,
  FileText,
  Shield,
  TestTubes,
  Image as ImageIcon,
} from 'lucide-react';
import { ENABLE_AI } from '@/lib/utils/constants';

export interface ClinicalNavContext {
  canAccessModule: (module: ModuleKey) => boolean;
  canPerformAction: (action: ActionKey) => boolean;
  hasModule: (module: keyof FacilityModules) => boolean;
}

export interface ClinicalWorkflowItem {
  id: string;
  label: string;
  href: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  moduleKey?: ModuleKey;
  actionKey?: ActionKey;
  facilityModule?: keyof FacilityModules;
  isVisible: (ctx: ClinicalNavContext) => boolean;
}

export const clinicalWorkflowItems: ClinicalWorkflowItem[] = [
  {
    id: 'waiting-for-triage',
    label: 'Waiting for Triage',
    href: '/triage',
    description: 'Start from the live triage queue for patients who still need initial assessment.',
    icon: ListOrdered,
    moduleKey: 'triage',
    isVisible: (ctx) => ctx.canAccessModule('triage') && ctx.canPerformAction('triage.view_queue'),
  },
  {
    id: 'waiting-for-consult',
    label: 'Waiting for Consult',
    href: '/encounters?tab=queue',
    description: 'Open the consultation queue to claim patients who are ready for clinician review.',
    icon: ClipboardList,
    moduleKey: 'encounters',
    actionKey: 'encounters.create',
    facilityModule: 'outpatient',
    isVisible: (ctx) =>
      ctx.canAccessModule('encounters') &&
      ctx.hasModule('outpatient') &&
      ctx.canPerformAction('encounters.create'),
  },
  {
    id: 'in-progress',
    label: 'In Progress',
    href: '/encounters?tab=all&status=IN_PROGRESS',
    description: 'Continue active consultations and keep in-flight reviews moving without hunting by module.',
    icon: Activity,
    moduleKey: 'encounters',
    facilityModule: 'outpatient',
    isVisible: (ctx) => ctx.canAccessModule('encounters') && ctx.hasModule('outpatient'),
  },
  {
    id: 'pending-results',
    label: 'Pending Results',
    href: '/encounters?tab=all&status=RESULTS_PENDING',
    description: 'Return to encounters waiting on lab or imaging outputs before they can be closed.',
    icon: FlaskConical,
    moduleKey: 'encounters',
    facilityModule: 'outpatient',
    isVisible: (ctx) => ctx.canAccessModule('encounters') && ctx.hasModule('outpatient'),
  },
  {
    id: 'ready-to-close',
    label: 'Ready to Close',
    href: '/encounters?tab=all&status=READY_TO_CLOSE',
    description: 'Review completed workups and finish encounter closure tasks from a single bucket.',
    icon: CheckCircle2,
    moduleKey: 'encounters',
    facilityModule: 'outpatient',
    isVisible: (ctx) => ctx.canAccessModule('encounters') && ctx.hasModule('outpatient'),
  },
  {
    id: 'completed-today',
    label: 'Completed Today',
    href: '/encounters?tab=all&status=CLOSED&date=today',
    description: 'Audit the day’s completed encounters and pick up any follow-up actions before handover.',
    icon: Clock3,
    moduleKey: 'encounters',
    facilityModule: 'outpatient',
    isVisible: (ctx) => ctx.canAccessModule('encounters') && ctx.hasModule('outpatient'),
  },
];

export function resolveClinicalWorkflowItems(ctx: ClinicalNavContext): ClinicalWorkflowItem[] {
  return clinicalWorkflowItems.filter((item) => item.isVisible(ctx));
}

export const clinicalWorkflowHubNavItem: NavItem = {
  label: "Today's Queue",
  href: '/workflow/clinical',
  icon: Stethoscope,
  moduleKey: 'encounters' as ModuleKey,
};

export const myShiftsNavItem: NavItem = {
  label: 'My Shifts',
  href: '/scheduling/my-shifts',
  icon: CalendarCheck,
  moduleKey: 'scheduling' as ModuleKey,
  actionKey: 'scheduling.view_appointments' as ActionKey,
};

export function resolveClinicalSidebarItems(ctx: ClinicalNavContext): NavItem[] {
  const workflowItems = resolveClinicalWorkflowItems(ctx).map<NavItem>((item) => ({
    label: item.label,
    href: item.href,
    icon: item.icon,
    moduleKey: item.moduleKey,
    actionKey: item.actionKey,
    facilityModule: item.facilityModule,
  }));

  return [clinicalWorkflowHubNavItem, myShiftsNavItem, ...workflowItems];
}

/**
 * Utility items shown below the workflow buckets in clinical mode.
 * Gives clinicians quick access to modules they frequently need mid-consultation
 * without switching back to standard navigation.
 */
export function resolveClinicalUtilityItems(ctx: ClinicalNavContext): NavItemType[] {
  const items: NavItemType[] = [];

  // --- Patients ---
  if (ctx.canAccessModule('patients' as ModuleKey)) {
    items.push({
      label: 'Patients',
      href: '/patients',
      icon: Users,
      moduleKey: 'patients' as ModuleKey,
    });
  }

  // --- Emergency ---
  if (ctx.canAccessModule('emergency' as ModuleKey) && ctx.hasModule('emergency' as keyof FacilityModules)) {
    items.push({
      label: 'Emergency',
      href: '/emergency',
      icon: Siren,
      moduleKey: 'emergency' as ModuleKey,
      facilityModule: 'emergency' as keyof FacilityModules,
    });
  }

  // --- Inpatient ---
  if (ctx.canAccessModule('inpatient' as ModuleKey) && ctx.hasModule('inpatient' as keyof FacilityModules)) {
    const inpatientChildren: NavItem[] = [
      { label: 'Bed Board', href: '/inpatient/bed-board', icon: BedDouble, actionKey: 'inpatient.view_ward' as ActionKey },
      { label: 'Wards', href: '/wards', icon: Building2, actionKey: 'inpatient.view_ward' as ActionKey },
      { label: 'Admissions', href: '/admissions', icon: ClipboardList, actionKey: 'inpatient.view_admissions' as ActionKey },
      { label: 'Kardex', href: '/inpatient/kardex', icon: ClipboardList, actionKey: 'inpatient.view_kardex' as ActionKey },
      { label: 'Rounds', href: '/inpatient/rounds', icon: Stethoscope, actionKey: 'inpatient.make_rounds' as ActionKey },
      { label: 'Alerts', href: '/inpatient/alerts', icon: AlertTriangle, actionKey: 'inpatient.view_alerts' as ActionKey },
    ].filter((c) => !c.actionKey || ctx.canPerformAction(c.actionKey));
    if (inpatientChildren.length > 0) {
      items.push({
        label: 'Inpatient',
        icon: BedDouble,
        moduleKey: 'inpatient' as ModuleKey,
        facilityModule: 'inpatient' as keyof FacilityModules,
        children: inpatientChildren,
      });
    }
  }

  // --- Diagnostics (Lab + Imaging unified) ---
  const diagnosticsChildren: NavItem[] = [];
  if (ctx.canAccessModule('laboratory' as ModuleKey) && ctx.hasModule('laboratory' as keyof FacilityModules)) {
    const labItems: NavItem[] = [
      { label: 'Lab Orders', href: '/laboratory/orders', icon: SquareDashedTopSolid, moduleKey: 'laboratory' as ModuleKey, actionKey: 'laboratory.view_orders' as ActionKey },
      { label: 'Lab Validations', href: '/laboratory/validations', icon: CheckSquare, moduleKey: 'laboratory' as ModuleKey, actionKey: 'laboratory.verify_results' as ActionKey },
      { label: 'Test Catalog', href: '/laboratory/tests', icon: TestTubes, moduleKey: 'laboratory' as ModuleKey, actionKey: 'laboratory.view_dashboard' as ActionKey },
      { label: 'Lab Reports', href: '/laboratory/reports', icon: FileText, moduleKey: 'laboratory' as ModuleKey, actionKey: 'laboratory.view_reports' as ActionKey },
    ].filter((c) => !c.actionKey || ctx.canPerformAction(c.actionKey));
    diagnosticsChildren.push(...labItems);
  }
  if (ctx.canAccessModule('imaging' as ModuleKey) && ctx.hasModule('imaging' as keyof FacilityModules)) {
    const imagingItems: NavItem[] = [
      { label: 'Imaging Worklist', href: '/imaging/worklist', icon: ListOrdered, moduleKey: 'imaging' as ModuleKey, actionKey: 'imaging.view_orders' as ActionKey },
      { label
