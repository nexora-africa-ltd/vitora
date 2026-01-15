'use client';

import * as React from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type ViewMode = 'list' | 'grid';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  className?: string;
}

/**
 * Toggle between list and grid views
 * Reusable across staff, patients, and other entity lists
 */
export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('flex items-center border rounded-md', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 w-8 p-0 rounded-r-none',
                value === 'list' && 'bg-muted'
              )}
              onClick={() => onChange('list')}
              aria-label="List view"
              aria-pressed={value === 'list'}
            >
              <List className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">List view</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 w-8 p-0 rounded-l-none border-l',
                value === 'grid' && 'bg-muted'
              )}
              onClick={() => onChange('grid')}
              aria-label="Grid view"
              aria-pressed={value === 'grid'}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Grid view</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
