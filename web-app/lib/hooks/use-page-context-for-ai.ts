/**
 * Hook to auto-populate AIPageContext and default quick actions from the
 * current route.
 *
 * Reads the Next.js pathname, resolves a human-readable page title and
 * module name from the navigation config, and syncs it into the AI chat
 * context so TibaBot knows which page the user is viewing.
 *
 * Also sets module-level default quick actions so every page shows
 * contextual shortcuts in the chat widget. Pages that register their
 * own quick actions via `setQuickActions()` will override these defaults.
 *
 * Must be used inside both AIChatProvider and Next.js router context.
 */
'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useOptionalAIChatContext } from '@/lib/context/ai-chat-context';
import { mainNavItems, bottomNavItems, hasChildren } from '@/lib/config/navigation';
import type { NavItem, NavItemType } from '@/lib/config/navigation';
import type { AIPageContext, AIQuickAction } from '@/lib/types/ai';

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
  { pattern: /^\/admissions\/\d+\/ward-round\/new/, title: 'New Ward Round', module: 'inpatient' },
  { pattern: /^\/admissions\/\d+\/ward-round\/\d+/, title: 'Ward Round Detail', module: 'inpatient' },
  { pattern: /^\/admissions\/\d+\/ward-round/, title: 'Ward Rounds', module: 'inpatient' },
  { pattern: /^\/admissions\/\d+\/kardex/, title: 'Nursing Kardex', module: 'inpatient' },
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
// Default quick actions per module
// =============================================================================

/**
 * Module-level default quick actions shown when a page doesn't register
 * its own via `setQuickActions()`. These are generic prompts relevant to
 * the module the user is browsing.
 */
const DEFAULT_MODULE_QUICK_ACTIONS: Record<string, AIQuickAction[]> = {
  laboratory: [
    {
      id: 'lab-interpret-general',
      label: 'Interpret lab results',
      query:
        'Help me interpret the lab results I\'m looking at. What are the key findings and clinical significance?',
      userMessage: 'Requesting lab result interpretation...',
    },
    {
      id: 'lab-reference-ranges',
      label: 'Reference ranges',
      query:
        'What are the normal reference ranges for common lab tests? Include CBC, BMP, LFTs, and urinalysis.',
      userMessage: 'Looking up reference ranges...',
    },
    {
      id: 'lab-critical-values',
      label: 'Critical value guide',
      query:
        'What lab values are considered critical and require immediate notification? List by test type.',
      userMessage: 'Checking critical value thresholds...',
    },
  ],
  inpatient: [
    {
      id: 'inpatient-discharge-criteria',
      label: 'Discharge criteria',
      query:
        'What are the general discharge readiness criteria I should assess for this patient?',
      userMessage: 'Checking discharge readiness criteria...',
    },
    {
      id: 'inpatient-ward-round-tips',
      label: 'Ward round checklist',
      query:
        'What should I review during a ward round? Provide a structured checklist including vitals trends, medication review, investigations, and care plan updates.',
      userMessage: 'Generating ward round checklist...',
    },
    {
      id: 'inpatient-fall-risk',
      label: 'Fall risk assessment',
      query:
        'What are the key fall risk factors I should assess for inpatients? Include the Morse Fall Scale criteria.',
      userMessage: 'Reviewing fall risk factors...',
    },
  ],
  pharmacy: [
    {
      id: 'pharmacy-interactions',
      label: 'Drug interactions',
      query:
        'Help me check for potential drug interactions. What are the most clinically significant interactions I should watch for?',
      userMessage: 'Checking drug interactions...',
    },
    {
      id: 'pharmacy-dosing',
      label: 'Dosing guidance',
      query:
        'What are the standard adult dosing guidelines for commonly prescribed medications?',
      userMessage: 'Looking up dosing guidance...',
    },
    {
      id: 'pharmacy-renal-dosing',
      label: 'Renal dose adjustment',
      query:
        'Which medications require renal dose adjustment? Provide guidelines for common drugs based on GFR ranges.',
      userMessage: 'Checking renal dose adjustments...',
    },
  ],
  patients: [
    {
      id: 'patients-history-tips',
      label: 'History taking guide',
      query:
        'What are the key elements of a comprehensive patient history? Provide a structured approach.',
      userMessage: 'Loading history taking guide...',
    },
    {
      id: 'patients-screening',
      label: 'Screening recommendations',
      query:
        'What routine health screenings should be recommended based on age and gender? Include Kenya-specific guidelines.',
      userMessage: 'Checking screening recommendations...',
    },
  ],
  encounters: [
    {
      id: 'encounters-soap-guide',
      label: 'SOAP note guide',
      query:
        'How should I structure a SOAP note? Provide guidance on what to include in each section (Subjective, Objective, Assessment, Plan).',
      userMessage: 'Loading SOAP note guide...',
    },
    {
      id: 'encounters-ddx-approach',
      label: 'Differential diagnosis approach',
      query:
        'What is a systematic approach to generating a differential diagnosis? Include frameworks like VINDICATE or SOCRATES.',
      userMessage: 'Loading DDx approach...',
    },
  ],
  imaging: [
    {
      id: 'imaging-ordering-guide',
      label: 'Imaging selection guide',
      query:
        'Help me choose the appropriate imaging study. What are the indications for X-ray vs CT vs MRI vs ultrasound?',
      userMessage: 'Loading imaging selection guide...',
    },
    {
      id: 'imaging-contrast-safety',
      label: 'Contrast safety',
      query:
        'What are the contraindications for IV contrast media? Include guidelines for renal function, allergies, and metformin.',
      userMessage: 'Checking contrast safety...',
    },
  ],
  emergency: [
    {
      id: 'emergency-acls',
      label: 'ACLS protocols',
      query:
        'Summarize the key ACLS algorithms: cardiac arrest, bradycardia, tachycardia, and acute coronary syndromes.',
      userMessage: 'Loading ACLS protocols...',
    },
    {
      id: 'emergency-triage-categories',
      label: 'KETA triage categories',
      query:
        'Explain the Kenya Emergency Triage Assessment (KETA) categories: RED, ORANGE, YELLOW, GREEN, BLUE. Include criteria for each.',
      userMessage: 'Loading KETA triage categories...',
    },
    {
      id: 'emergency-toxicology',
      label: 'Poisoning management',
      query:
        'What is the general approach to managing an unknown poisoning? Include decontamination, antidotes, and supportive care.',
      userMessage: 'Loading poisoning management guide...',
    },
  ],
  surveillance: [
    {
      id: 'surveillance-notifiable',
      label: 'Notifiable diseases',
      query:
        'What diseases are immediately notifiable in Kenya? Include the reporting timeline and authority to notify.',
      userMessage: 'Loading notifiable disease list...',
    },
    {
      id: 'surveillance-outbreak',
      label: 'Outbreak investigation',
      query:
        'What are the steps in an outbreak investigation? Provide a structured approach using the CDC framework.',
      userMessage: 'Loading outbreak investigation guide...',
    },
  ],
  finance: [
    {
      id: 'finance-sha-claims',
      label: 'SHA claims guide',
      query:
        'What are the common reasons SHA claims get rejected? Provide tips for successful claim submission.',
      userMessage: 'Loading SHA claims guide...',
    },
  ],
  mch: [
    {
      id: 'mch-anc-schedule',
      label: 'ANC visit schedule',
      query:
        'What is the recommended ANC visit schedule per WHO and Kenya MOH guidelines? Include key assessments at each visit.',
      userMessage: 'Loading ANC schedule...',
    },
    {
      id: 'mch-danger-signs',
      label: 'Pregnancy danger signs',
      query:
        'What are the danger signs in pregnancy that require immediate referral? Include both maternal and fetal indicators.',
      userMessage: 'Checking pregnancy danger signs...',
    },
  ],
};

/**
 * Get default quick actions for a resolved page context.
 */
function getDefaultQuickActions(ctx: AIPageContext): AIQuickAction[] {
  return DEFAULT_MODULE_QUICK_ACTIONS[ctx.module] ?? [];
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Auto-sync the current page context and default quick actions into the
 * AI chat provider.
 *
 * Call this hook once in the dashboard layout. It watches the Next.js
 * pathname and updates the AI chat context's `pageContext` whenever the
 * user navigates. It also sets module-level default quick actions.
 *
 * Pages that call `setQuickActions()` directly (e.g., encounter detail)
 * will override these defaults. When those pages unmount and clear their
 * actions, a short delay allows the next page's defaults to take effect.
 */
export function usePageContextForAI(): void {
  const pathname = usePathname();
  const chatCtx = useOptionalAIChatContext();
  // Extract the stable callbacks to avoid depending on the entire context object,
  // which changes reference whenever state updates (infinite loop).
  const setPageContext = chatCtx?.setPageContext;
  const setQuickActions = chatCtx?.setQuickActions;

  // Track whether a page-specific component has overridden the defaults.
  // We use a ref so that the effect cleanup from specific pages (which call
  // setQuickActions([])) doesn't create stale closure issues.
  const defaultActionsRef = useRef<AIQuickAction[]>([]);

  useEffect(() => {
    if (!setPageContext || !pathname) return;

    const ctx = resolvePageContext(pathname);
    setPageContext(ctx);

    // Set default quick actions for this module.
    // Pages that register their own will call setQuickActions() in their
    // own useEffect, which runs after this layout-level effect.
    const defaults = getDefaultQuickActions(ctx);
    defaultActionsRef.current = defaults;

    if (setQuickActions && defaults.length > 0) {
      setQuickActions(defaults);
    }
  }, [pathname, setPageContext, setQuickActions]);
}
