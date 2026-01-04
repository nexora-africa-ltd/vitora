/**
 * Service Selector Component
 * Searchable dropdown for selecting billing services
 */
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Service, ServiceCategory } from '@/lib/types/billing';

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
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeCategory, setActiveCategory] = React.useState<string | null>(
    categories && categories.length > 0 ? categories[0]!.name : null
  );

  // Move useMemo before any conditional returns to follow hooks rules
  const filteredServices = React.useMemo(() => {
    if (isLoading) return [];
    const byCategory = (() => {
      if (!activeCategory || !categories || categories.length === 0) return services;
      const category = categories.find((c) => c.name === activeCategory);
      if (!category) return services;
      return services.filter(
        (s) => s.category === category.id || s.category_name === category.name
      );
    })();

    const query = searchQuery.trim().toLowerCase();
    if (!query) return byCategory;
    return byCategory.filter((s) => s.name.toLowerCase().includes(query));
  }, [services, categories, activeCategory, searchQuery, isLoading]);

  if (isLoading) {
    return <ServiceSelectorSkeleton />;
  }

  return (
    <div className="space-y-4">
      {categories && categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <Button
              key={c.id}
              type="button"
              variant={activeCategory === c.name ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveCategory(c.name)}
              disabled={disabled}
            >
              {c.name}
            </Button>
          ))}
        </div>
      )}

      <Input
        placeholder="Search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        disabled={disabled}
        aria-label="Search"
      />

      <div className="space-y-2">
        {filteredServices.map((service) => (
          <button
            key={service.id}
            type="button"
            className="w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent"
            onClick={() => onSelect(service)}
            disabled={disabled}
          >
            <span className="font-medium">{service.name}</span>
            <Badge variant="outline">{service.unit_price}</Badge>
          </button>
        ))}
      </div>
    </div>
  );
}
