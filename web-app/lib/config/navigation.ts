/**
 * Navigation Configuration
 * Centralized nav items for the sidebar
 */

import { SHAIcon } from '@/components/ui/sha-logo';
import {
  LayoutDashboard,
  Users,
  Stethoscope,
  FileText,
  Pill,
  FlaskConical,
  CreditCard,
  BadgeCent,
  ChartNoAxesGantt,
  Settings,
  AlertTriangle,
  BedDouble,
  Building2,
  ClipboardList,
  Microscope,
  ScanLine,
  Scissors,
  CalendarDays,
  BarChart3,
  CheckSquare,
  ShieldUser,
  UserCog,
  ScrollText,
  Receipt,
  Scale,
  Shield,
  Clock,
  Activity,
  Baby,
  Eye,
  HeartPulse,
  Syringe,
  Stethoscope as StethoscopeIcon,
  UserCheck,
  Image as ImageIcon,
  Siren,
  Flag,
  CircleAlert,
  SquareActivity,
  Target,
  Globe,
  // Allied Health icons
  Dumbbell,
  Apple,
  BookHeart,
  UsersRound,
  HeartPlus,
  HeartHandshake,
  Venus,
  BrainCircuit,
  Thermometer,
  UserPlus2,
  ListOrdered,
} from 'lucide-react';

import {
  ENABLE_THEATRE,
  ENABLE_AI,
} from '@/lib/utils/constants';
import type { ModuleKey } from '@/lib/permissions/constants';
import type { FacilityModules } from '@/lib/auth/context';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** RBAC: required module permission key */
  moduleKey?: ModuleKey;
  /** Capability: required facility module */
  facilityModule?: keyof FacilityModules;
  badge?: number;
}

export interface NavItemWithChildren {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** RBAC: required module permission key */
  moduleKey?: ModuleKey;
  /** Capability: required facility module */
  facilityModule?: keyof FacilityModules;
  children: NavItem[];
  /** When set, the item is only included if the flag is true. */
  featureFlag?: boolean;
}

export type NavItemType = NavItem | NavItemWithChildren;

export function hasChildren(item: NavItemType): item is NavItemWithChildren {
  return 'children' in item;
}

/**
 * All navigation items (unfiltered). Feature-gated items filtered below.
 */
const _allNavItems: NavItemType[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, moduleKey: 'dashboard' },
  { label: 'Check-in', href: '/patients/checkin', icon: UserCheck, moduleKey: 'checkin' },
  {
    label: 'Patients',
    icon: Users,
    moduleKey: 'patients',
    children: [
      { label: 'All Patients', href: '/patients', icon: Users },
      { label: 'New Patient', href: '/patients/new', icon: UserPlus2 },
    ],
  },
  {
    label: 'Triage',
    icon: Thermometer,
    moduleKey: 'triage',
    children: [
      { label: 'Queue', href: '/triage', icon: ListOrdered },
      { label: 'New Triage', href: '/triage/new', icon: Thermometer },
      { label: 'Reports', href: '/triage/reports', icon: BarChart3 },
      { label: 'Settings', href: '/triage/settings', icon: Settings },
    ],
  },
  {
    label: 'Emergency',
    icon: Siren,
    moduleKey: 'emergency',
    facilityModule: 'emergency',
    children: [
      { label: 'Dashboard', href: '/emergency', icon: LayoutDashboard },
      { label: 'Bed Board', href: '/emergency/bed-board', icon: BedDouble },
    ],
  },
  {
    label: 'Surveillance',
    icon: Flag,
    moduleKey: 'surveillance',
    children: [
      { label: 'Dashboard', href: '/surveillance', icon: LayoutDashboard },
      { label: 'Notifiable Cases', href: '/surveillance/cases', icon: AlertTriangle },
      { label: 'Alerts', href: '/surveillance/alerts', icon: CircleAlert },
      { label: 'IDSR Reports', href: '/surveillance/idsr', icon: BarChart3 },
      { label: 'IHR Compliance', href: '/surveillance/ihr', icon: Globe },
      { label: 'Thresholds', href: '/surveillance/thresholds', icon: SquareActivity },
    ],
  },
  {
    label: 'Clinics',
    icon: Activity,
    moduleKey: 'clinics',
    facilityModule: 'outpatient',
    children: [
      { label: 'All Clinics', href: '/clinics', icon: Building2 },
      { label: 'General OPD', href: '/clinics/general-opd', icon: StethoscopeIcon },
      { label: 'MCH / Welfare', href: '/clinics/mch', icon: Baby },
      { label: 'Eye Clinic', href: '/clinics/eye', icon: Eye },
      { label: 'Dental Clinic', href: '/clinics/dental', icon: Activity },
      { label: 'Surgical Clinic', href: '/clinics/surgical', icon: Scissors },
      { label: 'Chronic Care', href: '/clinics/chronic-care', icon: HeartPulse },
      { label: 'Immunization', href: '/clinics/immunization', icon: Syringe },
    ],
  },
  {
    label: 'MCH',
    icon: Baby,
    facilityModule: 'maternity',
    children: [
      { label: 'Registrations', href: '/mch', icon: ClipboardList },
      { label: 'Deliveries', href: '/mch/deliveries', icon: Venus },
      { label: 'Growth Charts', href: '/mch/growth', icon: BarChart3 },
      { label: 'Immunizations', href: '/mch/immunizations', icon: Syringe },
      { label: 'HEI Follow-up', href: '/mch/hei', icon: HeartPulse },
    ],
  },
  {
    label: 'Encounters',
    icon: Stethoscope,
    moduleKey: 'encounters',
    facilityModule: 'outpatient',
    children: [
      { label: 'All Encounters', href: '/encounters', icon: Stethoscope },
      { label: 'New Encounter', href: '/encounters/new', icon: ClipboardList },
    ],
  },
  {
    label: 'Inpatient',
    icon: BedDouble,
    moduleKey: 'inpatient',
    facilityModule: 'inpatient',
    children: [
      { label: 'Wards', href: '/wards', icon: Building2 },
      { label: 'Admissions', href: '/admissions', icon: ClipboardList },
      { label: 'Reviews', href: '/inpatient/reviews', icon: FileText },
      { label: 'Kardex', href: '/inpatient/kardex', icon: ClipboardList },
      { label: 'Rounds', href: '/inpatient/rounds', icon: Stethoscope },
      { label: 'Supervisor Alerts', href: '/inpatient/alerts', icon: AlertTriangle },
    ],
  },
  {
    label: 'Pharmacy',
    icon: Pill,
    moduleKey: 'pharmacy',
    facilityModule: 'pharmacy',
    children: [
      { label: 'Dashboard', href: '/pharmacy', icon: LayoutDashboard },
      { label: 'Dispensing', href: '/pharmacy/dispensing', icon: FlaskConical },
      { label: 'Prescriptions', href: '/pharmacy/prescriptions', icon: FileText },
      { label: 'Drug Catalog', href: '/pharmacy/drugs', icon: Pill },
      { label: 'Stock Receive', href: '/pharmacy/stock/receive', icon: ClipboardList },
      { label: 'Reports', href: '/pharmacy/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Laboratory',
    icon: Microscope,
    moduleKey: 'laboratory',
    facilityModule: 'laboratory',
    children: [
      { label: 'Dashboard', href: '/laboratory', icon: LayoutDashboard },
      { label: 'Lab Reports', href: '/laboratory/reports', icon: FileText },
      { label: 'Lab Analytics', href: '/laboratory/analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Imaging',
    icon: ScanLine,
    moduleKey: 'imaging',
    facilityModule: 'imaging',
    children: [
      { label: 'Dashboard', href: '/imaging', icon: LayoutDashboard },
      { label: 'Imaging Orders', href: '/imaging/orders', icon: ClipboardList },
      { label: 'DICOM Studies', href: '/imaging/studies', icon: ImageIcon },
    ],
  },
  {
    label: 'Allied Health',
    icon: HeartPlus,
    children: [
      { label: 'Dashboard', href: '/allied-health', icon: LayoutDashboard },
      { label: 'Physiotherapy', href: '/allied-health/physiotherapy', icon: Dumbbell },
      { label: 'Nutrition', href: '/allied-health/nutrition', icon: Apple },
      { label: 'Occupational Therapy', href: '/allied-health/occupational-therapy', icon: HeartHandshake },
      { label: 'Social Work', href: '/allied-health/social-work', icon: UsersRound },
      { label: 'Counselling', href: '/allied-health/counselling', icon: BookHeart },
    ],
  },
  {
    label: 'Theatre',
    icon: Scissors,
    moduleKey: 'theatre',
    facilityModule: 'theatre',
    featureFlag: ENABLE_THEATRE,
    children: [
      { label: 'Schedule', href: '/theatre/schedule', icon: CalendarDays },
      { label: 'Checklists', href: '/theatre/checklists', icon: CheckSquare },
      { label: 'Cases', href: '/theatre/cases', icon: ClipboardList },
      { label: 'Reports', href: '/theatre/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Finance',
    icon: BadgeCent,
    moduleKey: 'billing',
    children: [
      { label: 'Dashboard', href: '/finance/overview', icon: ChartNoAxesGantt },
      { label: 'Invoices', href: '/transactions/invoices', icon: FileText },
      { label: 'Proformas', href: '/transactions/proformas', icon: Clock },
      { label: 'Payments', href: '/transactions/payments', icon: CreditCard },
      { label: 'Receipts', href: '/transactions/receipts', icon: Receipt },
      { label: 'SHA Claims', href: '/transactions/sha-claims', icon: SHAIcon },
      { label: 'Insurance', href: '/insurance', icon: Shield },
      { label: 'Reports', href: '/transactions/reports', icon: BarChart3 },
      { label: 'Reconciliation', href: '/transactions/reconciliation', icon: Scale },
    ],
  },
  {
    label: 'Quality',
    icon: CheckSquare,
    children: [
      { label: 'Dashboard', href: '/quality', icon: LayoutDashboard },
      { label: 'Measures', href: '/quality/measures', icon: Target },
      { label: 'Quarterly Reports', href: '/quality/reports/quarterly', icon: BarChart3 },
      { label: 'Annual Reports', href: '/quality/reports/annual', icon: FileText },
    ],
  },
  {
    label: 'CDS',
    icon: BrainCircuit,
    children: [
      { label: 'Dashboard', href: '/cds', icon: LayoutDashboard },
      { label: 'Rules', href: '/cds/rules', icon: Shield },
      { label: 'Alerts', href: '/cds/alerts', icon: AlertTriangle },
    ],
  },
  {
    label: 'AI Assistant',
    href: '/ai',
    icon: BrainCircuit,
    featureFlag: ENABLE_AI,
  } as NavItem & { featureFlag?: boolean },
  {
    label: 'Admin',
    icon: ShieldUser,
    moduleKey: 'admin',
    children: [
      { label: 'Overview', href: '/admin/overview', icon: LayoutDashboard },
      { label: 'Departments', href: '/admin/departments', icon: Building2 },
      { label: 'Roles', href: '/admin/roles', icon: ShieldUser },
      { label: 'Staff', href: '/admin/staff', icon: UserCog },
      { label: 'Audit Logs', href: '/admin/audit-logs', icon: ScrollText },
      { label: 'Reports', href: '/reports', icon: FileText },
    ],
  },
];

/**
 * Filtered navigation items — items gated by disabled feature flags are excluded.
 */
export const mainNavItems: NavItemType[] = _allNavItems.filter((item) => {
  if ('featureFlag' in item && item.featureFlag === false) {
    return false;
  }
  return true;
});

/**
 * Bottom navigation items (Settings, etc.)
 */
export const bottomNavItems: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: Settings },
];

/**
 * Get all parent labels that have children (for auto-expand logic)
 */
export function getParentLabels(): string[] {
  return mainNavItems
    .filter(hasChildren)
    .map(item => item.label);
}

/**
 * Find parent label for a given path
 */
export function findParentForPath(pathname: string): string | null {
  for (const item of mainNavItems) {
    if (hasChildren(item)) {
      const isChildActive = item.children.some(
        child => pathname === child.href || pathname.startsWith(`${child.href}/`)
      );
      if (isChildActive) {
        return item.label;
      }
    }
  }
  return null;
}
