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
} from 'lucide-react';

import {
  ENABLE_THEATRE,
  ENABLE_AI,
} from '@/lib/utils/constants';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export interface NavItemWithChildren {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
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
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Check-in', href: '/patients/checkin', icon: UserCheck },
  { label: 'Patients', href: '/patients', icon: Users },
  { label: 'Triage', href: '/triage', icon: AlertTriangle },
  { label: 'Emergency', href: '/emergency', icon: Siren },
  {
    label: 'Surveillance',
    icon: Flag,
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
    children: [
      { label: 'Registrations', href: '/mch', icon: ClipboardList },
      { label: 'Deliveries', href: '/mch/deliveries', icon: Venus },
      { label: 'Growth Charts', href: '/mch/growth', icon: BarChart3 },
      { label: 'Immunizations', href: '/mch/immunizations', icon: Syringe },
      { label: 'HEI Follow-up', href: '/mch/hei', icon: HeartPulse },
    ],
  },
  { label: 'Encounters', href: '/encounters', icon: Stethoscope },
  {
    label: 'Inpatient',
    icon: BedDouble,
    children: [
      { label: 'Wards', href: '/wards', icon: Building2 },
      { label: 'Admissions', href: '/admissions', icon: ClipboardList },
    ],
  },
  { label: 'Pharmacy', href: '/pharmacy', icon: Pill },
  {
    label: 'Diagnostics',
    icon: FlaskConical,
    children: [
      { label: 'Laboratory', href: '/laboratory', icon: Microscope },
      { label: 'Imaging', href: '/imaging', icon: ScanLine },
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
    children: [
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
