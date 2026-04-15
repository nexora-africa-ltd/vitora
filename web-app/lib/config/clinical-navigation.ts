import type { ActionKey } from '@/lib/permissions/actions';
import type { ModuleKey } from '@/lib/permissions/constants';
import type { FacilityModules } from '@/lib/auth/context';
import type { NavItem, NavItemType } from '@/lib/config/navigation';
import {
  Activity,
  ArrowLeftRight,
  BrainCircuit,
  CalendarCheck,
  ClipboardList,
  Clock3,
  FlaskConical,
  ListOrdered,
  Monitor,
  Pill,
  Stethoscope,
  CheckCircle2,
  Users,
  Shield,
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

  // --- My Prescriptions (Rx I've ordered) ---
  if (ctx.canAccessModule('pharmacy' as ModuleKey) && ctx.hasModule('pharmacy' as keyof FacilityModules)) {
    items.push({
      label: 'My Prescriptions',
      href: '/pharmacy/prescriptions',
      icon: Pill,
      moduleKey: 'pharmacy' as ModuleKey,
      actionKey: 'pharmacy.view_prescriptions' as ActionKey,
    });
  }

  // --- Referrals ---
  if (ctx.canAccessModule('encounters' as ModuleKey) && ctx.canPerformAction('encounters.refer' as ActionKey)) {
    items.push({
      label: 'Referrals',
      href: '/referrals',
      icon: ArrowLeftRight,
      moduleKey: 'encounters' as ModuleKey,
      actionKey: 'encounters.refer' as ActionKey,
    });
  }

  // --- CDS Alerts ---
  if (ctx.canAccessModule('cds' as ModuleKey)) {
    items.push({
      label: 'CDS Alerts',
      href: '/cds/alerts',
      icon: Shield,
      moduleKey: 'cds' as ModuleKey,
      actionKey: 'cds.view_alerts' as ActionKey,
    });
  }

  // --- AI Assistant ---
  if (ENABLE_AI && ctx.canAccessModule('ai' as ModuleKey)) {
    items.push({
      label: 'AI Assistant',
      href: '/ai',
      icon: BrainCircuit,
      moduleKey: 'ai' as ModuleKey,
      actionKey: 'ai.use_chat' as ActionKey,
    });
  }

  // --- Displays ---
  items.push({
    label: 'Displays',
    href: '/displays',
    icon: Monitor,
  });

  return items;
}
