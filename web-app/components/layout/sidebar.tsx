'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Stethoscope,
  FileText,
  Pill,
  FlaskConical,
  CreditCard,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  X,
  AlertTriangle,
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
  { label: 'Triage', href: '/triage', icon: AlertTriangle },
  { label: 'Encounters', href: '/encounters', icon: Stethoscope },
  { label: 'Admissions', href: '/admissions', icon: FileText },
  { label: 'Pharmacy', href: '/pharmacy', icon: Pill },
  { label: 'Laboratory', href: '/laboratory', icon: FlaskConical },
  { label: 'Billing', href: '/billing', icon: CreditCard },
  { label: 'Reports', href: '/reports', icon: FileText },
];

const bottomNavItems: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar({ collapsed, onCollapse, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const logout = useLogout();

  const NavLink = ({ item }: { item: NavItem }) => {
    // Handle special case for dashboard: both '/' and '/dashboard' should match
    const isActive = item.href === '/' 
      ? (pathname === '/' || pathname === '/dashboard' || pathname.startsWith('/dashboard/'))
      : (pathname === item.href || pathname.startsWith(`${item.href}/`));
    const Icon = item.icon;

    const linkContent = (
      <Link
        href={item.href}
        onClick={onMobileClose}
        data-active={isActive}
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
        role="complementary"
        data-testid="sidebar"
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
