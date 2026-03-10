'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import {
  LayoutDashboard,
  UserCheck,
  Thermometer,
  Pill,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { usePermissions } from '@/lib/hooks/use-permissions';

/**
 * Bottom tab configuration — the 5 highest-frequency workflow actions.
 * Order matters: left-to-right maps to most common user journey.
 */
const BOTTOM_TABS = [
  { label: 'Home', href: '/', icon: LayoutDashboard, moduleKey: 'dashboard' },
  { label: 'Check-in', href: '/patients/checkin', icon: UserCheck, moduleKey: 'checkin' },
  { label: 'Triage', href: '/triage', icon: Thermometer, moduleKey: 'triage' },
  { label: 'Pharmacy', href: '/pharmacy', icon: Pill, moduleKey: 'pharmacy' },
  { label: 'Patients', href: '/patients', icon: Users, moduleKey: 'patients' },
] as const;

/**
 * Telegram-style fixed bottom navigation bar for mobile and tablet.
 * Hidden on xl+ where the sidebar is persistently visible.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { canAccessModule } = usePermissions();

  const visibleTabs = useMemo(
    () => BOTTOM_TABS.filter((tab) => canAccessModule(tab.moduleKey as never)),
    [canAccessModule]
  );

  if (visibleTabs.length === 0) return null;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 xl:hidden"
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-14">
        {visibleTabs.map((tab) => {
          const isActive = tab.href === '/'
            ? pathname === '/' || pathname === '/dashboard'
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 h-full text-[10px] sm:text-xs transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <tab.icon
                className={cn(
                  'h-5 w-5 shrink-0',
                  isActive && 'stroke-[2.5]'
                )}
              />
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Safe area inset for notched devices (iOS) */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
