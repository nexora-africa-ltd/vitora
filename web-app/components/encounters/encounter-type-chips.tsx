'use client';

import { useMemo } from 'react';
import {
  Stethoscope,
  Siren,
  BedDouble,
  Baby,
  CalendarCheck,
  LayoutList,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { useEncounters } from '@/lib/hooks/use-encounters';

interface ChipConfig {
  type: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  activeColor: string;
}

const CHIP_CONFIGS: ChipConfig[] = [
  { type: '', label: 'All Types', shortLabel: 'All', icon: LayoutList, activeColor: 'bg-primary text-primary-foreground' },
  { type: 'OPD', label: 'Outpatient', shortLabel: 'OPD', icon: Stethoscope, activeColor: 'bg-blue-600 text-white dark:bg-blue-500' },
  { type: 'EMERGENCY', label: 'Emergency', shortLabel: 'Emerg', icon: Siren, activeColor: 'bg-red-600 text-white dark:bg-red-500' },
  { type: 'IPD', label: 'Inpatient', shortLabel: 'IPD', icon: BedDouble, activeColor: 'bg-purple-600 text-white dark:bg-purple-500' },
  { type: 'ANC', label: 'Antenatal', shortLabel: 'ANC', icon: Baby, activeColor: 'bg-pink-600 text-white dark:bg-pink-500' },
  { type: 'SCHEDULED_OPD', label: 'Scheduled', shortLabel: 'Sched', icon: CalendarCheck, activeColor: 'bg-teal-600 text-white dark:bg-teal-500' },
];

interface EncounterTypeChipsProps {
  selectedType: string;
  onTypeChange: (type: string) => void;
}

function useTypeCount(encounterType: string | undefined) {
  const { data, isLoading } = useEncounters({
    page: 1,
    page_size: 1,
    encounter_type: encounterType,
    encounter_date: new Date().toISOString().split('T')[0],
  });
  return { count: data?.count ?? 0, isLoading };
}

function ChipWithCount({
  config,
  isActive,
  onClick,
}: {
  config: ChipConfig;
  isActive: boolean;
  onClick: () => void;
}) {
  const { count, isLoading } = useTypeCount(config.type || undefined);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors',
        'border cursor-pointer whitespace-nowrap shrink-0',
        isActive
          ? cn(config.activeColor, 'border-transparent shadow-sm')
          : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <config.icon className="h-3.5 w-3.5 shrink-0" />
      <span className="sm:hidden">{config.shortLabel}</span>
      <span className="hidden sm:inline">{config.label}</span>
      {isLoading ? (
        <Skeleton className="h-4 w-5 rounded-full" />
      ) : (
        <Badge
          variant="secondary"
          className={cn(
            'h-5 min-w-[20px] px-1.5 text-xs font-semibold',
            isActive
              ? 'bg-white/20 text-inherit'
              : ''
          )}
        >
          {count}
        </Badge>
      )}
    </button>
  );
}

export function EncounterTypeChips({ selectedType, onTypeChange }: EncounterTypeChipsProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
      {CHIP_CONFIGS.map((config) => (
        <ChipWithCount
          key={config.type}
          config={config}
          isActive={selectedType === config.type}
          onClick={() => onTypeChange(config.type)}
        />
      ))}
    </div>
  );
}
