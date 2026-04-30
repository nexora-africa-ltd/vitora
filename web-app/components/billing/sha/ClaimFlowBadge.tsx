/**
 * ClaimFlowBadge — visualizes the routed DHA HIE flow for an SHA Claim.
 *
 * The badge label and tooltip come from `useClaimFlow()` so the UI stays
 * in lock-step with the routing rules in `lib/hooks/use-claim-flow.ts`.
 */
'use client';

import React from 'react';
import { AlertTriangle, ShieldCheck, HeartPulse } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useClaimFlow } from '@/lib/hooks/use-claim-flow';
import type { Claim } from '@/lib/types/sha';

interface ClaimFlowBadgeProps {
  claim: Pick<Claim, 'claim_flow'> | null | undefined;
  className?: string;
}

const FLOW_STYLES = {
  shif: {
    icon: ShieldCheck,
    className:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-900/50',
  },
  phc: {
    icon: HeartPulse,
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50',
  },
  eccif: {
    icon: AlertTriangle,
    className:
      'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-900/50',
  },
} as const;

export function ClaimFlowBadge({ claim, className }: ClaimFlowBadgeProps) {
  const info = useClaimFlow(claim);
  const style = FLOW_STYLES[info.flow];
  const Icon = style.icon;
  const label = info.isFlowResolved ? info.badgeLabel : `${info.badgeLabel} (assumed)`;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn(style.className, className)}>
            <Icon className="mr-1 h-3 w-3" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">{info.description}</p>
          {!info.isFlowResolved && (
            <p className="mt-1 text-xs italic text-muted-foreground">
              Backend has not classified this claim yet \u2014 defaulting to SHIF.
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default ClaimFlowBadge;
