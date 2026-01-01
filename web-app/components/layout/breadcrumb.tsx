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
  reports: 'Reports',
  settings: 'Settings',
};

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  // Build breadcrumb items
  const items: BreadcrumbItem[] = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    // Check if segment is an ID (numeric or UUID-like)
    const isId = /^[0-9]+$/.test(segment) || /^[a-f0-9-]{36}$/.test(segment);
    const label = isId ? `#${segment}` : routeLabels[segment] || segment;
    
    return { label, href };
  });

  // Don't show breadcrumb on dashboard
  if (segments.length === 0) {
    return (
      <div className="flex items-center text-sm text-muted-foreground">
        <Home className="h-4 w-4 mr-2" />
        <span className="font-medium text-foreground">Dashboard</span>
      </div>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-sm">
      <Link
        href="/"
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <Home className="h-4 w-4" />
        <span className="sr-only">Dashboard</span>
      </Link>
      
      {items.map((item, index) => (
        <div key={item.href} className="flex items-center">
          <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground" />
          {index === items.length - 1 ? (
            <span className="font-medium text-foreground">{item.label}</span>
          ) : (
            <Link
              href={item.href}
              className={cn(
                'text-muted-foreground hover:text-foreground transition-colors',
                'hover:underline underline-offset-4'
              )}
            >
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
