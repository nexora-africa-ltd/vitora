/**
 * NewEncounterTabs Component
 *
 * Navigation tabs for the new encounter workflow.
 * Uses URL-based tab navigation for proper browser history support.
 *
 * Tabs:
 * - Patient: Encounter type + select patient
 * - Complaint: Chief complaint
 * - History: Allergies, medications, medical history (optional)
 * - Notes: HPI, PE, Assessment (optional)
 * - Diagnosis: ICD-10/11 diagnoses (optional)
 * - Review: Summary and create
 */
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  User,
  FileText,
  ClipboardList,
  Stethoscope,
  CheckSquare,
  Check,
  ClipboardPlus,
  BedDouble,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useNewEncounterStore } from '@/lib/stores/new-encounter-store';
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
  sectionKey?: keyof NonNullable<ReturnType<typeof useNewEncounterStore.getState>['session']>['completedSections'];
  required?: boolean;
  /** Only show this tab when the predicate returns true */
  showWhen?: (encounterType: string) => boolean;
}

const TABS: TabConfig[] = [
  {
    id: 'patient',
    label: 'Patient',
    shortLabel: 'Pt',
    icon: <User className="h-4 w-4" />,
    path: '/patient',
    description: 'Select patient',
    sectionKey: 'patient',
    required: true,
  },
  {
    id: 'details',
    label: 'Complaint',
    shortLabel: 'CC',
    icon: <ClipboardPlus className="h-4 w-4" />,
    path: '/details',
    description: 'Chief complaint',
    sectionKey: 'details',
    required: true,
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
    description: 'Clinical notes',
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
    id: 'admission',
    label: 'Admission',
    shortLabel: 'Adm',
    icon: <BedDouble className="h-4 w-4" />,
    path: '/admission',
    description: 'Ward & bed assignment',
    sectionKey: 'admission',
    required: true,
    showWhen: (encounterType) => encounterType === 'IPD',
  },
  {
    id: 'review',
    label: 'Review',
    shortLabel: 'Rev',
    icon: <CheckSquare className="h-4 w-4" />,
    path: '/review',
    description: 'Review and create',
  },
];

// =============================================================================
// Component
// =============================================================================

export function NewEncounterTabs() {
  const pathname = usePathname();
  const { getSectionCompletion, isDirtyState, getDetails } = useNewEncounterStore();

  const completion = getSectionCompletion();
  const isDirty = isDirtyState();
  const encounterType = getDetails().encounter_type;

  // Filter tabs based on encounter type
  const visibleTabs = TABS.filter((tab) => !tab.showWhen || tab.showWhen(encounterType));

  // Base path for tab links
  const basePath = '/encounters/new';

  // Determine active tab from pathname
  const getActiveTab = () => {
    for (const tab of visibleTabs) {
      if (pathname.endsWith(tab.path)) {
        return tab.id;
      }
    }
    // Default to patient if on base path
    return 'patient';
  };

  const activeTab = getActiveTab();

  return (
    <div className="border-b bg-card">
      <nav
        className="flex items-center gap-0.5 sm:gap-1 px-2 sm:px-4 overflow-x-auto scrollbar-thin"
        aria-label="New encounter steps"
      >
        {visibleTabs.map((tab, index) => {
          const isActive = activeTab === tab.id;
          const href = tab.id === 'patient' ? basePath : `${basePath}${tab.path}`;
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

              {/* Required indicator */}
              {tab.required && !isComplete && (
                <span className="text-destructive text-xs">*</span>
              )}
            </Link>
          );
        })}

        {/* Unsaved changes indicator */}
        {isDirty && (
          <Badge variant="secondary" className="ml-auto shrink-0 text-xs">
            Unsaved
          </Badge>
        )}
      </nav>
    </div>
  );
}

// =============================================================================
// Exports
// =============================================================================

export default NewEncounterTabs;
