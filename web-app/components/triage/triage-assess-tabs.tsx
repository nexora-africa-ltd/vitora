/**
 * TriageAssessTabs Component
 *
 * Navigation tabs for the triage assessment workflow.
 * Uses URL-based tab navigation for proper browser history support.
 *
 * Tabs:
 * - Vitals: Temperature, BP, HR, SpO2, RR, etc.
 * - History: Allergies, medications, past encounters
 * - Assessment: Category calculation, alerts, notes
 * - Route/Dispose: Clinic selection, disposition, routing
 */
'use client';

import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  History,
  ClipboardCheck,
  ArrowRightCircle,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useTriageAssessStore, getSectionStatus } from '@/lib/stores/triage-assess-store';
import type { TriageAssessSession } from '@/lib/stores/triage-assess-store';
import { Badge } from '@/components/ui/badge';

// =============================================================================
// Tab Configuration
// =============================================================================

interface TabConfig {
  id: string;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  path: string;
  description: string;
  sectionKey?: 'vitals' | 'history' | 'assessment' | 'route';
}

const TABS: TabConfig[] = [
  {
    id: 'vitals',
    label: 'Vitals',
    shortLabel: 'Vitals',
    icon: <Activity className="h-4 w-4" />,
    path: '/vitals',
    description: 'Record vital signs',
    sectionKey: 'vitals',
  },
  {
    id: 'history',
    label: 'History',
    shortLabel: 'History',
    icon: <History className="h-4 w-4" />,
    path: '/history',
    description: 'Review patient history',
    sectionKey: 'history',
  },
  {
    id: 'assessment',
    label: 'Assessment',
    shortLabel: 'Assess',
    icon: <ClipboardCheck className="h-4 w-4" />,
    path: '/assessment',
    description: 'Triage category assessment',
    sectionKey: 'assessment',
  },
  {
    id: 'route',
    label: 'Route',
    shortLabel: 'Route',
    icon: <ArrowRightCircle className="h-4 w-4" />,
    path: '/route',
    description: 'Route to clinic or area',
    sectionKey: 'route',
  },
];

// =============================================================================
// Component
// =============================================================================

export function TriageAssessTabs() {
  const params = useParams();
  const pathname = usePathname();
  const { triageStatus } = useEncounterContext();
  const { getSectionCompletion, getSession } = useTriageAssessStore();

  const patientId = params.patientId as string;
  const encounterId = params.encounterId as string;
  const encounterIdNum = parseInt(encounterId, 10);

  const completion = getSectionCompletion(encounterIdNum);
  const session = getSession(encounterIdNum);

  // Base path for tab links
  const basePath = `/triage/assess/${patientId}/${encounterId}`;

  // Determine active tab from pathname
  const getActiveTab = () => {
    for (const tab of TABS) {
      if (pathname.endsWith(tab.path)) {
        return tab.id;
      }
    }
    // Default to vitals if on base path
    return 'vitals';
  };

  const activeTab = getActiveTab();

  // Check if triage is already completed
  const isCompleted = triageStatus === 'COMPLETED';

  return (
    <div className="border-b bg-card">
      <nav
        className="flex items-center gap-1 px-2 sm:px-4 overflow-x-auto"
        aria-label="Triage assessment tabs"
      >
        {TABS.map((tab, index) => {
          const isActive = activeTab === tab.id;
          const href = tab.id === 'vitals' ? basePath : `${basePath}${tab.path}`;
          const isComplete = tab.sectionKey && completion?.[tab.sectionKey];
          const sectionStatus = tab.sectionKey
            ? getSectionStatus(tab.sectionKey, session)
            : 'not-started';
          const isIncomplete = sectionStatus === 'incomplete';

          return (
            <Link
              key={tab.id}
              href={href}
              className={cn(
                'relative flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 sm:py-3 text-sm font-medium',
                'border-b-2 transition-colors whitespace-nowrap',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Amber pulsing dot for incomplete sections */}
              {isIncomplete && !isActive && (
                <span
                  className="absolute -top-0.5 right-1 sm:right-2 flex h-2.5 w-2.5"
                  title="This section has missing required fields"
                >
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                </span>
              )}

              {/* Step number — green tick when complete, amber outline when incomplete */}
              <span
                className={cn(
                  'hidden sm:flex items-center justify-center w-5 h-5 rounded-full text-xs',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isComplete
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : isIncomplete
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 ring-1 ring-amber-400/50'
                        : 'bg-muted text-muted-foreground'
                )}
              >
                {isComplete ? <Check className="h-3 w-3" /> : index + 1}
              </span>

              {/* Icon — green when complete, amber when incomplete */}
              <span className={cn(
                isActive
                  ? 'text-primary'
                  : isComplete
                    ? 'text-green-600 dark:text-green-400'
                    : isIncomplete
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground'
              )}>
                {tab.icon}
              </span>

              {/* Label - Short on mobile, full on sm+ */}
              <span className="sm:hidden">{tab.shortLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </Link>
          );
        })}

        {/* Status indicator */}
        {isCompleted && (
          <Badge variant="outline" className="ml-auto shrink-0 text-green-600 border-green-300 bg-green-50">
            Completed
          </Badge>
        )}
      </nav>
    </div>
  );
}

// =============================================================================
// Exports
// =============================================================================

export default TriageAssessTabs;
