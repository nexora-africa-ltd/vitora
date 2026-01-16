'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  LogOut,
  X,
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
import {
  mainNavItems,
  bottomNavItems,
  hasChildren,
  findParentForPath,
  type NavItem,
  type NavItemWithChildren,
} from '@/lib/config/navigation';

// ============================================================================
// Constants
// ============================================================================

const SIDEBAR_COLLAPSED_KEY = 'vitora-sidebar-collapsed';

// ============================================================================
// Types
// ============================================================================

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
  onMobileClose: () => void;
}

interface NavGroupProps {
  item: NavItemWithChildren;
  collapsed: boolean;
  pathname: string;
  isOpen: boolean;
  onToggle: () => void;
  onMobileClose: () => void;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to persist sidebar collapsed state in localStorage
 */
function useSidebarPersistence(
  collapsed: boolean,
  onCollapse: (collapsed: boolean) => void
) {
  // Load initial state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored !== null) {
      onCollapse(stored === 'true');
    }
  }, [onCollapse]);

  // Save state to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);
}

/**
 * Hook to check if a nav item is active
 */
function useIsActive(href: string, pathname: string): boolean {
  return useMemo(() => {
    // Handle special case for dashboard: both '/' and '/dashboard' should match
    if (href === '/') {
      return pathname === '/' || pathname === '/dashboard' || pathname.startsWith('/dashboard/');
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }, [href, pathname]);
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Navigation link component (memoized for performance)
 */
const NavLink = memo(function NavLink({
  item,
  isChild = false,
  collapsed,
  pathname,
  onMobileClose,
}: NavLinkProps) {
  const isActive = useIsActive(item.href, pathname);
  const Icon = item.icon;

  const linkContent = (
    <Link
      href={item.href}
      onClick={onMobileClose}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-normal transition-colors',
        isChild && !collapsed && 'ml-4 pl-4 border-l border-border',
        isActive
          ? 'bg-primary/15 text-primary font-medium'
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
});

/**
 * Navigation group with collapsible children (memoized for performance)
 */
const NavGroup = memo(function NavGroup({
  item,
  collapsed,
  pathname,
  isOpen,
  onToggle,
  onMobileClose,
}: NavGroupProps) {
  const Icon = item.icon;
  
  const hasActiveChild = useMemo(() => {
    return item.children.some(
      child => pathname === child.href || pathname.startsWith(`${child.href}/`)
    );
  }, [item.children, pathname]);

  // In collapsed mode, show a dropdown with children on hover
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={item.label}
            aria-expanded={isOpen}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              hasActiveChild
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="p-0">
          <div className="py-1">
            <div className="px-3 py-1.5 text-sm font-semibold">{item.label}</div>
            {item.children.map((child) => {
              const isChildActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={onMobileClose}
                  aria-current={isChildActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 text-sm transition-colors',
                    isChildActive
                      ? 'bg-primary/15 text-primary font-medium'
                      : 'hover:bg-accent'
                  )}
                >
                  <child.icon className="h-4 w-4" />
                  {child.label}
                </Link>
              );
            })}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button
          aria-expanded={isOpen}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            hasActiveChild
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
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
          <NavLink
            key={child.href}
            item={child}
            isChild
            collapsed={collapsed}
            pathname={pathname}
            onMobileClose={onMobileClose}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
});

/**
 * Sidebar brand/logo section
 */
const SidebarBrand = memo(function SidebarBrand({
  collapsed,
  onMobileClose,
}: {
  collapsed: boolean;
  onMobileClose: () => void;
}) {
  return (
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
        aria-label="Close sidebar"
      >
        <X className="h-5 w-5" />
      </Button>
    </div>
  );
});

/**
 * Scroll indicator component
 */
const ScrollIndicator = memo(function ScrollIndicator({
  direction,
  visible,
}: {
  direction: 'up' | 'down';
  visible: boolean;
}) {
  const Icon = direction === 'up' ? ChevronUp : ChevronDown;
  const gradientClass = direction === 'up' 
    ? 'bg-gradient-to-b from-card to-transparent' 
    : 'bg-gradient-to-t from-card to-transparent';

  return (
    <div 
      className={cn(
        'flex justify-center py-1 transition-opacity duration-200',
        gradientClass,
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}
      aria-hidden="true"
    >
      <Icon className="h-4 w-4 text-muted-foreground animate-bounce" />
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export function Sidebar({ collapsed, onCollapse, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const logout = useLogout();
  
  // Persist collapsed state
  useSidebarPersistence(collapsed, onCollapse);
  
  // Auto-expand parent menu when child route is active
  const activeParent = useMemo(() => findParentForPath(pathname), [pathname]);
  
  const [openMenus, setOpenMenus] = useState<string[]>(() => {
    // Initialize with active parent if exists
    return activeParent ? [activeParent] : [];
  });
  
  // Auto-expand when route changes
  useEffect(() => {
    if (activeParent && !openMenus.includes(activeParent)) {
      setOpenMenus(prev => [...prev, activeParent]);
    }
  }, [activeParent, openMenus]);
  
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

  const toggleMenu = useCallback((label: string) => {
    setOpenMenus(prev => 
      prev.includes(label) 
        ? prev.filter(l => l !== label)
        : [...prev, label]
    );
  }, []);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        role="navigation"
        aria-label="Main navigation"
        data-testid="sidebar"
        className={cn(
          'fixed left-0 top-0 z-50 h-screen bg-card border-r transition-all duration-300',
          collapsed ? 'w-16' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <SidebarBrand collapsed={collapsed} onMobileClose={onMobileClose} />

        {/* Navigation */}
        <nav className="flex flex-col h-[calc(100vh-4rem)]" aria-label="Sidebar navigation">
          <ScrollIndicator direction="up" visible={canScrollUp} />
          
          <ScrollArea ref={scrollRef} className="flex-1 px-3">
            {/* Main nav items */}
            <div className="space-y-1 pb-2">
              {mainNavItems.map((item) => (
                hasChildren(item) ? (
                  <NavGroup
                    key={item.label}
                    item={item}
                    collapsed={collapsed}
                    pathname={pathname}
                    isOpen={openMenus.includes(item.label)}
                    onToggle={() => toggleMenu(item.label)}
                    onMobileClose={onMobileClose}
                  />
                ) : (
                  <NavLink
                    key={item.href}
                    item={item}
                    collapsed={collapsed}
                    pathname={pathname}
                    onMobileClose={onMobileClose}
                  />
                )
              ))}
            </div>
          </ScrollArea>
          
          <ScrollIndicator direction="down" visible={canScrollDown} />

          <div className="px-3 pb-3">
            <Separator className="my-2" />

            {/* Bottom nav items */}
            <div className="space-y-1">
              {bottomNavItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  pathname={pathname}
                  onMobileClose={onMobileClose}
                />
              ))}

              {/* Logout button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={logout}
                    aria-label="Logout"
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
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
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
