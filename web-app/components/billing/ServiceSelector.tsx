/**
 * Service Selector Component
 * Searchable dropdown for selecting billing services
 */
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Service, ServiceCategory } from '@/lib/types/billing';
import { formatCurrency } from '@/lib/utils/format';

// ============================================================================
// Types
// ============================================================================

interface ServiceSelectorProps {
  services: Service[];
  categories?: ServiceCategory[];
  isLoading?: boolean;
  selectedService?: Service | null;
  onSelect: (service: Service) => void;
  placeholder?: string;
  disabled?: boolean;
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function ServiceSelectorSkeleton() {
  return (
    <div role="status" aria-label="Loading services">
      <Skeleton className="h-10 w-full" />
      <span className="sr-only">Loading services...</span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ServiceSelector({
  services,
  categories,
  isLoading,
  selectedService,
  onSelect,
  placeholder = 'Select a service',
  disabled,
}: ServiceSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  if (isLoading) {
    return <ServiceSelectorSkeleton />;
  }

  // Group services by category if categories are provided
  const groupedServices = React.useMemo(() => {
    if (!categories || categories.length === 0) {
      return { 'All Services': services };
    }

    const groups: Record<string, Service[]> = {};
    
    categories.forEach((category) => {
      const categoryServices = services.filter(
        (s) => s.category === category.id || s.category_name === category.name
      );
      if (categoryServices.length > 0) {
        groups[category.name] = categoryServices;
      }
    });

    // Add uncategorized services
    const uncategorized = services.filter(
      (s) => !s.category && !s.category_name
    );
    if (uncategorized.length > 0) {
      groups['Other'] = uncategorized;
    }

    return groups;
  }, [services, categories]);

  // Filter services based on search
  const filteredGroups = React.useMemo(() => {
    if (!searchQuery) return groupedServices;

    const query = searchQuery.toLowerCase();
    const result: Record<string, Service[]> = {};

    Object.entries(groupedServices).forEach(([category, categoryServices]) => {
      const filtered = categoryServices.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.code?.toLowerCase().includes(query) ||
          s.description?.toLowerCase().includes(query)
      );
      if (filtered.length > 0) {
        result[category] = filtered;
      }
    });

    return result;
  }, [groupedServices, searchQuery]);

  const hasResults = Object.values(filteredGroups).some((g) => g.length > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={placeholder}
          disabled={disabled}
          className="w-full justify-between"
        >
          {selectedService ? (
            <div className="flex items-center gap-2 truncate">
              <span className="truncate">{selectedService.name}</span>
              <Badge variant="secondary" className="ml-auto shrink-0">
                {formatCurrency(parseFloat(selectedService.unit_price))}
              </Badge>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search services..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {!hasResults && (
              <CommandEmpty>No services found.</CommandEmpty>
            )}
            {Object.entries(filteredGroups).map(([category, categoryServices]) => (
              <CommandGroup key={category} heading={category}>
                {categoryServices.map((service) => (
                  <CommandItem
                    key={service.id}
                    value={service.id.toString()}
                    onSelect={() => {
                      onSelect(service);
                      setOpen(false);
                      setSearchQuery('');
                    }}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Check
                        className={cn(
                          'h-4 w-4 shrink-0',
                          selectedService?.id === service.id
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{service.name}</div>
                        {service.code && (
                          <div className="text-xs text-muted-foreground">
                            {service.code}
                          </div>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 ml-2">
                      {formatCurrency(parseFloat(service.unit_price))}
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
