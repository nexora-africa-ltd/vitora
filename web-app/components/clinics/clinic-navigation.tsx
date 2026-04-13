/**
 * Clinic Navigation Component
 *
 * Provides consistent navigation across all clinic sub-pages.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutList,
  ClipboardList,
  Users,
  History,
  UserCog,
  CalendarClock,
  BarChart3,
  Settings,
  DoorOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

interface ClinicNavigationProps {
  clinicId: number;
}

const NAV_ITEMS = [
  { href: '', label: 'Dashboard', icon: LayoutList },
  { href: '/queue', label: 'Queue', icon: ClipboardList },
  { href: '/patients', label: 'Patients', icon: Users },
  { href: '/sessions', label: 'Sessions', icon: History },
  { href: '/staff', label: 'Staff', icon: UserCog },
  { href: '/rooms', label: 'Rooms', icon: DoorOpen },
  { href: '/schedule', label: 'Schedule', icon: CalendarClock },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function ClinicNavigation({ clinicId }: ClinicNavigationProps) {
  const pathname = usePathname();
  const basePath = `/clinics/${clinicId}`;

  const isActive = (href: string) => {
    const fullPath = `${basePath}${href}`;
    if (href === '') {
      return pathname === basePath;
    }
    return pathname === fullPath || pathname.startsWith(`${fullPath}/`);
  };

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b pb-2">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);

        return (
          <Button
            key={item.href}
            variant={active ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('gap-2 whitespace-nowrap', active && 'bg-muted')}
            asChild
          >
            <Link href={`${basePath}${item.href}`}>
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          </Button>
        );
      })}
    </div>
  );
}
