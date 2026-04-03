/**
 * EncounterEditTabs Component
 *
 * Navigation tabs for the encounter edit workflow.
 * Uses URL-based tab navigation for proper browser history support.
 *
 * Tabs:
 * - Vitals: Temperature, BP, HR, SpO2, RR, etc.
 * - History: Allergies, medications, medical history
 * - Notes: HPI, PE, Assessment, Clinical Templates
 * - Diagnosis: ICD-10/11 diagnoses
 * - Orders: Lab, imaging, pharmacy orders
 * - Referrals: Allied health, specialty, admission referrals
 * - Review: SOAP summary and finalization
 */
'use client';

import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  FileText,
  ClipboardList,
  Stethoscope,
  SquareDashedTopSolid,
  ArrowRightLeft,
  CheckSquare,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useEncounterEditStore } from '@/lib/stores/encounter-edit-store';
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
  sectionKey?: keyof ReturnType<typeof useEncounterEditStore.getState>['sessions'][number]['completedSections'];
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
    shortLabel: 'Hx',
    icon: <FileText className="h-4 w-4" />,
    path: '/history',
    description: 'Medical history',
    sectionKey: 'history',
  },
  {
    id: 'notes',
    label: 'Notes',
    shortLabel: 'HPI',
    icon: <ClipboardList className="h-4 w-4" />,
    path: '/notes',
    description: 'HPI, PE, Assessment',
    sectionKey: 'notes',
  },
  {
    id: 'diagnosis',
    label: 'Diagnosis',
    shortLabel: 'Dx',
    icon: <Stethoscope className="h-4 w-4" />,
    path: '/diagnosis',
    description: 'ICD-10 diagnoses',
    sectionKey: 'diagnosis',
  },
  {
    id: 'orders',
    label: 'Orders',
    shortLabel: 'Ord',
    icon: <SquareDashedTopSolid className="h-4 w-4" />,
    path: '/orders',
    description: 'Lab, imaging, pharmacy',
    sectionKey: 'orders',
  },
  {
    id: 'referrals',
    label: 'Referrals',
    shortLabel: 'Ref',
    icon: <ArrowRightLeft className="h-4 w-4" />,
    path: '/referrals',
    description: 'Referrals and routing',
    sectionKey: 'referrals',
  },
  {
    id: 'review',
    label: 'Review',
    shortLabel: 'Rev',
    icon: <CheckSquare className="h-4 w-4" />,
    path: '/review',
    description: 'SOAP summary and finalize',
  },
];

// =============================================================================
// Component
// =============================================================================

export function EncounterEditTabs() {
  const params = useParams();
  const pathname = usePathname();
  const { encounter, isLoading } = useEncounterContext();
  const { getSectionCompletion } = useEncounterEditStore();

  const encounterId = Number(params.id);
  const completion = getSectionCompletion(encounterId);

  // Base path for tab links
  const basePath = `/encounters/${encounterId}/edit`;

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

  // Check if encounter is closed/cancelled
  const isReadOnly = encounter?.status === 'CLOSED' || encounter?.status === 'CANCELLED';

  if (isLoading) {
    return (
      <div className="border-b bg-card">
        <div className="flex items-center gap-1 px-2 sm:px-4 h-12">
          <div className="animate-pulse bg-muted h-8 w-full rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="border-b bg-card">
      <nav
        className="flex items-center gap-0.5 sm:gap-1 px-2 sm:px-4 overflow-x-auto scrollbar-thin"
        aria-label="Encounter edit tabs"
      >
        {TABS.map((tab, index) => {
          const isActive = activeTab === tab.id;
          const href = tab.id === 'vitals' ? basePath : `${basePath}${tab.path}`;
          const isComplete = tab.sectionKey && completion?.[tab.sectionKey];

          return (
            <Link
              key={tab.id}
              href={href}
              className={cn(
                'flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-medium',
                'border-b-2 transition-colors whitespace-nowrap',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Step number for workflow visualization - hidden on mobile */}
              <span
                className={cn(
                  'hidden md:flex items-center justify-center w-5 h-5 rounded-full text-xs',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isComplete
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {isComplete ? <Check className="h-3 w-3" /> : index + 1}
              </span>

              {/* Icon */}
              <span className={cn(
                isActive ? 'text-primary' : isComplete ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
              )}>
                {tab.icon}
              </span>

              {/* Label - Short on mobile, full on md+ */}
              <span className="md:hidden">{tab.shortLabel}</span>
              <span className="hidden md:inline">{tab.label}</span>
            </Link>
          );
        })}

        {/* Status indicator */}
        {isReadOnly && (
          <Badge variant="outline" className="ml-auto shrink-0 text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800">
            Read-only
          </Badge>
        )}
      </nav>
    </div>
  );
}

// =============================================================================
// Exports
// =============================================================================

export default EncounterEditTabs;
