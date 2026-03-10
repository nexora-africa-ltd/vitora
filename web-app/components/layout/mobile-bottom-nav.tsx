'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import {
  Stethoscope,
  LayoutDashboard,
  UserCheck,
  Thermometer,
  Pill,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTodayCheckins } from '@/lib/hooks/use-checkin';
import { useWaitingQueue } from '@/lib/hooks/use-triage';

/**
 * Base tabs used to build the mobile workflow footer.
 */
const STATIC_TABS = [
  { label: 'Home', href: '/', icon: LayoutDashboard, moduleKey: 'dashboard' },
  { label: 'Check-in', href: '/patients/checkin', icon: UserCheck, moduleKey: 'checkin' },
  { label: 'Encounters', href: '/encounters', icon: Stethoscope, moduleKey: 'encounters' },
  { label: 'Patients', href: '/patients', icon: Users, moduleKey: 'patients' },
] as const;

const TRIAGE_TAB = {
  label: 'Triage',
  href: '/triage',
  icon: Thermometer,
  moduleKey: 'triage',
  badgeKey: 'triage' as const,
};

const PHARMACY_TAB = {
  label: 'Pharmacy',
  href: '/pharmacy',
  icon: Pill,
  moduleKey: 'pharmacy',
};

type BottomTab = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  moduleKey: string;
  badgeKey?: 'checkin' | 'triage';
};

/**
 * Telegram-style fixed bottom navigation bar for mobile and tablet.
 * Hidden on xl+ where the sidebar is persistently visible.
 */
export function MobileBottomNav({ hidden = false }: { hidden?: boolean }) {
  const pathname = usePathname();
  const { canAccessModule, canPerformAction } = usePermissions();
  const { data: todayCheckins } = useTodayCheckins({ page_size: 1 });
  const { data: waitingTriageQueue } = useWaitingQueue({ status: 'WAITING_TRIAGE' });

  const badgeCounts = useMemo(
    () => ({
      checkin: todayCheckins?.count ?? 0,
      triage: waitingTriageQueue?.count ?? 0,
    }),
    [todayCheckins?.count, waitingTriageQueue?.count]
  );

  const hasTriageWorkflow = canAccessModule('triage' as never)
    && canPerformAction('triage.view_queue' as never);
  const hasPharmacyWorkflow = canAccessModule('pharmacy' as never)
    && canPerformAction('pharmacy.dispense' as never);

  const visibleTabs = useMemo(
    () => {
      const workflowTab: BottomTab | null = hasPharmacyWorkflow && !hasTriageWorkflow
        ? PHARMACY_TAB
        : hasTriageWorkflow
          ? TRIAGE_TAB
          : hasPharmacyWorkflow
            ? PHARMACY_TAB
            : canAccessModule('encounters' as never)
              ? {
                  label: 'Encounters',
                  href: '/encounters',
                  icon: Stethoscope,
                  moduleKey: 'encounters',
                }
              : null;

      const tabs: BottomTab[] = [];

      for (const tab of STATIC_TABS.slice(0, 2)) {
        if (canAccessModule(tab.moduleKey as never)) {
          tabs.push({
            ...tab,
            badgeKey: tab.href === '/patients/checkin' ? 'checkin' : undefined,
          });
        }
      }

      if (workflowTab && canAccessModule(workflowTab.moduleKey as never)) {
        tabs.push(workflowTab);
      }

      for (const tab of STATIC_TABS.slice(2)) {
        if (workflowTab?.href === tab.href) continue;
        if (canAccessModule(tab.moduleKey as never)) {
          tabs.push(tab);
        }
      }

      return tabs.slice(0, 5);
    },
    [canAccessModule, hasPharmacyWorkflow, hasTriageWorkflow]
  );

  if (hidden || visibleTabs.length === 0) return null;

  const primaryIndex = visibleTabs.length >= 3 ? 2 : Math.floor(visibleTabs.length / 2);

  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-40 xl:hidden"
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="relative overflow-hidden rounded-[28px] border border-border/70 bg-background/90 px-2 py-1.5 shadow-[0_14px_40px_rgba(15,23,42,0.18)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.10),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.08),transparent_40%)]"
          aria-hidden="true"
        />

        <div className="relative flex items-end justify-around gap-1">
        {visibleTabs.map((tab, index) => {
          const isActive = tab.href === '/'
            ? pathname === '/' || pathname === '/dashboard'
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const isPrimary = index === primaryIndex;
          const badgeCount = tab.badgeKey ? badgeCounts[tab.badgeKey] : 0;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 text-[9px] sm:text-[10px] transition-all duration-200',
                isPrimary && 'mx-0.5 scale-[1.05]',
                isActive
                  ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {badgeCount > 0 && (
                <Badge
                  variant={tab.badgeKey === 'triage' ? 'destructive' : 'default'}
                  size="sm"
                  className="absolute right-2 top-1 min-w-5 justify-center px-1.5"
                >
                  {badgeCount > 99 ? '99+' : badgeCount}
                </Badge>
              )}
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200',
                  isPrimary && 'h-9 w-9 shadow-lg',
                  isPrimary && isActive && 'bg-primary text-primary-foreground',
                  isPrimary && !isActive && 'bg-card ring-1 ring-border/80',
                  !isPrimary && isActive ? 'bg-primary/12' : !isPrimary ? 'bg-transparent' : ''
                )}
              >
                <tab.icon
                  className={cn(
                    'h-4.5 w-4.5 shrink-0',
                    isPrimary && 'h-5 w-5',
                    isPrimary && isActive ? 'text-primary-foreground' : '',
                    isActive && 'stroke-[2.5]'
                  )}
                />
              </span>
              <span
                className={cn(
                  'max-w-full truncate font-medium',
                  isPrimary && 'text-[10px]'
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
        </div>
      </div>

      {/* Safe area inset for notched devices (iOS) */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
