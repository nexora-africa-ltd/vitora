'use client';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CloudUpload } from 'lucide-react';

/**
 * Badge displayed next to records created locally that haven't synced yet.
 *
 * Usage:
 *   - When a patient's MRN is empty or starts with 'PENDING'
 *   - When an invoice/order number is empty
 *   - Any record created offline awaiting sync
 *
 * @example
 * ```tsx
 * {!patient.mrn && <PendingSyncBadge />}
 * {patient.mrn === '' && <PendingSyncBadge label="MRN pending" />}
 * ```
 */
export function PendingSyncBadge({
  label = 'Pending sync',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`gap-1 border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300 ${className ?? ''}`}
          >
            <CloudUpload className="h-3 w-3" />
            <span className="text-xs">{label}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>This record was created offline and will sync when connected.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Helper to detect if a server-generated field is still a local placeholder.
 * Use with MRN, invoice_number, order_number, prescription_number, etc.
 */
export function isPendingSync(serverField: string | null | undefined): boolean {
  if (!serverField) return true;
  if (serverField === '') return true;
  if (serverField.startsWith('PENDING')) return true;
  return false;
}
