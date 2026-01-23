'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  memo,
} from 'react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ScrollMoreButton } from '@/components/ui/scroll-more-button';
import { useLogout } from '@/lib/auth/hooks';
import {
  mainNavItems,
  bottomNavItems,
  hasChildren,
  findParentForPath,
  type NavItem,
  type NavItemWithChildren,
} from '@/lib/config/navigation';

const SIDEBAR_COLLAPSED_KEY = 'vitora-sidebar-collapsed';

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

function useIsActive(href: string, pathname: string) {
  return useMemo(() => {
    if (href === '/') {
      return (
        pathname === '/' ||
        pathname === '/dashboard' ||
        pathname.startsWith('/dashboard/')
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }, [href, pathname]);
}

// -----------------------------------------------------------------------------
// Nav Link
// -----------------------------------------------------------------------------

const NavLink = memo(function NavLink({
  item,
  isChild = false,
  collapsed,
  pathname,
  onMobileClose,
}: NavLinkProps) {
  const isActive = useIsActive(item.href, pathname);
  const Icon = item.icon;

  const baseStyles =
    'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200';

  const activeStyles =
    'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-l-2 border-cyan-500 font-medium';

  const inactiveStyles =
    'text-muted-foreground hover:bg-cyan-500/10 hover:text-cyan-600 dark:hover:text-cyan-300 hover:translate-x-[2px] hover:scale-[1.02] active:scale-[0.98]';

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
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-transform group-hover:scale-110 group-hover:bg-cyan-500/15">
        <Icon className="h-5 w-5" />
      </div>

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
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
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
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-transform group-hover:scale-110 group-hover:bg-cyan-500/15">
              <Icon className="h-5 w-5" />
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all',
            hasActiveChild
              ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300'
              : 'text-muted-foreground hover:bg-cyan-500/10'
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md group-hover:bg-cyan-500/15">
            <Icon className="h-5 w-5" />
          </div>
          <span className="flex-1 text-left">{item.label}</span>
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
            onMobileClose={onMobileClose}
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
  const logout = useLogout();

  const navScrollAreaRef = useRef<HTMLDivElement | null>(null);

  useSidebarPersistence(collapsed, onCollapse);

  const activeParent = useMemo(
    () => findParentForPath(pathname),
    [pathname]
  );

  const [openMenus, setOpenMenus] = useState<string[]>(
    activeParent ? [activeParent] : []
  );

  const lastAutoOpenedParentRef = useRef<string | null>(null);

  useEffect(() => {
    // Auto-open the current parent when navigation changes into a new section,
    // but do not force it to stay open (users should be able to collapse it
    // even if a child route is currently active).
    if (activeParent && lastAutoOpenedParentRef.current !== activeParent) {
      setOpenMenus((prev) => (prev.includes(activeParent) ? prev : [...prev, activeParent]));
      lastAutoOpenedParentRef.current = activeParent;
    }
  }, [activeParent]);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen border-r bg-card/95 backdrop-blur transition-all duration-300',
          collapsed ? 'w-16' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between px-4 border-b">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
                <span className="text-lg font-bold text-primary-foreground">V</span>
              </div>
              {!collapsed && (
                <span className="font-semibold text-lg">Vitora</span>
              )}
            </Link>
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

          <div className="relative flex-1 min-h-0">
            <ScrollArea ref={navScrollAreaRef} className="h-full min-h-0 px-3">
              <div className="space-y-1 py-2">
                {mainNavItems.map((item) =>
                  hasChildren(item) ? (
                    <NavGroup
                      key={item.label}
                      item={item}
                      collapsed={collapsed}
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
                )}
              </div>
            </ScrollArea>
            <ScrollMoreButton scrollAreaRef={navScrollAreaRef} direction="down" />
            <ScrollMoreButton scrollAreaRef={navScrollAreaRef} direction="up" />
          </div>

          <div className="border-t px-2 py-2">
            <div className={cn('grid gap-1', collapsed ? 'grid-cols-1' : 'grid-cols-3')}>
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

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onCollapse(!collapsed)}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className={cn(
                      'inline-flex h-9 items-center justify-center rounded-md text-muted-foreground transition-colors',
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
