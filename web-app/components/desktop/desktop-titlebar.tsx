// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Frameless Tauri window chrome with route-based workspace tabs and window controls.
 * Render once above the dashboard header; it is hidden outside the desktop shell.
 */
'use client';

import { startTransition, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Maximize2, Minus, X } from 'lucide-react';
import {
  closeDesktopWindow,
  dragDesktopWindow,
  isDesktop,
  minimizeDesktopWindow,
  toggleMaximizeDesktopWindow,
} from '@/lib/desktop';
import { useDesktopWorkspaceStore } from '@/lib/stores/ui-store';

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/patients': 'Patients',
  '/encounters': 'Encounters',
  '/triage': 'Triage',
  '/admissions': 'Admissions',
  '/laboratory': 'Laboratory',
  '/pharmacy': 'Pharmacy',
  '/inventory': 'Inventory',
  '/clinics': 'Clinics',
  '/scheduling': 'Scheduling',
  '/transactions': 'Transactions',
};

const ENTITY_ROUTE_PATTERN =
  /^\/(?:patients|encounters|transactions\/invoices|laboratory\/orders|admissions|pharmacy\/prescriptions|theatre\/cases)\/[^/]+\/?$/;

function getRouteTitle(pathname: string): string {
  const exactTitle = ROUTE_LABELS[pathname];
  if (exactTitle) return exactTitle;

  const parent = Object.entries(ROUTE_LABELS).find(([route]) => pathname.startsWith(`${route}/`));
  if (parent) return parent[1];

  const segment = pathname.split('/').filter(Boolean).at(-1) || 'Workspace';
  return segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function DesktopTitlebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabs = useDesktopWorkspaceStore((state) => state.tabs);
  const activeTabId = useDesktopWorkspaceStore((state) => state.activeTabId);
  const updateActiveFromRoute = useDesktopWorkspaceStore((state) => state.updateActiveFromRoute);
  const openTab = useDesktopWorkspaceStore((state) => state.openTab);
  const setActive = useDesktopWorkspaceStore((state) => state.setActive);
  const closeTab = useDesktopWorkspaceStore((state) => state.closeTab);
  const getNextAfterClose = useDesktopWorkspaceStore((state) => state.getNextAfterClose);
  const desktopMode = isDesktop();
  const queryString = searchParams.toString();
  const currentRoute = queryString ? `${pathname}?${queryString}` : pathname;

  useEffect(() => {
    if (desktopMode) updateActiveFromRoute({ route: currentRoute, title: getRouteTitle(pathname) });
  }, [currentRoute, desktopMode, pathname, updateActiveFromRoute]);

  useEffect(() => {
    if (!desktopMode) return;

    const openEntityLink = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !ENTITY_ROUTE_PATTERN.test(url.pathname)) return;

      event.preventDefault();
      const route = `${url.pathname}${url.search}`;
      openTab({ route, title: getRouteTitle(url.pathname) });
      startTransition(() => router.push(route));
    };

    const handleClick = (event: MouseEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.button === 0) openEntityLink(event);
    };
    const handleAuxClick = (event: MouseEvent) => {
      if (event.button === 1) openEntityLink(event);
    };

    document.addEventListener('click', handleClick, true);
    document.addEventListener('auxclick', handleAuxClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('auxclick', handleAuxClick, true);
    };
  }, [desktopMode, openTab, router]);

  if (!desktopMode) return null;

  const navigate = (tab: (typeof tabs)[number]) => {
    setActive(tab.id);
    startTransition(() => router.push(tab.route));
  };

  const handleCloseTab = (tab: (typeof tabs)[number]) => {
    const fallbackRoute = activeTabId === tab.id ? getNextAfterClose(tab.id)?.route || '/dashboard' : null;
    closeTab(tab.id);
    if (fallbackRoute) startTransition(() => router.push(fallbackRoute));
  };

  return (
    <div className="flex h-9 select-none border-b border-border bg-card text-foreground">
      <button
        type="button"
        aria-label="Drag Vitora window"
        onMouseDown={(event) => {
          if (event.button === 0) void dragDesktopWindow();
        }}
        onDoubleClick={() => void toggleMaximizeDesktopWindow()}
        className="flex w-28 shrink-0 items-center gap-2 px-3 text-xs font-semibold tracking-wide text-muted-foreground hover:bg-muted"
      >
        <span className="grid h-4 w-4 place-items-center rounded-sm bg-primary text-[9px] text-primary-foreground">
          V
        </span>
        Vitora
      </button>
      <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto px-1 pt-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex h-7 max-w-52 shrink-0 items-center gap-1 rounded-t-md border border-b-0 px-2 text-xs ${
              tab.id === activeTabId
                ? 'border-border bg-background text-foreground'
                : 'border-transparent text-muted-foreground hover:bg-muted'
            }`}
          >
            <button
              type="button"
              onClick={() => navigate(tab)}
              className="min-w-0 flex-1 truncate text-left"
            >
              {tab.title}
            </button>
            <button
              type="button"
              onClick={() => handleCloseTab(tab)}
              className="rounded p-0.5 hover:bg-muted-foreground/20"
              aria-label={`Close ${tab.title} tab`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <div
          aria-hidden="true"
          className="min-w-8 flex-1 self-stretch"
          onMouseDown={(event) => {
            if (event.button === 0) void dragDesktopWindow();
          }}
          onDoubleClick={() => void toggleMaximizeDesktopWindow()}
        />
      </div>
      <div className="flex shrink-0">
        <button
          type="button"
          aria-label="Minimize window"
          onClick={() => void minimizeDesktopWindow()}
          className="grid w-11 place-items-center hover:bg-muted"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Maximize window"
          onClick={() => void toggleMaximizeDesktopWindow()}
          className="grid w-11 place-items-center hover:bg-muted"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Close window"
          onClick={() => void closeDesktopWindow()}
          className="grid w-11 place-items-center hover:bg-destructive hover:text-destructive-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
