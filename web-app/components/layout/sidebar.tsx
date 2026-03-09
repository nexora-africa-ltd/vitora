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
import { useTheme } from 'next-themes';
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
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useFacility } from '@/lib/context/facility-context';
import {
  mainNavItems,
  bottomNavItems,
  hasChildren,
  findParentForPath,
  type NavItem,
  type NavItemType,
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
// Logo Component
// -----------------------------------------------------------------------------

function SidebarLogo({ collapsed }: { collapsed: boolean }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Default to light mode (dark logo) until mounted and theme resolved
  const isDark = mounted && resolvedTheme === 'dark';

  // Show placeholder during SSR/hydration
  if (!mounted) {
    return (
      <div className={cn(
        'flex items-center',
        collapsed ? 'justify-center' : 'w-full'
      )}>
        {collapsed ? (
          <div className="h-12 w-12 rounded-md bg-muted animate-pulse" />
        ) : (
          <div className="h-12 w-full rounded bg-muted animate-pulse" />
        )}
      </div>
    );
  }

  if (collapsed) {
    // Collapsed: show icon only
    // Light mode = dark icon, Dark mode = light icon
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={isDark ? '/light-icon.png' : '/dark-icon.png'}
        alt="Vitora"
        className="w-full object-cover py-1"
      />
    );
  }

  // Expanded: show full logo - fill sidebar width
  // Light mode = dark logo, Dark mode = light logo
  // Using native img for better control over square images with internal padding
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={isDark ? '/light-theme-logo.png' : '/dark-theme-logo.png'}
      alt="Vitora HMIS"
      className="w-full object-cover py-1"
    />
  );
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

/**
 * Filter nav items based on user RBAC permissions and facility capabilities.
 * Items with a moduleKey are hidden if the user cannot access that module.
 * Items with a facilityModule are hidden if the facility doesn't support it.
 * Parent groups with no visible children are also hidden.
 */
function useFilteredNavItems(): NavItemType[] {
  const { canAccessModule } = usePermissions();
  const { hasModule } = useFacility();

  return useMemo(() => {
    const isAllowed = (item: { moduleKey?: string; facilityModule?: string }): boolean => {
      if (item.moduleKey && !canAccessModule(item.moduleKey as any)) return false;
      if (item.facilityModule && !hasModule(item.facilityModule as any)) return false;
      return true;
    };

    const filterItem = (item: NavItemType): NavItemType | null => {
      if (!isAllowed(item)) return null;

      // For parent items with children, filter children too
      if (hasChildren(item)) {
        const filteredChildren = item.children
          .map((child): NavItem | null => {
            if (!isAllowed(child)) return null;
            return child;
          })
          .filter((c): c is NavItem => c !== null);

        // Hide parent if no children remain
        if (filteredChildren.length === 0) return null;

        return { ...item, children: filteredChildren };
      }

      return item;
    };

    return mainNavItems
      .map(filterItem)
      .filter((item): item is NavItemType => item !== null);
  }, [canAccessModule, hasModule]);
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
      <div className={cn(
        'flex shrink-0 items-center justify-center rounded-md transition-all',
        collapsed ? 'h-10 w-10' : 'h-8 w-8',
        'group-hover:scale-110 group-hover:bg-cyan-500/15'
      )}>
        <Icon className={cn(collapsed ? 'h-6 w-6' : 'h-5 w-5')} />
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-transform group-hover:scale-110 group-hover:bg-cyan-500/15">
              <Icon className="h-6 w-6" />
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
  const filteredNavItems = useFilteredNavItems();

  const navScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useSidebarPersistence(collapsed, onCollapse);

  // Track scroll position for fade effect
  useEffect(() => {
    const scrollArea = navScrollAreaRef.current;
    if (!scrollArea) return;

    const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;

    const handleScroll = () => {
      setIsScrolled(viewport.scrollTop > 8);
    };

    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []);

  const activeParent = useMemo(
    () => findParentForPath(pathname),
    [pathname]
  );

  // Also track which filtered parent labels exist so we don't auto-open removed items
  const filteredParentLabels = useMemo(
    () => new Set(filteredNavItems.filter(hasChildren).map(i => i.label)),
    [filteredNavItems]
  );

  const [openMenus, setOpenMenus] = useState<string[]>(
    activeParent ? [activeParent] : []
  );

  const lastAutoOpenedParentRef = useRef<string | null>(null);

  useEffect(() => {
    // Auto-open the current parent when navigation changes into a new section,
    // but do not force it to stay open (users should be able to collapse it
    // even if a child route is currently active).
    if (activeParent && filteredParentLabels.has(activeParent) && lastAutoOpenedParentRef.current !== activeParent) {
      setOpenMenus((prev) => (prev.includes(activeParent) ? prev : [...prev, activeParent]));
      lastAutoOpenedParentRef.current = activeParent;
    }
  }, [activeParent, filteredParentLabels]);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-dvh border-r bg-card/95 backdrop-blur transition-all duration-300 overscroll-contain',
          collapsed ? 'w-20' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full xl:translate-x-0'
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-20 items-center justify-between px-3 mt-2">
            <Link href="/" className="flex flex-1 items-center py-2">
              <SidebarLogo collapsed={collapsed} />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="xl:hidden shrink-0"
              onClick={onMobileClose}
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="relative flex-1 min-h-0">
            {/* Top fade gradient when scrolled */}
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-card/95 via-card/60 to-transparent transition-opacity duration-200',
                isScrolled ? 'opacity-100' : 'opacity-0'
              )}
            />
            <ScrollArea
              ref={navScrollAreaRef}
              className="h-full min-h-0 px-3 [&_[data-slot=scroll-area-viewport]]:overscroll-contain [&_[data-slot=scroll-area-viewport]]:touch-pan-y"
            >
              <div className="space-y-1 py-2">
                {filteredNavItems.map((item) =>
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
