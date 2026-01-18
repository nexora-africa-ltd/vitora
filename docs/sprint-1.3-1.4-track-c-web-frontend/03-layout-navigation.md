# Sprint 1.3-1.4 Track C: Layout & Navigation

**Part of**: Web Frontend Foundation (Next.js)
**Priority**: P0 (Critical Path)
**Estimated Tests**: 22 tests
**Parallel Track**: 🅱️ Track B (Days 5-6)

---

## Overview

This document covers the dashboard layout shell, sidebar navigation, header component, breadcrumbs, and responsive design implementation.

---

## 1. Dashboard Layout Structure

**app/(dashboard)/layout.tsx**:
```typescript
'use client';

import { useState } from 'react';
import { AuthGuard } from '@/lib/auth/guard';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { cn } from '@/lib/utils/cn';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        {/* Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onCollapse={setSidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        {/* Main content area */}
        <div
          className={cn(
            'transition-all duration-300',
            sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
          )}
        >
          {/* Header */}
          <Header
            onMenuClick={() => setMobileSidebarOpen(true)}
            sidebarCollapsed={sidebarCollapsed}
          />

          {/* Page content */}
          <main className="min-h-[calc(100vh-4rem)] p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>

        {/* Mobile sidebar overlay */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
      </div>
    </AuthGuard>
  );
}
```

---

## 2. Sidebar Component

**components/layout/sidebar.tsx**:
```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Stethoscope,
  Pill,
  FlaskConical,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLogout } from '@/lib/auth/hooks';

interface SidebarProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

const mainNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Patients', href: '/patients', icon: Users },
  { label: 'Encounters', href: '/encounters', icon: Stethoscope },
  { label: 'Pharmacy', href: '/pharmacy', icon: Pill },
  { label: 'Laboratory', href: '/laboratory', icon: FlaskConical },
  { label: 'Reports', href: '/reports', icon: FileText },
];

const bottomNavItems: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar({ collapsed, onCollapse, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const logout = useLogout();

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
    const Icon = item.icon;

    const linkContent = (
      <Link
        href={item.href}
        onClick={onMobileClose}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
        {!collapsed && item.badge && (
          <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">
            {item.badge}
          </span>
        )}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right">
            {item.label}
            {item.badge && ` (${item.badge})`}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen bg-card border-r transition-all duration-300',
          collapsed ? 'w-16' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo & Brand */}
        <div className="flex h-16 items-center justify-between px-4 border-b">
          {!collapsed && (
            <Link href="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-lg font-bold text-primary-foreground">V</span>
              </div>
              <span className="font-semibold text-lg">Vitora</span>
            </Link>
          )}

          {collapsed && (
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
              <span className="text-lg font-bold text-primary-foreground">V</span>
            </div>
          )}

          {/* Mobile close button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMobileClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col h-[calc(100vh-4rem)] p-3">
          {/* Main nav items */}
          <div className="flex-1 space-y-1">
            {mainNavItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>

          <Separator className="my-2" />

          {/* Bottom nav items */}
          <div className="space-y-1">
            {bottomNavItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}

            {/* Logout button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={logout}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                    'text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors'
                  )}
                >
                  <LogOut className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>Logout</span>}
                </button>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">Logout</TooltipContent>}
            </Tooltip>
          </div>

          {/* Collapse toggle (desktop only) */}
          <Button
            variant="ghost"
            size="sm"
            className="hidden lg:flex mt-2 w-full justify-center"
            onClick={() => onCollapse(!collapsed)}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </nav>
      </aside>
    </TooltipProvider>
  );
}
```

---

## 3. Header Component

**components/layout/header.tsx**:
```typescript
'use client';

import { Menu, Bell, Search, Sun, Moon, User } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth/context';
import { useLogout } from '@/lib/auth/hooks';
import { Breadcrumb } from '@/components/layout/breadcrumb';

interface HeaderProps {
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
}

export function Header({ onMenuClick, sidebarCollapsed }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const logout = useLogout();

  const userInitials = user
    ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || user.username[0]}`.toUpperCase()
    : 'U';

  return (
    <header className="sticky top-0 z-30 h-16 bg-background/95 backdrop-blur border-b">
      <div className="flex h-full items-center justify-between px-4 md:px-6">
        {/* Left side */}
        <div className="flex items-center gap-4">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>

          {/* Breadcrumb */}
          <Breadcrumb />
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Search (desktop) */}
          <div className="hidden md:flex relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search patients..."
              className="pl-9"
            />
          </div>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
                >
                  3
                </Badge>
                <span className="sr-only">Notifications</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <div className="flex flex-col gap-1">
                  <span className="font-medium">Low Stock Alert</span>
                  <span className="text-sm text-muted-foreground">
                    Paracetamol 500mg is running low
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <div className="flex flex-col gap-1">
                  <span className="font-medium">Critical Vital</span>
                  <span className="text-sm text-muted-foreground">
                    Patient John Doe has SpO2 &lt; 95%
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-center text-primary">
                View all notifications
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{user?.first_name || user?.username}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {user?.email || user?.username}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
```

---

## 4. Breadcrumb Component

**components/layout/breadcrumb.tsx**:
```typescript
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
```

---

## 5. Dashboard Home Page

**app/(dashboard)/page.tsx**:
```typescript
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Stethoscope, Pill, AlertTriangle } from 'lucide-react';
import { StatsCard } from '@/components/dashboard/stats-card';
import { RecentPatients } from '@/components/dashboard/recent-patients';
import { AlertsWidget } from '@/components/dashboard/alerts-widget';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to Vitora HMIS. Here's an overview of your facility.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Patients"
          value="1,234"
          description="+12 from last week"
          icon={Users}
          trend="up"
        />
        <StatsCard
          title="Today's Encounters"
          value="48"
          description="8 in progress"
          icon={Stethoscope}
          trend="up"
        />
        <StatsCard
          title="Prescriptions"
          value="156"
          description="Today's dispensed"
          icon={Pill}
          trend="neutral"
        />
        <StatsCard
          title="Alerts"
          value="3"
          description="Require attention"
          icon={AlertTriangle}
          trend="down"
          variant="warning"
        />
      </div>

      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent patients */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Patients</CardTitle>
            <CardDescription>
              Patients registered or seen recently
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecentPatients />
          </CardContent>
        </Card>

        {/* Alerts widget */}
        <Card>
          <CardHeader>
            <CardTitle>Active Alerts</CardTitle>
            <CardDescription>
              Critical items requiring attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertsWidget />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

---

## 6. Dashboard Components

**components/dashboard/stats-card.tsx**:
```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import { TrendingUp, TrendingDown, Minus, LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  variant?: 'default' | 'warning' | 'success';
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend = 'neutral',
  variant = 'default',
}: StatsCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon
          className={cn(
            'h-4 w-4',
            variant === 'warning' && 'text-amber-500',
            variant === 'success' && 'text-green-500',
            variant === 'default' && 'text-muted-foreground'
          )}
        />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <TrendIcon
              className={cn(
                'h-3 w-3',
                trend === 'up' && 'text-green-500',
                trend === 'down' && 'text-red-500'
              )}
            />
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

**components/dashboard/recent-patients.tsx**:
```typescript
'use client';

import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils/format';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePatients } from '@/lib/hooks/use-patients';

export function RecentPatients() {
  const { data: patients, isLoading } = usePatients({ limit: 5 });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!patients?.results?.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No patients found
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {patients.results.map((patient) => (
        <Link
          key={patient.id}
          href={`/patients/${patient.id}`}
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors"
        >
          <Avatar>
            <AvatarFallback>
              {patient.first_name[0]}
              {patient.last_name[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {patient.first_name} {patient.last_name}
            </p>
            <p className="text-xs text-muted-foreground">
              MRN: {patient.mrn}
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {formatRelativeTime(patient.created_at)}
          </Badge>
        </Link>
      ))}
    </div>
  );
}
```

**components/dashboard/alerts-widget.tsx**:
```typescript
'use client';

import { AlertTriangle, Package, Clock, Activity } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';

interface Alert {
  id: string;
  type: 'low_stock' | 'expiring' | 'critical_vital';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// TODO : Replace with actual data from API
const mockAlerts: Alert[] = [
  {
    id: '1',
    type: 'critical_vital',
    title: 'Critical SpO2',
    description: 'Patient Jane Doe has SpO2 at 92%',
    severity: 'critical',
  },
  {
    id: '2',
    type: 'low_stock',
    title: 'Low Stock Alert',
    description: 'Paracetamol 500mg - 45 units remaining',
    severity: 'medium',
  },
  {
    id: '3',
    type: 'expiring',
    title: 'Expiring Soon',
    description: 'Amoxicillin Batch #A123 expires in 30 days',
    severity: 'low',
  },
];

const alertIcons = {
  low_stock: Package,
  expiring: Clock,
  critical_vital: Activity,
};

const severityColors = {
  low: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export function AlertsWidget() {
  if (mockAlerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No active alerts</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {mockAlerts.map((alert) => {
        const Icon = alertIcons[alert.type];
        return (
          <div
            key={alert.id}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg border',
              severityColors[alert.severity]
            )}
          >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{alert.title}</p>
              <p className="text-xs opacity-80 truncate">{alert.description}</p>
            </div>
            <Button variant="ghost" size="sm" className="shrink-0">
              View
            </Button>
          </div>
        );
      })}
    </div>
  );
}
```

---

## 7. Shared Components

**components/shared/loading-spinner.tsx**:
```typescript
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  return (
    <Loader2
      className={cn('animate-spin text-primary', sizeClasses[size], className)}
    />
  );
}
```

**components/shared/empty-state.tsx**:
```typescript
import { LucideIcon, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  );
}
```

**components/shared/page-header.tsx**:
```typescript
interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

---

## 8. Test Coverage

### 8.1 Sidebar Tests (8 tests)

**__tests__/components/layout/sidebar.test.tsx**:
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '@/components/layout/sidebar';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

describe('Sidebar', () => {
  const defaultProps = {
    collapsed: false,
    onCollapse: jest.fn(),
    mobileOpen: false,
    onMobileClose: jest.fn(),
  };

  it('should render all main navigation items', () => {
    render(<Sidebar {...defaultProps} />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Patients')).toBeInTheDocument();
    expect(screen.getByText('Encounters')).toBeInTheDocument();
    expect(screen.getByText('Pharmacy')).toBeInTheDocument();
    expect(screen.getByText('Laboratory')).toBeInTheDocument();
  });

  it('should highlight active navigation item', () => {
    render(<Sidebar {...defaultProps} />);
    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink).toHaveClass('bg-primary');
  });

  it('should collapse sidebar when collapse button clicked', () => {
    render(<Sidebar {...defaultProps} />);
    const collapseButton = screen.getByText('Collapse').closest('button');
    fireEvent.click(collapseButton!);
    expect(defaultProps.onCollapse).toHaveBeenCalledWith(true);
  });

  it('should hide labels when collapsed', () => {
    render(<Sidebar {...defaultProps} collapsed={true} />);
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('should show tooltips when collapsed', () => {
    render(<Sidebar {...defaultProps} collapsed={true} />);
    // Tooltips are shown on hover
  });

  it('should call onMobileClose when link clicked on mobile', () => {
    render(<Sidebar {...defaultProps} mobileOpen={true} />);
    const patientLink = screen.getByRole('link', { name: /patients/i });
    fireEvent.click(patientLink);
    expect(defaultProps.onMobileClose).toHaveBeenCalled();
  });

  it('should show Vitora branding', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('Vitora')).toBeInTheDocument();
  });

  it('should have logout button', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });
});
```

### 8.2 Header Tests (6 tests)

**__tests__/components/layout/header.test.tsx**:
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '@/components/layout/header';

jest.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    user: { username: 'testuser', first_name: 'Test', last_name: 'User' },
  }),
}));

describe('Header', () => {
  const defaultProps = {
    onMenuClick: jest.fn(),
    sidebarCollapsed: false,
  };

  it('should render mobile menu button', () => {
    render(<Header {...defaultProps} />);
    const menuButton = screen.getByRole('button', { name: /toggle menu/i });
    expect(menuButton).toBeInTheDocument();
  });

  it('should call onMenuClick when menu button clicked', () => {
    render(<Header {...defaultProps} />);
    const menuButton = screen.getByRole('button', { name: /toggle menu/i });
    fireEvent.click(menuButton);
    expect(defaultProps.onMenuClick).toHaveBeenCalled();
  });

  it('should render search input on desktop', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByPlaceholderText(/search patients/i)).toBeInTheDocument();
  });

  it('should render notification bell with badge', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
  });

  it('should render theme toggle button', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
  });

  it('should render user avatar with initials', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText('TU')).toBeInTheDocument(); // Test User initials
  });
});
```

### 8.3 Breadcrumb Tests (4 tests)

**__tests__/components/layout/breadcrumb.test.tsx**:
```typescript
import { render, screen } from '@testing-library/react';
import { Breadcrumb } from '@/components/layout/breadcrumb';

describe('Breadcrumb', () => {
  it('should show Dashboard on home page', () => {
    jest.spyOn(require('next/navigation'), 'usePathname').mockReturnValue('/');
    render(<Breadcrumb />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('should show path segments', () => {
    jest.spyOn(require('next/navigation'), 'usePathname').mockReturnValue('/patients');
    render(<Breadcrumb />);
    expect(screen.getByText('Patients')).toBeInTheDocument();
  });

  it('should show nested paths', () => {
    jest.spyOn(require('next/navigation'), 'usePathname').mockReturnValue('/patients/123');
    render(<Breadcrumb />);
    expect(screen.getByText('Patients')).toBeInTheDocument();
    expect(screen.getByText('#123')).toBeInTheDocument();
  });

  it('should have clickable links except for current page', () => {
    jest.spyOn(require('next/navigation'), 'usePathname').mockReturnValue('/patients/123');
    render(<Breadcrumb />);
    const patientsLink = screen.getByRole('link', { name: 'Patients' });
    expect(patientsLink).toHaveAttribute('href', '/patients');
  });
});
```

### 8.4 Dashboard Tests (4 tests)

**__tests__/app/dashboard/page.test.tsx**:
```typescript
import { render, screen } from '@testing-library/react';
import DashboardPage from '@/app/(dashboard)/page';

describe('Dashboard Page', () => {
  it('should render dashboard title', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('should render stats cards', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Total Patients')).toBeInTheDocument();
    expect(screen.getByText("Today's Encounters")).toBeInTheDocument();
    expect(screen.getByText('Prescriptions')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();
  });

  it('should render recent patients section', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Recent Patients')).toBeInTheDocument();
  });

  it('should render alerts widget', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Active Alerts')).toBeInTheDocument();
  });
});
```

---

## 9. Checklist

### Day 5: Layout Foundation
- [ ] Create dashboard layout with sidebar state
- [ ] Implement Sidebar component
- [ ] Implement Header component
- [ ] Implement Breadcrumb component
- [ ] Write 12 layout tests

### Day 6: Dashboard & Polish
- [ ] Create dashboard home page
- [ ] Implement StatsCard component
- [ ] Implement RecentPatients component
- [ ] Implement AlertsWidget component
- [ ] Add shared components (LoadingSpinner, EmptyState)
- [ ] Write 10 dashboard tests

---

## Deliverables

| Deliverable | Status |
|-------------|--------|
| Dashboard layout shell | 📋 |
| Sidebar navigation | 📋 |
| Collapsible sidebar | 📋 |
| Mobile responsive sidebar | 📋 |
| Header with notifications | 📋 |
| Theme toggle | 📋 |
| Breadcrumb navigation | 📋 |
| Dashboard home page | 📋 |
| Stats cards | 📋 |
| Recent patients widget | 📋 |
| Alerts widget | 📋 |
| 22 layout tests passing | 📋 |

---

**Previous**: [02-authentication.md](./02-authentication.md)
**Next**: [04-patient-module.md](./04-patient-module.md)
