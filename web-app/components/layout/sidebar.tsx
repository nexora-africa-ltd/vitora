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
        isActive ? activeStyles : inactiveStyles
      )}
    >
      <div className="rounded-md p-1.5 transition-transform group-hover:scale-110 group-hover:bg-cyan-500/15">
        <Icon className="h-5 w-5 shrink-0" />
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
              'group flex w-full items-center justify-center rounded-lg px-3 py-2 transition-all',
              hasActiveChild
                ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300'
                : 'text-muted-foreground hover:bg-cyan-500/10'
            )}
          >
            <Icon className="h-5 w-5 transition-transform group-hover:scale-110" />
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
          <div className="rounded-md p-1.5 group-hover:bg-cyan-500/15">
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

  useSidebarPersistence(collapsed, onCollapse);

  const activeParent = useMemo(
    () => findParentForPath(pathname),
    [pathname]
  );

  const [openMenus, setOpenMenus] = useState<string[]>(
    activeParent ? [activeParent] : []
  );

  useEffect(() => {
    if (activeParent && !openMenus.includes(activeParent)) {
      setOpenMenus((prev) => [...prev, activeParent]);
    }
  }, [activeParent, openMenus]);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen border-r bg-card/95 backdrop-blur transition-all duration-300',
          collapsed ? 'w-16' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b">
          <span className="font-semibold">Vitora</span>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMobileClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <ScrollArea className="h-[calc(100vh-4rem)] px-3">
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

          <Separator className="my-2" />

          {bottomNavItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              collapsed={collapsed}
              pathname={pathname}
              onMobileClose={onMobileClose}
            />
          ))}

          <button
            onClick={logout}
            className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-destructive/15 hover:text-destructive active:scale-95 transition-all"
          >
            <LogOut className="h-5 w-5" />
            {!collapsed && <span>Logout</span>}
          </button>

          <Button
            variant="ghost"
            size="sm"
            className="mt-4 w-full"
            onClick={() => onCollapse(!collapsed)}
          >
            <ChevronLeft
              className={cn(
                'h-4 w-4 transition-transform',
                collapsed && 'rotate-180'
              )}
            />
          </Button>
        </ScrollArea>
      </aside>
    </TooltipProvider>
  );
}
