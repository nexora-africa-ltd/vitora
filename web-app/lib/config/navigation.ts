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
  SquareDashedTopSolid,
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
  ArrowLeftRight,
  TestTubes,
  Network,
  Fingerprint,
  Lock,
  BookCheck,
  Landmark,
  Hospital,
  Skull,
  Tag,
  Wallet,
  ShieldAlert,
  Package,
  Monitor,
  UserPlus,
} from 'lucide-react';

import {
  ENABLE_THEATRE,
  ENABLE_AI,
} from '@/lib/utils/constants';
import type { ModuleKey } from '@/lib/permissions/constants';
import type { ActionKey } from '@/lib/permissions/actions';
import type { FacilityModules } from '@/lib/auth/context';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** RBAC: required module permission key */
  moduleKey?: ModuleKey;
  /** Fine-grained action permission — hides this child if user lacks the action */
  actionKey?: ActionKey;
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
      { label: 'Queue', href: '/triage', icon: ListOrdered, actionKey: 'triage.view_queue' },
      { label: 'New Triage', href: '/triage/new', icon: Thermometer, actionKey: 'triage.assess' },
      { label: 'Reports', href: '/triage/reports', icon: BarChart3, actionKey: 'triage.view_reports' },
      { label: 'Settings', href: '/triage/settings', icon: Settings, actionKey: 'triage.manage_settings' },
    ],
  },
  {
    label: 'Emergency',
    icon: Siren,
    moduleKey: 'emergency',
    facilityModule: 'emergency',
    children: [
      { label: 'Dashboard', href: '/emergency', icon: LayoutDashboard, actionKey: 'emergency.view_dashboard' },
      { label: 'Bed Board', href: '/emergency/bed-board', icon: BedDouble, actionKey: 'emergency.view_bed_board' },
    ],
  },
  {
    label: 'Scheduling',
    icon: CalendarDays,
    moduleKey: 'scheduling',
    children: [
      { label: 'Overview', href: '/scheduling', icon: LayoutDashboard, actionKey: 'scheduling.view_appointments' },
      { label: 'Appointments', href: '/scheduling/appointments', icon: CalendarDays, actionKey: 'scheduling.view_appointments' },
      { label: 'New Appointment', href: '/scheduling/appointments/new', icon: UserPlus2, actionKey: 'scheduling.create_appointment' },
      { label: 'Schedules', href: '/scheduling/schedules', icon: Clock, actionKey: 'scheduling.view_schedules' },
      { label: 'Resources', href: '/scheduling/resources', icon: Settings, actionKey: 'scheduling.manage_schedules' },
      { label: 'Weekly Roster', href: '/scheduling/roster', icon: ChartNoAxesGantt, actionKey: 'scheduling.view_appointments' },
      { label: 'Duty Roster', href: '/scheduling/shifts', icon: ClipboardList, actionKey: 'scheduling.manage_schedules' },
      { label: 'Staff Workload', href: '/scheduling/workload', icon: BarChart3, actionKey: 'scheduling.view_appointments' },
      { label: 'My Shifts', href: '/scheduling/my-shifts', icon: UserCheck, actionKey: 'scheduling.view_appointments' },
      { label: 'Shift Swaps', href: '/scheduling/shift-swaps', icon: ArrowLeftRight, actionKey: 'scheduling.view_appointments' },
    ],
  },
  {
    label: 'Surveillance',
    icon: Flag,
    moduleKey: 'surveillance',
    children: [
      { label: 'Dashboard', href: '/surveillance', icon: LayoutDashboard, actionKey: 'surveillance.view_dashboard' },
      { label: 'Notifiable Cases', href: '/surveillance/cases', icon: AlertTriangle, actionKey: 'surveillance.report_case' },
      { label: 'Alerts', href: '/surveillance/alerts', icon: CircleAlert, actionKey: 'surveillance.view_alerts' },
      { label: 'IDSR Reports', href: '/surveillance/idsr', icon: BarChart3, actionKey: 'surveillance.submit_idsr' },
      { label: 'IHR Compliance', href: '/surveillance/ihr', icon: Globe, actionKey: 'surveillance.submit_ihr' },
      { label: 'Thresholds', href: '/surveillance/thresholds', icon: SquareActivity, actionKey: 'surveillance.manage_thresholds' },
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
      { label: 'Enrollments', href: '/clinics/enrollments', icon: ClipboardList, actionKey: 'clinics.manage_queue' },
    ],
  },
  {
    label: 'Immunizations',
    icon: Syringe,
    moduleKey: 'immunizations',
    children: [
      { label: 'Records', href: '/immunizations', icon: Syringe, actionKey: 'immunizations.view_records' },
      { label: 'Campaigns', href: '/immunizations/campaigns', icon: Target, actionKey: 'immunizations.manage_campaigns' },
      { label: 'AEFI Reports', href: '/immunizations/aefi', icon: ShieldAlert, actionKey: 'immunizations.view_records' },
      { label: 'Stock', href: '/immunizations/stock', icon: Package, actionKey: 'immunizations.manage_stock' },
      { label: 'Cold Chain', href: '/immunizations/cold-chain', icon: Thermometer, actionKey: 'immunizations.manage_cold_chain' },
      { label: 'Incidents', href: '/immunizations/incidents', icon: AlertTriangle, actionKey: 'immunizations.report_incident' },
      { label: 'Coverage', href: '/immunizations/coverage', icon: BarChart3, actionKey: 'immunizations.view_coverage' },
    ],
  },
  {
    label: 'MCH',
    icon: Baby,
    moduleKey: 'mch',
    facilityModule: 'maternity',
    children: [
      { label: 'Registrations', href: '/mch', icon: ClipboardList, actionKey: 'mch.register' },
      { label: 'Deliveries', href: '/mch/deliveries', icon: Venus, actionKey: 'mch.record_delivery' },
      { label: 'Growth Charts', href: '/mch/growth', icon: BarChart3, actionKey: 'mch.view_growth' },
      { label: 'Immunizations', href: '/mch/immunizations', icon: Syringe, actionKey: 'mch.immunize' },
      { label: 'HEI Follow-up', href: '/mch/hei', icon: HeartPulse, actionKey: 'mch.hei_followup' },
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
      { label: 'Referrals', href: '/referrals', icon: ArrowLeftRight, actionKey: 'encounters.refer' },
    ],
  },
  {
    label: 'Procedures',
    icon: Syringe,
    moduleKey: 'procedures',
    facilityModule: 'outpatient',
    children: [
      { label: 'Dashboard', href: '/procedures', icon: LayoutDashboard, actionKey: 'procedures.view_dashboard' },
      { label: 'Orders', href: '/procedures/orders', icon: SquareDashedTopSolid, actionKey: 'procedures.view_orders' },
      { label: 'Catalog', href: '/procedures/catalog', icon: Syringe, actionKey: 'procedures.view_catalog' },
      { label: 'Room Assignments', href: '/procedures/catalog/clinic-mappings', icon: Network, actionKey: 'procedures.view_catalog' },
    ],
  },
  {
    label: 'Inpatient',
    icon: BedDouble,
    moduleKey: 'inpatient',
    facilityModule: 'inpatient',
    children: [
      { label: 'Bed Board', href: '/inpatient/bed-board', icon: BedDouble, actionKey: 'inpatient.view_ward' },
      { label: 'Wards', href: '/wards', icon: Building2, actionKey: 'inpatient.view_ward' },
      { label: 'Admissions', href: '/admissions', icon: ClipboardList, actionKey: 'inpatient.view_admissions' },
      { label: 'Recommendations', href: '/admissions/recommendations', icon: ListOrdered, actionKey: 'inpatient.view_admissions' },
      { label: 'Handover', href: '/admissions/handover', icon: ArrowLeftRight, actionKey: 'inpatient.view_ward' },
      { label: 'Reviews', href: '/inpatient/reviews', icon: FileText, actionKey: 'inpatient.view_reviews' },
      { label: 'Kardex', href: '/inpatient/kardex', icon: ClipboardList, actionKey: 'inpatient.view_kardex' },
      { label: 'Rounds', href: '/inpatient/rounds', icon: Stethoscope, actionKey: 'inpatient.make_rounds' },
      { label: 'Supervisor Alerts', href: '/inpatient/alerts', icon: AlertTriangle, actionKey: 'inpatient.view_alerts' },
    ],
  },
  {
    label: 'Last Office',
    icon: Skull,
    moduleKey: 'last_office',
    children: [
      { label: 'Records', href: '/last-office', icon: ClipboardList, actionKey: 'last_office.view_records' },
      { label: 'Record Death', href: '/last-office/new', icon: Skull, actionKey: 'last_office.record_death' },
    ],
  },
  {
    label: 'Pharmacy',
    icon: Pill,
    moduleKey: 'pharmacy',
    facilityModule: 'pharmacy',
    children: [
      { label: 'Dashboard', href: '/pharmacy', icon: LayoutDashboard, actionKey: 'pharmacy.view_dashboard' },
      { label: 'Dispensing', href: '/pharmacy/dispensing', icon: FlaskConical, actionKey: 'pharmacy.dispense' },
      { label: 'Prescriptions', href: '/pharmacy/prescriptions', icon: FileText, actionKey: 'pharmacy.view_prescriptions' },
      { label: 'Drug Catalog', href: '/pharmacy/drugs', icon: Pill, actionKey: 'pharmacy.view_drugs' },
      { label: 'Stock Receive', href: '/pharmacy/stock/receive', icon: ClipboardList, actionKey: 'pharmacy.manage_stock' },
      { label: 'Adjustments', href: '/pharmacy/stock/adjustments', icon: Scale, actionKey: 'pharmacy.manage_stock' },
      { label: 'Reports', href: '/pharmacy/reports', icon: BarChart3, actionKey: 'pharmacy.view_reports' },
    ],
  },
  {
    label: 'Laboratory',
    icon: Microscope,
    moduleKey: 'laboratory',
    facilityModule: 'laboratory',
    children: [
      { label: 'Dashboard', href: '/laboratory', icon: LayoutDashboard, actionKey: 'laboratory.view_dashboard' },
      { label: 'Orders', href: '/laboratory/orders', icon: SquareDashedTopSolid, actionKey: 'laboratory.view_orders' },
      { label: 'Validations', href: '/laboratory/validations', icon: CheckSquare, actionKey: 'laboratory.verify_results' },
      { label: 'Test Catalog', href: '/laboratory/tests', icon: TestTubes, actionKey: 'laboratory.view_dashboard' },
      { label: 'Lab Reports', href: '/laboratory/reports', icon: FileText, actionKey: 'laboratory.view_reports' },
      { label: 'Lab Analytics', href: '/laboratory/analytics', icon: BarChart3, actionKey: 'laboratory.view_analytics' },
    ],
  },
  {
    label: 'Imaging',
    icon: ScanLine,
    moduleKey: 'imaging',
    facilityModule: 'imaging',
    children: [
      { label: 'Dashboard', href: '/imaging', icon: LayoutDashboard, actionKey: 'imaging.view_dashboard' },
      { label: 'Worklist', href: '/imaging/worklist', icon: ListOrdered, actionKey: 'imaging.view_orders' },
      { label: 'Imaging Orders', href: '/imaging/orders', icon: SquareDashedTopSolid, actionKey: 'imaging.view_orders' },
      { label: 'DICOM Studies', href: '/imaging/studies', icon: ImageIcon, actionKey: 'imaging.view_studies' },
    ],
  },
  {
    label: 'Allied Health',
    icon: HeartPlus,
    moduleKey: 'allied_health',
    children: [
      { label: 'Dashboard', href: '/allied-health', icon: LayoutDashboard, actionKey: 'allied_health.view_dashboard' },
      { label: 'Physiotherapy', href: '/allied-health/physiotherapy', icon: Dumbbell, actionKey: 'allied_health.assess_physio' },
      { label: 'Nutrition', href: '/allied-health/nutrition', icon: Apple, actionKey: 'allied_health.assess_nutrition' },
      { label: 'Occupational Therapy', href: '/allied-health/occupational-therapy', icon: HeartHandshake, actionKey: 'allied_health.assess_occupational' },
      { label: 'Social Work', href: '/allied-health/social-work', icon: UsersRound, actionKey: 'allied_health.counsel' },
      { label: 'Counselling', href: '/allied-health/counselling', icon: BookHeart, actionKey: 'allied_health.counsel' },
    ],
  },
  {
    label: 'Theatre',
    icon: Scissors,
    moduleKey: 'theatre',
    facilityModule: 'theatre',
    featureFlag: ENABLE_THEATRE,
    children: [
      { label: 'Overview', href: '/theatre', icon: LayoutDashboard, actionKey: 'theatre.view_schedule' },
      { label: 'Schedule', href: '/theatre/schedule', icon: CalendarDays, actionKey: 'theatre.view_schedule' },
      { label: 'Checklists', href: '/theatre/checklists', icon: CheckSquare, actionKey: 'theatre.view_checklists' },
      { label: 'Cases', href: '/theatre/cases', icon: SquareDashedTopSolid, actionKey: 'theatre.schedule_case' },
      { label: 'Anesthesia', href: '/theatre/anesthesia', icon: Syringe, actionKey: 'theatre.record_notes' },
      { label: 'Reports', href: '/theatre/reports', icon: BarChart3, actionKey: 'theatre.view_reports' },
      { label: 'Setup', href: '/theatre/settings', icon: Settings, actionKey: 'theatre.manage_settings' },
    ],
  },
  {
    label: 'Finance',
    icon: BadgeCent,
    moduleKey: 'billing',
    children: [
      { label: 'Dashboard', href: '/finance/overview', icon: ChartNoAxesGantt, actionKey: 'billing.view_dashboard' },
      { label: 'Invoices', href: '/transactions/invoices', icon: FileText, actionKey: 'billing.view_invoices' },
      { label: 'Proformas', href: '/transactions/proformas', icon: Clock, actionKey: 'billing.view_proformas' },
      { label: 'Payments', href: '/transactions/payments', icon: CreditCard, actionKey: 'billing.record_payment' },
      { label: 'Receipts', href: '/transactions/receipts', icon: Receipt, actionKey: 'billing.view_receipts' },
      { label: 'Credit Notes', href: '/transactions/credit-notes', icon: ScrollText, actionKey: 'billing.view_credit_notes' },
      { label: 'SHA Claims', href: '/transactions/sha-claims', icon: SHAIcon, actionKey: 'billing.submit_sha_claim' },
      { label: 'Insurance', href: '/insurance', icon: Shield, actionKey: 'billing.view_insurance' },
      { label: 'Reports', href: '/transactions/reports', icon: BarChart3, actionKey: 'billing.view_reports' },
      { label: 'Reconciliation', href: '/transactions/reconciliation', icon: Scale, actionKey: 'billing.reconcile' },
      { label: 'Services', href: '/finance/services', icon: Tag, actionKey: 'billing.view_dashboard' },
      { label: 'Payment Points', href: '/finance/payment-points', icon: Wallet, actionKey: 'billing.view_dashboard' },
      { label: 'Payments Config', href: '/finance/payments-config', icon: Settings, actionKey: 'billing.view_dashboard' },
    ],
  },
  {
    label: 'Inventory',
    icon: Package,
    moduleKey: 'inventory',
    facilityModule: 'inventory',
    children: [
      { label: 'Dashboard', href: '/inventory', icon: LayoutDashboard, actionKey: 'inventory.view_dashboard' },
      { label: 'Suppliers', href: '/inventory/suppliers', icon: Building2, actionKey: 'inventory.view_suppliers' },
      { label: 'Purchase Orders', href: '/inventory/purchase-orders', icon: FileText, actionKey: 'inventory.view_purchase_orders' },
      { label: 'Goods Receipt', href: '/inventory/goods-receipt', icon: ClipboardList, actionKey: 'inventory.view_goods_receipts' },
      { label: 'Store Locations', href: '/inventory/store-locations', icon: Hospital, actionKey: 'inventory.view_store_locations' },
      { label: 'Transfers', href: '/inventory/transfers', icon: ArrowLeftRight, actionKey: 'inventory.view_transfers' },
      { label: 'Ward Stock', href: '/inventory/ward-stock', icon: BedDouble, actionKey: 'inventory.view_ward_stock' },
      { label: 'Stock Counts', href: '/inventory/stock-counts', icon: ListOrdered, actionKey: 'inventory.view_stock_counts' },
      { label: 'eTIMS', href: '/inventory/etims', icon: Receipt, actionKey: 'inventory.view_etims' },
      { label: 'Forecasting', href: '/inventory/forecasting', icon: BarChart3, actionKey: 'inventory.view_forecasts' },
    ],
  },
  {
    label: 'Quality',
    icon: CheckSquare,
    moduleKey: 'quality',
    children: [
      { label: 'Dashboard', href: '/quality', icon: LayoutDashboard, actionKey: 'quality.view_dashboard' },
      { label: 'Measures', href: '/quality/measures', icon: Target, actionKey: 'quality.view_measures' },
      { label: 'Quarterly Reports', href: '/quality/reports/quarterly', icon: BarChart3, actionKey: 'quality.view_reports' },
      { label: 'Annual Reports', href: '/quality/reports/annual', icon: FileText, actionKey: 'quality.view_reports' },
    ],
  },
  {
    label: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
    moduleKey: 'analytics',
  },
  {
    label: 'MOH Reports',
    href: '/reports/moh',
    icon: ClipboardList,
    moduleKey: 'moh_reporting',
  },
  {
    label: 'CDS',
    icon: BrainCircuit,
    moduleKey: 'cds',
    children: [
      { label: 'Dashboard', href: '/cds', icon: LayoutDashboard, actionKey: 'cds.view_dashboard' },
      { label: 'Rules', href: '/cds/rules', icon: Shield, actionKey: 'cds.manage_rules' },
      { label: 'Alerts', href: '/cds/alerts', icon: AlertTriangle, actionKey: 'cds.view_alerts' },
    ],
  },
  {
    label: 'AI Assistant',
    href: '/ai',
    icon: BrainCircuit,
    moduleKey: 'ai',
    actionKey: 'ai.use_chat',
    featureFlag: ENABLE_AI,
  } as NavItem & { featureFlag?: boolean },
  {
    label: 'Admin',
    icon: ShieldUser,
    moduleKey: 'admin',
    children: [
      { label: 'Overview', href: '/admin/overview', icon: LayoutDashboard, actionKey: 'admin.view_overview' },
      { label: 'Organizations', href: '/admin/organizations', icon: Landmark, actionKey: 'admin.manage_departments' },
      { label: 'Facilities', href: '/admin/facilities', icon: Hospital, actionKey: 'admin.manage_departments' },
      { label: 'Departments', href: '/admin/departments', icon: Building2, actionKey: 'admin.manage_departments' },
      { label: 'Roles', href: '/admin/roles', icon: ShieldUser, actionKey: 'admin.manage_roles' },
      { label: 'Staff', href: '/admin/staff', icon: UserCog, actionKey: 'admin.manage_staff' },
      { label: 'Join Requests', href: '/admin/join-requests', icon: UserPlus, actionKey: 'admin.manage_staff' },
      { label: 'Audit Logs', href: '/admin/audit-logs', icon: ScrollText, actionKey: 'admin.view_audit_logs' },
      { label: 'Audit Integrity', href: '/admin/audit-integrity', icon: Fingerprint, actionKey: 'admin.view_audit_logs' },
      { label: 'Certificates', href: '/admin/certificates', icon: Lock, actionKey: 'admin.view_audit_logs' },
      { label: 'HL7 Messages', href: '/admin/hl7-messages', icon: Network, actionKey: 'admin.view_hl7_messages' },
      { label: 'KENHDD Compliance', href: '/admin/kenhdd-compliance', icon: BookCheck, actionKey: 'admin.view_audit_logs' },
      { label: 'Reports', href: '/reports', icon: FileText, actionKey: 'admin.view_reports' },
    ],
  },
  {
    label: 'Displays',
    href: '/displays',
    icon: Monitor,
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
