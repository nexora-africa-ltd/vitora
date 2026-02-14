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
  PiggyBank,
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
} from 'lucide-react';

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
}

export type NavItemType = NavItem | NavItemWithChildren;

export function hasChildren(item: NavItemType): item is NavItemWithChildren {
  return 'children' in item;
}

/**
 * Main navigation items displayed in the sidebar
 */
export const mainNavItems: NavItemType[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Check-in', href: '/patients/checkin', icon: UserCheck },
  { label: 'Patients', href: '/patients', icon: Users },
  { label: 'Triage', href: '/triage', icon: AlertTriangle },
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
    label: 'Theatre',
    icon: Scissors,
    children: [
      { label: 'Schedule', href: '/theatre/schedule', icon: CalendarDays },
      { label: 'Checklists', href: '/theatre/checklists', icon: CheckSquare },
      { label: 'Cases', href: '/theatre/cases', icon: ClipboardList },
      { label: 'Reports', href: '/theatre/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Finance',
    icon: PiggyBank,
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
