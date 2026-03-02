/**
 * Hook to auto-populate AIPageContext from the current route.
 *
 * Reads the Next.js pathname, resolves a human-readable page title and
 * module name from the navigation config, and syncs it into the AI chat
 * context so TibaBot knows which page the user is viewing.
 *
 * Must be used inside both AIChatProvider and Next.js router context.
 */
'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useOptionalAIChatContext } from '@/lib/context/ai-chat-context';
import { mainNavItems, bottomNavItems, hasChildren } from '@/lib/config/navigation';
import type { NavItem, NavItemType } from '@/lib/config/navigation';
import type { AIPageContext } from '@/lib/types/ai';

// =============================================================================
// Route → Page title / module resolution
// =============================================================================

/**
 * Well-known dynamic route patterns that don't appear in the static nav config.
 * Mapped by regex pattern → { title template, module }.
 */
const DYNAMIC_ROUTE_PATTERNS: { pattern: RegExp; title: string; module: string }[] = [
  { pattern: /^\/patients\/\d+/, title: 'Patient Detail', module: 'patients' },
  { pattern: /^\/patients\/checkin/, title: 'Check-in', module: 'patients' },
  { pattern: /^\/encounters\/\d+/, title: 'Encounter Detail', module: 'encounters' },
  { pattern: /^\/pharmacy\/\d+/, title: 'Prescription Detail', module: 'pharmacy' },
  { pattern: /^\/laboratory\/\d+/, title: 'Lab Order Detail', module: 'laboratory' },
  { pattern: /^\/imaging\/orders\/\d+/, title: 'Imaging Order Detail', module: 'imaging' },
  { pattern: /^\/imaging\/studies\/\d+/, title: 'DICOM Study Detail', module: 'imaging' },
  { pattern: /^\/admissions\/\d+/, title: 'Admission Detail', module: 'inpatient' },
  { pattern: /^\/wards\/\d+/, title: 'Ward Detail', module: 'inpatient' },
  { pattern: /^\/transactions\/invoices\/\d+/, title: 'Invoice Detail', module: 'finance' },
  { pattern: /^\/transactions\/receipts\/\d+/, title: 'Receipt Detail', module: 'finance' },
  { pattern: /^\/transactions\/payments\/\d+/, title: 'Payment Detail', module: 'finance' },
  { pattern: /^\/transactions\/proformas\/\d+/, title: 'Proforma Detail', module: 'finance' },
  { pattern: /^\/transactions\/sha-claims\/\d+/, title: 'SHA Claim Detail', module: 'finance' },
  { pattern: /^\/surveillance\/cases\/\d+/, title: 'Notifiable Case Detail', module: 'surveillance' },
  { pattern: /^\/surveillance\/alerts\/\d+/, title: 'Alert Detail', module: 'surveillance' },
  { pattern: /^\/surveillance\/ihr\/\d+/, title: 'IHR Notification Detail', module: 'surveillance' },
  { pattern: /^\/mch\/\d+/, title: 'MCH Registration Detail', module: 'mch' },
  { pattern: /^\/admin\/staff\/\d+/, title: 'Staff Detail', module: 'admin' },
  { pattern: /^\/admin\/roles\/\d+/, title: 'Role Detail', module: 'admin' },
  { pattern: /^\/cds\/rules\/\d+/, title: 'CDS Rule Detail', module: 'cds' },
  { pattern: /^\/allied-health\/\w+\/\d+/, title: 'Allied Health Session Detail', module: 'allied-health' },
];

/**
 * Flatten all nav items (including children) into a flat list.
 */
function flattenNavItems(items: NavItemType[]): { item: NavItem; parentLabel?: string }[] {
  const result: { item: NavItem; parentLabel?: string }[] = [];
  for (const navItem of items) {
    if (hasChildren(navItem)) {
      for (const child of navItem.children) {
        result.push({ item: child, parentLabel: navItem.label });
      }
    } else {
      result.push({ item: navItem });
    }
  }
  return result;
}

const allNavEntries = flattenNavItems([...mainNavItems, ...bottomNavItems]);

/**
 * Derive module name from the route path.
 * Takes the first meaningful segment after the leading slash.
 */
function extractModule(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'dashboard';

  const firstSegment = segments[0]!;

  // Map certain top-level segments to logical module names
  const moduleMap: Record<string, string> = {
    transactions: 'finance',
    finance: 'finance',
    admin: 'admin',
    settings: 'settings',
    ai: 'ai',
  };

  return moduleMap[firstSegment] ?? firstSegment;
}

/**
 * Resolve the page title and parent module for a given pathname.
 */
export function resolvePageContext(pathname: string): AIPageContext {
  // 1. Try exact match from static nav config
  const exactMatch = allNavEntries.find((entry) => entry.item.href === pathname);
  if (exactMatch) {
    const title = exactMatch.parentLabel
      ? `${exactMatch.parentLabel} — ${exactMatch.item.label}`
      : exactMatch.item.label;
    return {
      route: pathname,
      page_title: title,
      module: extractModule(pathname),
    };
  }

  // 2. Try dynamic route patterns
  for (const { pattern, title, module: moduleName } of DYNAMIC_ROUTE_PATTERNS) {
    if (pattern.test(pathname)) {
      return { route: pathname, page_title: title, module: moduleName };
    }
  }

  // 3. Try prefix match (e.g., /clinics/general-opd/queue → "General OPD")
  // Sort by href length descending so longer (more specific) matches win
  const prefixMatches = allNavEntries
    .filter((entry) => pathname.startsWith(entry.item.href + '/') || pathname === entry.item.href)
    .sort((a, b) => b.item.href.length - a.item.href.length);

  if (prefixMatches.length > 0) {
    const best = prefixMatches[0]!;
    const title = best.parentLabel
      ? `${best.parentLabel} — ${best.item.label}`
      : best.item.label;
    return {
      route: pathname,
      page_title: title,
      module: extractModule(pathname),
    };
  }

  // 4. Fallback — capitalize the first path segment
  const moduleName = extractModule(pathname);
  const fallbackTitle = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
  return {
    route: pathname,
    page_title: fallbackTitle,
    module: moduleName,
  };
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Auto-sync the current page context into the AI chat provider.
 *
 * Call this hook once in the dashboard layout. It watches the Next.js
 * pathname and updates the AI chat context's `pageContext` whenever the
 * user navigates.
 */
export function usePageContextForAI(): void {
  const pathname = usePathname();
  const chatCtx = useOptionalAIChatContext();
  // Extract the stable callback to avoid depending on the entire context object,
  // which changes reference whenever pageContext state updates (infinite loop).
  const setPageContext = chatCtx?.setPageContext;

  useEffect(() => {
    if (!setPageContext || !pathname) return;

    const ctx = resolvePageContext(pathname);
    setPageContext(ctx);

    // No cleanup needed — the context updates on every navigation
  }, [pathname, setPageContext]);
}
