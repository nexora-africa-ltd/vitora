'use client';

import { useState, type FormEvent } from 'react';
import { format, parseISO } from 'date-fns';
import { Filter, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import type { TimelineFilters as FilterType, TimelineEventType } from '@/lib/types/timeline';

interface TimelineFiltersProps {
  filters: FilterType;
  onChange: (filters: FilterType) => void;
}

const eventTypeOptions: { value: TimelineEventType; label: string }[] = [
  { value: 'encounter', label: 'Visits' },
  { value: 'surgery', label: 'Surgeries' },
  { value: 'lab_result', label: 'Lab Results' },
  { value: 'prescription', label: 'Prescriptions' },
  { value: 'vital_alert', label: 'Vital Alerts' },
  { value: 'diagnosis', label: 'Diagnoses' },
  { value: 'admission', label: 'Admissions' },
  { value: 'discharge', label: 'Discharges' },
];

export function TimelineFilters({ filters, onChange }: TimelineFiltersProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(filters.searchQuery || '');

  const activeFilterCount =
    (filters.eventTypes.length < eventTypeOptions.length ? 1 : 0) +
    (filters.startDate ? 1 : 0) +
    (filters.endDate ? 1 : 0);

  const handleEventTypeToggle = (type: TimelineEventType) => {
    const newTypes = filters.eventTypes.includes(type)
      ? filters.eventTypes.filter(t => t !== type)
      : [...filters.eventTypes, type];
    onChange({ ...filters, eventTypes: newTypes });
  };

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onChange({ ...filters, searchQuery: localSearch || undefined });
  };

  const handleClearFilters = () => {
    setLocalSearch('');
    onChange({
      eventTypes: eventTypeOptions.map(o => o.value),
      startDate: undefined,
      endDate: undefined,
      searchQuery: undefined,
    });
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search timeline..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" className="shrink-0">
          Search
        </Button>
      </form>

      {/* Filter Popover */}
      <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filters</h4>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear all
              </Button>
            </div>

            {/* Event Types */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Event Types</Label>
              <div className="grid grid-cols-2 gap-2">
                {eventTypeOptions.map(option => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={filters.eventTypes.includes(option.value)}
                      onCheckedChange={() => handleEventTypeToggle(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Date Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <DatePicker
                    value={filters.startDate ? parseISO(filters.startDate) : undefined}
                    onChange={(date) =>
                      onChange({ ...filters, startDate: date ? format(date, 'yyyy-MM-dd') : undefined })
                    }
                    className="h-8 text-sm"
                    placeholder="Start"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <DatePicker
                    value={filters.endDate ? parseISO(filters.endDate) : undefined}
                    onChange={(date) =>
                      onChange({ ...filters, endDate: date ? format(date, 'yyyy-MM-dd') : undefined })
                    }
                    className="h-8 text-sm"
                    placeholder="End"
                  />
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active Filter Tags */}
      {(filters.searchQuery || filters.startDate || filters.endDate) && (
        <div className="flex flex-wrap gap-1">
          {filters.searchQuery && (
            <Badge variant="secondary" className="gap-1">
              &quot;{filters.searchQuery}&quot;
              <button
                type="button"
                aria-label="Clear search filter"
                title="Clear search filter"
                onClick={() => {
                  setLocalSearch('');
                  onChange({ ...filters, searchQuery: undefined });
                }}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.startDate && (
            <Badge variant="secondary" className="gap-1">
              From: {filters.startDate}
              <button
                type="button"
                aria-label="Clear start date filter"
                title="Clear start date filter"
                onClick={() => onChange({ ...filters, startDate: undefined })}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.endDate && (
            <Badge variant="secondary" className="gap-1">
              To: {filters.endDate}
              <button
                type="button"
                aria-label="Clear end date filter"
                title="Clear end date filter"
                onClick={() => onChange({ ...filters, endDate: undefined })}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

export default TimelineFilters;
