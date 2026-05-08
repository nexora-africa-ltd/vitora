'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  memo,
} from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  ChevronLeft,
  ChevronDown,
  ChevronsDownUp,
  LogOut,
  Pin,
  Stethoscope,
  User,
  X,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { usePeekPanelStore } from '@/lib/stores/peek-panel-store';
import { VitoraLogo } from '@/components/ui/vitora-logo';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ScrollMoreButton } from '@/components/ui/scroll-more-button';
import { useLogout } from '@/lib/auth/hooks';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { usePatientJourneyStore } from '@/lib/stores/patient-journey';
import { calculateAge } from '@/lib/utils/format';
import {
  bottomNavItems,
  hasChildren,
  findParentForPath,
  type NavItem,
  type NavItemType,
  type NavItemWithChildren,
} from '@/lib/config/navigation';
import { useNavigationItems } from '@/lib/hooks/use-navigation-items';
import { useSidebarBadges, type SidebarBadges } from '@/lib/hooks/use-sidebar-badges';

const SIDEBAR_COLLAPSED_KEY = 'vitora-sidebar-collapsed';
const SIDEBAR_OPEN_MENUS_KEY = 'vitora-sidebar-open-menus';
const SIDEBAR_SCROLL_KEY = 'vitora-sidebar-scroll';

interface SidebarProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface NavLinkProps {
  item: NavItem;
  isChild?: boolean;
  collapsed: boolean;
  pathname: string;
  searchParamsString: string;
  onMobileClose: () => void;
  badgeCounts?: SidebarBadges;
}

interface NavGroupProps {
  item: NavItemWithChildren;
  collapsed: boolean;
  pathname: string;
  isOpen: boolean;
  onToggle: () => void;
  badgeCounts?: SidebarBadges;
  onMobileClose: () => void;
}

// -----------------------------------------------------------------------------
// Logo Component
// -----------------------------------------------------------------------------

function SidebarLogo({ collapsed }: { collapsed: boolean }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Default to light mode (dark logo) until mounted and theme resolved
  const isDark = mounted && resolvedTheme === 'dark';

  // Show placeholder during SSR/hydration
  if (!mounted) {
    return (
      <div className={cn(
        'flex items-center',
        collapsed ? 'justify-center' : 'w-full'
      )}>
        {collapsed ? (
          <div className="h-12 w-12 rounded-md bg-muted animate-pulse" />
        ) : (
          <div className="h-12 w-full rounded bg-muted animate-pulse" />
        )}
      </div>
    );
  }

  if (collapsed) {
    return (
      <VitoraLogo
        variant="icon"
        tone={isDark ? 'light' : 'dark'}
        alt="Vitora"
        className="mx-auto w-full max-w-[2.75rem]"
        priority
      />
    );
  }

  return (
    <VitoraLogo
      tone={isDark ? 'light' : 'dark'}
      alt="Vitora HMIS"
      className="w-full max-w-[11.5rem]"
      priority
    />
  );
}

// -----------------------------------------------------------------------------
// Hooks
// -----------------------------------------------------------------------------

function useSidebarPersistence(
  collapsed: boolean,
  onCollapse: (collapsed: boolean) => void
) {
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored !== null) onCollapse(stored === 'true');
  }, [onCollapse]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);
}

function useIsActive(href: string, pathname: string, searchParamsString: string) {
  return useMemo(() => {
    if (href === '/') {
      return (
        pathname === '/' ||
        pathname === '/dashboard' ||
        pathname.startsWith('/dashboard/')
      );
    }
    const [hrefPath, hrefQuery] = href.split('?');

    if (!hrefQuery) {
      return pathname === href || pathname.startsWith(`${href}/`);
    }

    if (pathname !== hrefPath) {
      return false;
    }

    const currentParams = new URLSearchParams(searchParamsString);
    const targetParams = new URLSearchParams(hrefQuery);

    for (const [key, value] of targetParams.entries()) {
      if (currentParams.get(key) !== value) {
        return false;
      }
    }

    return true;
  }, [href, pathname, searchParamsString]);
}

const GENDER_SHORT_LABELS: Record<string, string> = {
  M: 'Male',
  F: 'Female',
  O: 'Other',
};

const STAGE_STATUS_CONFIG: Partial<Record<string, { label: string; description: string; dotClassName: string }>> = {
  REGISTERED: {
    label: 'Registered',
    description: 'Patient has been registered in the system.',
    dotClassName: 'bg-slate-400',
  },
  CHECKED_IN: {
    label: 'Checked In',
    description: 'Patient has arrived and completed check-in.',
    dotClassName: 'bg-cyan-500',
  },
  AWAITING_TRIAGE: {
    label: 'Awaiting Triage',
    description: 'Patient is waiting for initial triage assessment.',
    dotClassName: 'bg-amber-500',
  },
  IN_TRIAGE: {
    label: 'In Triage',
    description: 'Patient is currently being assessed in triage.',
    dotClassName: 'bg-blue-500',
  },
  AWAITING_CONSULTATION: {
    label: 'Awaiting Consultation',
    description: 'Triage is complete and the patient is waiting for a clinician.',
    dotClassName: 'bg-violet-500',
  },
  IN_CONSULTATION: {
    label: 'In Consultation',
    description: 'Patient is currently with a clinician.',
    dotClassName: 'bg-emerald-500',
  },
  AWAITING_LAB: {
    label: 'Awaiting Lab',
    description: 'Lab work has been ordered and the patient is waiting for processing.',
    dotClassName: 'bg-fuchsia-500',
  },
  LAB_IN_PROGRESS: {
    label: 'Lab In Progress',
    description: 'Lab processing is underway.',
    dotClassName: 'bg-fuchsia-600',
  },
  LAB_RESULTS_READY: {
    label: 'Lab Results Ready',
    description: 'Lab results are available for review.',
    dotClassName: 'bg-lime-500',
  },
  AWAITING_IMAGING: {
    label: 'Awaiting Imaging',
    description: 'Imaging has been requested and is pending.',
    dotClassName: 'bg-sky-500',
  },
  IMAGING_IN_PROGRESS: {
    label: 'Imaging In Progress',
    description: 'Imaging study is currently being performed.',
    dotClassName: 'bg-sky-600',
  },
  IMAGING_RESULTS_READY: {
    label: 'Imaging Results Ready',
    description: 'Imaging results are ready for review.',
    dotClassName: 'bg-teal-500',
  },
  AWAITING_PHARMACY: {
    label: 'Awaiting Pharmacy',
    description: 'Medication order is waiting for dispensing.',
    dotClassName: 'bg-orange-500',
  },
  PHARMACY_DISPENSING: {
    label: 'Pharmacy Dispensing',
    description: 'Medication is currently being prepared or dispensed.',
    dotClassName: 'bg-orange-600',
  },
  PHARMACY_READY: {
    label: 'Pharmacy Ready',
    description: 'Medication is ready for collection.',
    dotClassName: 'bg-yellow-500',
  },
  AWAITING_BILLING: {
    label: 'Awaiting Billing',
    description: 'Patient is waiting for billing review or payment.',
    dotClassName: 'bg-rose-400',
  },
  BILLING_IN_PROGRESS: {
    label: 'Billing In Progress',
    description: 'Invoice is being processed or payment is underway.',
    dotClassName: 'bg-rose-500',
  },
  BILLING_COMPLETE: {
    label: 'Billing Complete',
    description: 'Payment has been received and billing is settled.',
    dotClassName: 'bg-rose-300',
  },
  ADMISSION_RECOMMENDED: {
    label: 'Admission Recommended',
    description: 'Clinician has recommended inpatient admission.',
    dotClassName: 'bg-red-400',
  },
  AWAITING_BED: {
    label: 'Awaiting Bed',
    description: 'Patient is waiting for a bed to be assigned.',
    dotClassName: 'bg-red-300',
  },
  ADMITTED: {
    label: 'Admitted',
    description: 'Patient has been admitted to inpatient care.',
    dotClassName: 'bg-red-500',
  },
  INPATIENT_CARE: {
    label: 'Inpatient Care',
    description: 'Patient is receiving inpatient care on the ward.',
    dotClassName: 'bg-red-600',
  },
  AWAITING_DISCHARGE: {
    label: 'Awaiting Discharge',
    description: 'Patient is medically ready and awaiting discharge clearances.',
    dotClassName: 'bg-amber-600',
  },
  DISCHARGE_PLANNING: {
    label: 'Discharge Planning',
    description: 'Discharge summary and instructions are being prepared.',
    dotClassName: 'bg-amber-500',
  },
  DISCHARGED: {
    label: 'Discharged',
    description: 'Patient visit has been completed and discharge finalized.',
    dotClassName: 'bg-slate-500',
  },
  REFERRED_OUT: {
    label: 'Referred Out',
    description: 'Patient has been referred to another facility.',
    dotClassName: 'bg-indigo-500',
  },
  LEFT_WITHOUT_BEING_SEEN: {
    label: 'Left Without Being Seen',
    description: 'Patient left the facility before being attended to.',
    dotClassName: 'bg-gray-400',
  },
  DECEASED: {
    label: 'Deceased',
    description: 'Patient has been pronounced deceased.',
    dotClassName: 'bg-gray-600',
  },
};

function getStageStatus(stage: string) {
  return STAGE_STATUS_CONFIG[stage] ?? {
    label: stage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()),
    description: 'Patient journey stage is currently active.',
    dotClassName: 'bg-slate-400',
  };
}

function StageStatusDot({ stage }: { stage: string }) {
  const status = getStageStatus(stage);
  const pulseClassName = status.dotClassName.replace(/^bg-red-/, 'bg-pink-');

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative inline-flex h-4 w-4 items-center justify-center rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={status.label}
            >
              <span className={cn('absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full opacity-75', pulseClassName)} />
              <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full shadow-sm', status.dotClassName)} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{status.label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-56 p-3">
        <div className="flex items-start gap-3">
          <span className={cn('mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 rounded-full', status.dotClassName)} />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{status.label}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{status.description}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CurrentPatientCard({ onMobileClose }: { onMobileClose: () => void }) {
  const { canAccessModule } = usePermissions();
  const openPeek = usePeekPanelStore((s) => s.open);
  const currentPatient = usePatientJourneyStore((state) => {
    if (!state.selectedPatientId) return null;
    return state.activePatients[state.selectedPatientId] ?? null;
  });
  const [dismissedPatientId, setDismissedPatientId] = useState<number | null>(null);

  useEffect(() => {
    if (currentPatient?.id !== dismissedPatientId) {
      setDismissedPatientId(null);
    }
  }, [currentPatient?.id, dismissedPatientId]);

  if (!currentPatient || !canAccessModule('patients' as never) || dismissedPatientId === currentPatient.id) {
    return null;
  }

  const age = currentPatient.date_of_birth ? calculateAge(currentPatient.date_of_birth) : null;
  const gender = currentPatient.gender
    ? GENDER_SHORT_LABELS[currentPatient.gender] ?? currentPatient.gender
    : null;
  const demographics = [currentPatient.mrn, age !== null ? `${age}y` : null, gender].filter(Boolean);

  return (
    <section className="px-3 pb-3" aria-label="Current patient" data-testid="current-patient-card">
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-cyan-500/8 via-card to-card p-3 shadow-sm">
        <button
          type="button"
          aria-label="Dismiss current patient card"
          className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => setDismissedPatientId(currentPatient.id)}
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 pr-8 text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
              <Pin className="h-3.5 w-3.5" />
              <span>Current Patient</span>
              <StageStatusDot stage={currentPatient.stage} />
            </div>

            <div className="mt-2 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{currentPatient.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{demographics.join(' • ')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => {
              openPeek({
                type: 'patient',
                id: currentPatient.id,
                title: currentPatient.name,
                subtitle: demographics.join(' · '),
              });
              onMobileClose();
            }}
          >
            <User className="h-3.5 w-3.5" />
            View Patient
          </Button>

          <div className="flex items-center gap-2">
            {currentPatient.encounter_id && (currentPatient.stage === 'AWAITING_TRIAGE' || currentPatient.stage === 'IN_TRIAGE') ? (
              <Button asChild size="sm" variant="outline" className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30">
                <Link href={`/triage/assess/${currentPatient.id}/${currentPatient.encounter_id}/vitals`} onClick={onMobileClose}>
                  <Activity className="h-3.5 w-3.5" />
                  Triage
                </Link>
              </Button>
            ) : null}

            {currentPatient.encounter_id && canAccessModule('encounters' as never) ? (
              <Button
                size="sm"
                className="flex-1"
                onClick={() => {
                  openPeek({
                    type: 'encounter',
                    id: currentPatient.encounter_id!,
                    title: 'Encounter',
                    subtitle: currentPatient.name,
                  });
                  onMobileClose();
                }}
              >
                <Stethoscope className="h-3.5 w-3.5" />
                Encounter
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Nav Link
// -----------------------------------------------------------------------------

const NavLink = memo(function NavLink({
  item,
  isChild = false,
  collapsed,
  pathname,
  searchParamsString,
  onMobileClose,
  badgeCounts,
}: NavLinkProps) {
  const isActive = useIsActive(item.href, pathname, searchParamsString);
  const Icon = item.icon;

  // Dynamic badge: prefer live count from badgeCounts, fall back to static item.badge
  const badgeCount = badgeCounts?.[item.href] ?? item.badge ?? 0;

  const baseStyles =
    'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]';

  const activeStyles =
    'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-l-2 border-cyan-500 font-medium';

  const inactiveStyles =
    'text-muted-foreground hover:text-cyan-600 dark:hover:text-cyan-300 active:scale-[0.98]';

  const link = (
    <Link
      href={item.href}
      onClick={onMobileClose}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        baseStyles,
        isChild && !collapsed && 'ml-4 pl-3 opacity-90',
        isActive ? activeStyles : inactiveStyles,
        collapsed && 'justify-center px-0'
      )}
    >
      <div className={cn(
        'relative flex shrink-0 items-center justify-center rounded-lg transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
        collapsed ? 'h-10 w-10' : 'h-8 w-8',
        'group-hover:scale-110 group-hover:bg-cyan-500/15 group-hover:shadow-sm'
      )}>
        <Icon className={cn(
          'transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110',
          collapsed ? 'h-6 w-6' : 'h-5 w-5'
        )} />
        {/* Collapsed: show dot indicator */}
        {collapsed && badgeCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card" />
        )}
      </div>

      {!collapsed && <span>{item.label}</span>}

      {!collapsed && badgeCount > 0 && (
        <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {item.label}
          {badgeCount > 0 && (
            <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return link;
});

// -----------------------------------------------------------------------------
// Nav Group
// -----------------------------------------------------------------------------

const NavGroup = memo(function NavGroup({
  item,
  collapsed,
  pathname,
  isOpen,
  onToggle,
  onMobileClose,
  badgeCounts,
}: NavGroupProps) {
  const Icon = item.icon;

  const hasActiveChild = useMemo(
    () =>
      item.children.some(
        (child) =>
          pathname === child.href ||
          pathname.startsWith(`${child.href}/`)
      ),
    [item.children, pathname]
  );

  // Aggregate badge count across all children
  const groupBadgeCount = useMemo(() => {
    if (!badgeCounts) return 0;
    return item.children.reduce((sum, child) => sum + (badgeCounts[child.href] ?? 0), 0);
  }, [badgeCounts, item.children]);

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={item.label}
            className={cn(
              'group flex w-full items-center justify-center rounded-lg px-0 py-2 transition-all',
              hasActiveChild
                ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300'
                : 'text-muted-foreground hover:bg-cyan-500/10'
            )}
          >
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 group-hover:bg-cyan-500/15 group-hover:shadow-sm">
              <Icon className="h-6 w-6 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110" />
              {groupBadgeCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card" />
              )}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {item.label}
          {groupBadgeCount > 0 && (
            <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
              {groupBadgeCount > 99 ? '99+' : groupBadgeCount}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
            hasActiveChild
              ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300'
              : 'text-muted-foreground hover:text-cyan-600 dark:hover:text-cyan-300'
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 group-hover:bg-cyan-500/15 group-hover:shadow-sm">
            <Icon className="h-5 w-5 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110" />
          </div>
          <span className="flex-1 text-left">{item.label}</span>
          {groupBadgeCount > 0 && !isOpen && (
            <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">
              {groupBadgeCount > 99 ? '99+' : groupBadgeCount}
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-1 pt-1">
        {item.children.map((child) => (
          <NavLink
            key={child.href}
            item={child}
            isChild
            collapsed={collapsed}
            pathname={pathname}
            searchParamsString=""
            onMobileClose={onMobileClose}
            badgeCounts={badgeCounts}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
});

// -----------------------------------------------------------------------------
// Sidebar
// -----------------------------------------------------------------------------

export function Sidebar({
  collapsed,
  onCollapse,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const logout = useLogout();
  const { items: filteredNavItems, utilityItems } = useNavigationItems();
  const searchParamsString = searchParams.toString();
  const badgeCounts = useSidebarBadges();

  // On mobile (hamburger overlay), always show the sidebar expanded — the
  // collapsed (icon-only) state is only meaningful on xl+ where the sidebar
  // is persistently visible.
  const effectiveCollapsed = collapsed && !mobileOpen;

  const navScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useSidebarPersistence(collapsed, onCollapse);

  // Track scroll position for fade effect + restore persisted scroll
  useEffect(() => {
    const scrollArea = navScrollAreaRef.current;
    if (!scrollArea) return;

    const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!viewport) return;

    // Restore persisted scroll position
    const savedScroll = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    if (savedScroll) {
      const scrollTop = parseInt(savedScroll, 10);
      if (!isNaN(scrollTop)) {
        viewport.scrollTop = scrollTop;
      }
    }

    const handleScroll = () => {
      setIsScrolled(viewport.scrollTop > 8);
      // Debounce-free: sessionStorage writes are fast and synchronous
      sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(Math.round(viewport.scrollTop)));
    };

    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []);

  const activeParent = useMemo(
    () => findParentForPath(pathname),
    [pathname]
  );

  // Also track which filtered parent labels exist so we don't auto-open removed items
  const filteredParentLabels = useMemo(
    () => new Set(filteredNavItems.filter(hasChildren).map(i => i.label)),
    [filteredNavItems]
  );

  const [openMenus, setOpenMenus] = useState<string[]>(() => {
    // Restore persisted open menus from sessionStorage
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(SIDEBAR_OPEN_MENUS_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        } catch { /* ignore parse errors */ }
      }
    }
    return activeParent ? [activeParent] : [];
  });

  // Persist open menus to sessionStorage on change
  useEffect(() => {
    sessionStorage.setItem(SIDEBAR_OPEN_MENUS_KEY, JSON.stringify(openMenus));
  }, [openMenus]);

  const lastAutoOpenedParentRef = useRef<string | null>(null);

  useEffect(() => {
    // Auto-open the current parent when navigation changes into a new section,
    // but do not force it to stay open (users should be able to collapse it
    // even if a child route is currently active).
    if (activeParent && filteredParentLabels.has(activeParent) && lastAutoOpenedParentRef.current !== activeParent) {
      setOpenMenus((prev) => (prev.includes(activeParent) ? prev : [...prev, activeParent]));
      lastAutoOpenedParentRef.current = activeParent;
    }
  }, [activeParent, filteredParentLabels]);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-dvh border-r bg-card/95 backdrop-blur overscroll-contain',
          'transition-transform duration-300 ease-out',
          'w-full xl:w-auto',
          effectiveCollapsed ? 'xl:w-20' : 'xl:w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full xl:translate-x-0'
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-20 items-center justify-between px-3 mt-2">
            <Link href="/" className="flex flex-1 items-center py-2">
              <SidebarLogo collapsed={effectiveCollapsed} />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="xl:hidden shrink-0"
              onClick={onMobileClose}
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {!effectiveCollapsed && <CurrentPatientCard onMobileClose={onMobileClose} />}

          {/* Collapse All button — sits above the scrollable area */}
          {!effectiveCollapsed && (
            <div
              className={cn(
                "flex shrink-0 justify-end px-3 pb-1",
                openMenus.length === 0 && "hidden"
              )}
              suppressHydrationWarning
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setOpenMenus([])}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Collapse all menu groups"
                  >
                    <ChevronsDownUp className="h-3.5 w-3.5" />
                    <span>Collapse all</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Collapse all open groups</TooltipContent>
              </Tooltip>
            </div>
          )}

          <div className="relative flex-1 min-h-0">
            {/* Top fade gradient when scrolled */}
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-card/95 via-card/60 to-transparent transition-opacity duration-200',
                isScrolled ? 'opacity-100' : 'opacity-0'
              )}
            />
            <ScrollArea
              ref={navScrollAreaRef}
              className="h-full min-h-0 px-3 [&_[data-slot=scroll-area-viewport]]:overscroll-contain [&_[data-slot=scroll-area-viewport]]:touch-pan-y"
            >
              <div className="space-y-1 py-2">
                {filteredNavItems.map((item) =>
                  hasChildren(item) ? (
                    <NavGroup
                      key={item.label}
                      item={item}
                      collapsed={effectiveCollapsed}
                      pathname={pathname}
                      isOpen={openMenus.includes(item.label)}
                      onToggle={() =>
                        setOpenMenus((prev) =>
                          prev.includes(item.label)
                            ? prev.filter((l) => l !== item.label)
                            : [...prev, item.label]
                        )
                      }
                      onMobileClose={onMobileClose}
                      badgeCounts={badgeCounts}
                    />
                  ) : (
                    <NavLink
                      key={item.href}
                      item={item}
                      collapsed={effectiveCollapsed}
                      pathname={pathname}
                      searchParamsString={searchParamsString}
                      onMobileClose={onMobileClose}
                      badgeCounts={badgeCounts}
                    />
                  )
                )}

                {utilityItems.length > 0 && (
                  <>
                    <div className="my-2 border-t border-border/40" />
                    {utilityItems.map((item) =>
                      hasChildren(item) ? (
                        <NavGroup
                          key={item.label}
                          item={item}
                          collapsed={effectiveCollapsed}
                          pathname={pathname}
                          isOpen={openMenus.includes(item.label)}
                          onToggle={() =>
                            setOpenMenus((prev) =>
                              prev.includes(item.label)
                                ? prev.filter((l) => l !== item.label)
                                : [...prev, item.label]
                            )
                          }
                          onMobileClose={onMobileClose}
                          badgeCounts={badgeCounts}
                        />
                      ) : (
                        <NavLink
                          key={item.href}
                          item={item}
                          collapsed={effectiveCollapsed}
                          pathname={pathname}
                          searchParamsString={searchParamsString}
                          onMobileClose={onMobileClose}
                          badgeCounts={badgeCounts}
                        />
                      )
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
            <ScrollMoreButton scrollAreaRef={navScrollAreaRef} direction="down" />
            <ScrollMoreButton scrollAreaRef={navScrollAreaRef} direction="up" />
          </div>

          <div className="border-t px-2 py-2">
            <div className={cn('grid gap-1', effectiveCollapsed ? 'grid-cols-1' : 'grid-cols-3')}>
              {bottomNavItems.map((item) => {
                const ItemIcon = item.icon;
                const link = (
                  <Link
                    href={item.href}
                    onClick={onMobileClose}
                    aria-label={item.label}
                    className={cn(
                      'inline-flex h-9 items-center justify-center rounded-md text-muted-foreground transition-colors',
                      'hover:bg-cyan-500/10 hover:text-cyan-600 dark:hover:text-cyan-300',
                      collapsed ? 'w-full' : 'w-full'
                    )}
                  >
                    <ItemIcon className="h-5 w-5" />
                  </Link>
                );

                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              })}

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={logout}
                    aria-label="Logout"
                    className={cn(
                      'inline-flex h-9 items-center justify-center rounded-md text-muted-foreground transition-colors',
                      'hover:bg-destructive/15 hover:text-destructive',
                      collapsed ? 'w-full' : 'w-full'
                    )}
                  >
                    <LogOut className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Logout</TooltipContent>
              </Tooltip>

              {/* Collapse toggle — only on xl+ where the sidebar is persistent */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onCollapse(!collapsed)}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className={cn(
                      'hidden xl:inline-flex h-9 items-center justify-center rounded-md text-muted-foreground transition-colors',
                      'hover:bg-cyan-500/10 hover:text-cyan-600 dark:hover:text-cyan-300',
                      collapsed ? 'w-full' : 'w-full',
                      collapsed && 'rotate-180'
                    )}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {collapsed ? 'Expand' : 'Collapse'}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
