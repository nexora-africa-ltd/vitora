/**
 * Treatment Type Select
 * 
 * A reusable searchable dropdown for selecting treatment types
 * across Allied Health modules (Physiotherapy, OT).
 */

'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { HelpPopover } from '@/components/shared/help-popover';
import type { PhysiotherapyTreatmentType } from '@/lib/types/physiotherapy';
import type { OTTreatmentType } from '@/lib/types/occupational-therapy';

// =============================================================================
// Types
// =============================================================================

/**
 * Union type for treatment types across modules
 */
export type TreatmentType = PhysiotherapyTreatmentType | OTTreatmentType;

/**
 * Category display configuration
 */
interface CategoryConfig {
  label: string;
  className?: string;
}

/**
 * Physiotherapy categories
 */
const PHYSIO_CATEGORY_LABELS: Record<string, CategoryConfig> = {
  MUSCULOSKELETAL: { label: 'Musculoskeletal', className: 'bg-blue-100 text-blue-800' },
  NEUROLOGICAL: { label: 'Neurological', className: 'bg-purple-100 text-purple-800' },
  CARDIORESPIRATORY: { label: 'Cardiorespiratory', className: 'bg-red-100 text-red-800' },
  PEDIATRIC: { label: 'Pediatric', className: 'bg-pink-100 text-pink-800' },
  GERIATRIC: { label: 'Geriatric', className: 'bg-amber-100 text-amber-800' },
  SPORTS: { label: 'Sports', className: 'bg-green-100 text-green-800' },
  WOMENS_HEALTH: { label: "Women's Health", className: 'bg-fuchsia-100 text-fuchsia-800' },
  POST_SURGICAL: { label: 'Post-Surgical', className: 'bg-orange-100 text-orange-800' },
  PAIN_MANAGEMENT: { label: 'Pain Management', className: 'bg-yellow-100 text-yellow-800' },
  ORTHOPEDIC: { label: 'Orthopedic', className: 'bg-teal-100 text-teal-800' },
  VESTIBULAR: { label: 'Vestibular', className: 'bg-indigo-100 text-indigo-800' },
  OTHER: { label: 'Other', className: 'bg-gray-100 text-gray-800' },
};

/**
 * OT categories
 */
const OT_CATEGORY_LABELS: Record<string, CategoryConfig> = {
  ADL_TRAINING: { label: 'ADL Training', className: 'bg-blue-100 text-blue-800' },
  COGNITIVE_REHAB: { label: 'Cognitive Rehab', className: 'bg-purple-100 text-purple-800' },
  HAND_THERAPY: { label: 'Hand Therapy', className: 'bg-orange-100 text-orange-800' },
  SENSORY_INTEGRATION: { label: 'Sensory Integration', className: 'bg-pink-100 text-pink-800' },
  PEDIATRIC_OT: { label: 'Pediatric OT', className: 'bg-cyan-100 text-cyan-800' },
  MENTAL_HEALTH_OT: { label: 'Mental Health OT', className: 'bg-emerald-100 text-emerald-800' },
  WORK_REHAB: { label: 'Work Rehab', className: 'bg-amber-100 text-amber-800' },
  HOME_MODIFICATION: { label: 'Home Modification', className: 'bg-lime-100 text-lime-800' },
  ASSISTIVE_TECHNOLOGY: { label: 'Assistive Tech', className: 'bg-indigo-100 text-indigo-800' },
  SPLINTING: { label: 'Splinting', className: 'bg-red-100 text-red-800' },
  NEURO_REHAB: { label: 'Neuro Rehab', className: 'bg-violet-100 text-violet-800' },
  GERIATRIC_OT: { label: 'Geriatric OT', className: 'bg-yellow-100 text-yellow-800' },
  OTHER: { label: 'Other', className: 'bg-gray-100 text-gray-800' },
};

// =============================================================================
// Component Props
// =============================================================================

export interface TreatmentTypeSelectProps {
  /** Module type: 'physiotherapy' or 'occupational-therapy' */
  module: 'physiotherapy' | 'occupational-therapy';
  /** Currently selected treatment type ID */
  value: number | undefined;
  /** List of treatment types to display */
  treatmentTypes: TreatmentType[];
  /** Loading state */
  isLoading?: boolean;
  /** Callback when a treatment type is selected */
  onSelect: (treatmentType: TreatmentType) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Disable the select */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Show detailed info in dropdown */
  showDetails?: boolean;
}

// =============================================================================
// Component
// =============================================================================

/**
 * TreatmentTypeSelect - A searchable dropdown for treatment types
 * 
 * Features:
 * - Search by name, code, or category
 * - Category badges with color coding
 * - Duration and session info display
 * - SHA claimable indicator
 */
export function TreatmentTypeSelect({
  module,
  value,
  treatmentTypes,
  isLoading = false,
  onSelect,
  placeholder = 'Select treatment type...',
  disabled = false,
  className,
  showDetails = true,
}: TreatmentTypeSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  // Get category labels based on module
  const categoryLabels = module === 'physiotherapy' 
    ? PHYSIO_CATEGORY_LABELS 
    : OT_CATEGORY_LABELS;

  // Filter treatment types based on search
  const filteredTypes = React.useMemo(() => {
    if (!searchQuery) return treatmentTypes;
    
    const query = searchQuery.toLowerCase();
    return treatmentTypes.filter((type) => {
      const nameMatch = type.name.toLowerCase().includes(query);
      const codeMatch = type.code.toLowerCase().includes(query);
      const categoryMatch = type.category.toLowerCase().includes(query);
      const descMatch = type.description?.toLowerCase().includes(query);
      return nameMatch || codeMatch || categoryMatch || descMatch;
    });
  }, [treatmentTypes, searchQuery]);

  // Find selected type for display
  const selectedType = React.useMemo(() => {
    if (!value) return null;
    return treatmentTypes.find((t) => t.id === value);
  }, [value, treatmentTypes]);

  // Get category config
  const getCategoryConfig = (category: string): CategoryConfig => {
    return categoryLabels[category] || { label: category, className: 'bg-gray-100 text-gray-800' };
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', className)}
          disabled={disabled || isLoading}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : selectedType ? (
            <div className="flex items-center gap-2 truncate">
              <span className="truncate">{selectedType.name}</span>
              <Badge 
                variant="secondary" 
                className={cn('ml-1 shrink-0 text-xs', getCategoryConfig(selectedType.category).className)}
              >
                {getCategoryConfig(selectedType.category).label}
              </Badge>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[450px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name, code, or category..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Loading treatment types...</span>
              </div>
            ) : filteredTypes.length === 0 ? (
              <CommandEmpty>No treatment types found.</CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredTypes.map((type) => (
                  <CommandItem
                    key={type.id}
                    value={type.id.toString()}
                    onSelect={() => {
                      onSelect(type);
                      setOpen(false);
                      setSearchQuery('');
                    }}
                    className="flex flex-col items-start gap-1 py-3"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <Check
                          className={cn(
                            'h-4 w-4 shrink-0',
                            value === type.id ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <span className="font-medium">{type.name}</span>
                        <span className="text-xs text-muted-foreground">({type.code})</span>
                      </div>
                      <Badge 
                        variant="secondary" 
                        className={cn('text-xs shrink-0', getCategoryConfig(type.category).className)}
                      >
                        {getCategoryConfig(type.category).label}
                      </Badge>
                    </div>
                    {showDetails && (
                      <div className="flex items-center gap-4 pl-6 text-xs text-muted-foreground">
                        <span>{type.default_duration_minutes} min</span>
                        <span>{type.recommended_sessions} sessions</span>
                        {type.sha_claimable && (
                          <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
                            SHA
                          </Badge>
                        )}
                      </div>
                    )}
                    {type.description && showDetails && (
                      <p className="text-xs text-muted-foreground pl-6 line-clamp-2">
                        {type.description}
                      </p>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// =============================================================================
// Export Category Labels for external use
// =============================================================================

export { PHYSIO_CATEGORY_LABELS, OT_CATEGORY_LABELS };
