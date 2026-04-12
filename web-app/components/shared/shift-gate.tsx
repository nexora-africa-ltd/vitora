'use client';

/**
 * Wraps a child element (typically a Button) and disables it with a
 * tooltip when the user has no active shift. Renders children as-is
 * if the user is on duty.
 *
 * Usage:
 *   <ShiftGate>
 *     <Button onClick={handleCreate}>Create Encounter</Button>
 *   </ShiftGate>
 */

import { useRequiresActiveShift } from '@/lib/hooks/use-active-shift';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import React from 'react';

interface ShiftGateProps {
  children: React.ReactElement<{ disabled?: boolean }>;
  /** Override: always allow (e.g., for superusers). */
  bypass?: boolean;
}

export function ShiftGate({ children, bypass }: ShiftGateProps) {
  const { isOnDuty, isLoading, gateTooltip } = useRequiresActiveShift();

  // While loading, don't block (avoids flash of disabled state)
  if (isLoading || bypass || isOnDuty) {
    return children;
  }

  // Clone child with disabled prop
  const disabledChild = React.cloneElement(children, { disabled: true });

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{disabledChild}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{gateTooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
