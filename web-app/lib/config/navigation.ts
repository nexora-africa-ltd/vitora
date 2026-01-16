/**
 * Navigation Configuration
 * Centralized nav items for the sidebar
 */

import {
  LayoutDashboard,
  Users,
  Stethoscope,
  FileText,
  Pill,
  FlaskConical,
  CreditCard,
  Settings,
  AlertTriangle,
  BedDouble,
  Building2,
  ClipboardList,
  Microscope,
  ScanLine,
  ShieldUser,
  UserCog,
  ScrollText,
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
  { label: 'Patients', href: '/patients', icon: Users },
  { label: 'Triage', href: '/triage', icon: AlertTriangle },
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
    ],
  },
  { label: 'Billing & Insurance', href: '/billing', icon: CreditCard },
  { label: 'Reports', href: '/reports', icon: FileText },
  { 
    label: 'Admin', 
    icon: ShieldUser,
    children: [
      { label: 'Departments', href: '/admin/departments', icon: Building2 },
      { label: 'Roles', href: '/admin/roles', icon: ShieldUser },
      { label: 'Staff', href: '/admin/staff', icon: UserCog },
      { label: 'Audit Logs', href: '/admin/audit-logs', icon: ScrollText },
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
