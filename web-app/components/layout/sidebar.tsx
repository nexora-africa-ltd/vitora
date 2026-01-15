'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
  ChevronDown,
  ChevronUp,
  LogOut,
  X,
  AlertTriangle,
  BedDouble,
  Building2,
  ClipboardList,
  Microscope,
  ScanLine,
  Shield,
  UserCog,
  ScrollText,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
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

interface NavItemWithChildren {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: NavItem[];
}

type NavItemType = NavItem | NavItemWithChildren;

function hasChildren(item: NavItemType): item is NavItemWithChildren {
  return 'children' in item;
}

const mainNavItems: NavItemType[] = [
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
    icon: Shield,
    children: [
      { label: 'Departments', href: '/admin/departments', icon: Building2 },
      { label: 'Roles', href: '/admin/roles', icon: Shield },
      { label: 'Staff', href: '/admin/staff', icon: UserCog },
      { label: 'Audit Logs', href: '/admin/audit-logs', icon: ScrollText },
    ],
  },
];

const bottomNavItems: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar({ collapsed, onCollapse, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const logout = useLogout();
  const [openMenus, setOpenMenus] = useState<string[]>(['Inpatient', 'Diagnostics', 'Admin']); // Default open
  
  // Scroll indicators
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    
    const viewport = el.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;
    if (!viewport) return;
    
    setCanScrollUp(viewport.scrollTop > 10);
    setCanScrollDown(viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 10);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    
    const viewport = el.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;
    if (!viewport) return;

    // Initial check
    checkScroll();
    
    // Check on scroll
    viewport.addEventListener('scroll', checkScroll);
    
    // Check on resize
    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(viewport);
    
    return () => {
      viewport.removeEventListener('scroll', checkScroll);
      resizeObserver.disconnect();
    };
  }, [checkScroll]);

  const toggleMenu = (label: string) => {
    setOpenMenus(prev => 
      prev.includes(label) 
        ? prev.filter(l => l !== label)
        : [...prev, label]
    );
  };

  const isChildActive = (children: NavItem[]) => {
    return children.some(child => 
      pathname === child.href || pathname.startsWith(`${child.href}/`)
    );
  };

  const NavLink = ({ item, isChild = false }: { item: NavItem; isChild?: boolean }) => {
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
          isChild && !collapsed && 'ml-4 pl-4 border-l border-border',
          isActive
            ? 'bg-cyan-300/10 text-accent-foreground hover:bg-cyan-450 hover:text-accent-foreground'
            : 'text-muted-foreground hover:bg-[#3D000F] hover:text-accent-foreground'
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
          <TooltipContent side="right" className="bg-cyan-300 text-cyan-900">
            {item.label}
            {item.badge && ` (${item.badge})`}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  const NavGroup = ({ item }: { item: NavItemWithChildren }) => {
    const Icon = item.icon;
    const isOpen = openMenus.includes(item.label);
    const hasActiveChild = isChildActive(item.children);

    // In collapsed mode, show a dropdown with children on hover
    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={item.label}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                hasActiveChild
                  ? 'bg-cyan-400 text-cyan-900'
                  : 'text-muted-foreground hover:bg-[#3D000F] hover:text-accent-foreground'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="p-0">
            <div className="py-1">
              <div className="px-3 py-1.5 text-sm font-semibold">{item.label}</div>
              {item.children.map((child) => (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={onMobileClose}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 text-sm transition-colors',
                    pathname === child.href || pathname.startsWith(`${child.href}/`)
                      ? 'bg-cyan-300 text-cyan-900'
                      : 'hover:bg-muted'
                  )}
                >
                  <child.icon className="h-4 w-4" />
                  {child.label}
                </Link>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Collapsible open={isOpen} onOpenChange={() => toggleMenu(item.label)}>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              hasActiveChild
                ? 'bg-cyan-300 text-cyan-900'
                : 'text-muted-foreground hover:bg-[#3D000F] hover:text-accent-foreground'
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1 pt-1">
          {item.children.map((child) => (
            <NavLink key={child.href} item={child} isChild />
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
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
        <nav className="flex flex-col h-[calc(100vh-4rem)]">
          {/* Scroll up indicator */}
          <div 
            className={cn(
              'flex justify-center py-1 bg-gradient-to-b from-card to-transparent transition-opacity duration-200',
              canScrollUp ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
          >
            <ChevronUp className="h-4 w-4 text-muted-foreground animate-bounce" />
          </div>
          
          <ScrollArea ref={scrollRef} className="flex-1 px-3">
            {/* Main nav items */}
            <div className="space-y-1 pb-2">
              {mainNavItems.map((item) => (
                hasChildren(item) ? (
                  <NavGroup key={item.label} item={item} />
                ) : (
                  <NavLink key={item.href} item={item} />
                )
              ))}
            </div>
          </ScrollArea>
          
          {/* Scroll down indicator */}
          <div 
            className={cn(
              'flex justify-center py-1 bg-gradient-to-t from-card to-transparent transition-opacity duration-200',
              canScrollDown ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground animate-bounce" />
          </div>

          <div className="px-3 pb-3">
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
          </div>
        </nav>
      </aside>
    </TooltipProvider>
  );
}
