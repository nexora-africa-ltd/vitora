'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface BreadcrumbItem {
  label: string;
  href: string;
}

const routeLabels: Record<string, string> = {
  '': 'Dashboard',
  patients: 'Patients',
  encounters: 'Encounters',
  pharmacy: 'Pharmacy',
  laboratory: 'Laboratory',
  imaging: 'Imaging',
  surveillance: 'Surveillance',
  cases: 'Notifiable Cases',
  alerts: 'Alerts',
  idsr: 'IDSR Reports',
  thresholds: 'Outbreak Thresholds',
  reports: 'Reports',
  settings: 'Settings',
  orders: 'Orders',
  worklist: 'Worklist',
};

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  // Build breadcrumb items
  const items: BreadcrumbItem[] = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    // Check if segment is an ID (numeric or UUID-like)
    const isId = /^[0-9]+$/.test(segment) || /^[a-f0-9-]{36}$/.test(segment);
    // DICOM UIDs: dot-separated numeric segments (e.g., 1.2.276.0.7230010...)
    const isDicomUid = /^\d+(\.\d+){4,}$/.test(segment);

    let label: string;
    if (isDicomUid) {
      // Show only the last dot-separated section (the unique part)
      const lastPart = segment.split('.').pop() || segment;
      label = `…${lastPart}`;
    } else if (isId) {
      label = `#${segment}`;
    } else {
      label = routeLabels[segment] || segment;
    }

    return { label, href };
  });

  // Don't show breadcrumb on dashboard
  if (segments.length === 0) {
    return (
      <div className="flex items-center text-sm text-muted-foreground">
        <Home className="mr-2 h-4 w-4" />
        <span className="font-medium text-foreground">Dashboard</span>
      </div>
    );
  }

  const currentLabel = items[items.length - 1]?.label ?? 'Dashboard';

  return (
    <nav aria-label="Breadcrumb" className="min-w-0 max-w-full">
      {/* Mobile & Medium: show only the current page */}
      <div className="truncate text-sm font-medium text-foreground lg:hidden">{currentLabel}</div>

      {/* Large screens: show full breadcrumb */}
      <div className="hidden min-w-0 max-w-full items-center overflow-x-auto whitespace-nowrap text-sm lg:flex">
        <Link
          href="/"
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Home className="h-4 w-4" />
          <span className="sr-only">Dashboard</span>
        </Link>

        {items.map((item, index) => (
          <div key={item.href} className="flex shrink-0 items-center">
            <ChevronRight className="mx-2 h-4 w-4 shrink-0 text-muted-foreground" />
            {index === items.length - 1 ? (
              <span className="font-medium text-foreground" title={item.label}>
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className={cn(
                  'text-muted-foreground transition-colors hover:text-foreground',
                  'underline-offset-4 hover:underline'
                )}
              >
                {item.label}
              </Link>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
