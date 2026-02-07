/**
 * Visit Reason Select Component
 *
 * Dropdown for selecting encounter visit reason with skip-triage indicator.
 * Sprint 2 - Phase 2D: Visit Reason Taxonomy
 */
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { VisitReason } from '@/lib/types/encounter';
import { VISIT_REASON_DISPLAY, SKIP_TRIAGE_REASONS } from '@/lib/types/encounter';
import { FastForward } from 'lucide-react';

interface VisitReasonSelectProps {
  value?: VisitReason;
  onValueChange: (value: VisitReason) => void;
  disabled?: boolean;
  showSkipIndicator?: boolean;
}

export function VisitReasonSelect({
  value,
  onValueChange,
  disabled = false,
  showSkipIndicator = true,
}: VisitReasonSelectProps) {
  const reasons = Object.entries(VISIT_REASON_DISPLAY) as [VisitReason, string][];

  return (
    <div className="space-y-1">
      <Select
        value={value}
        onValueChange={(val) => onValueChange(val as VisitReason)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select visit reason" />
        </SelectTrigger>
        <SelectContent>
          {reasons.map(([key, label]) => (
            <SelectItem key={key} value={key}>
              <div className="flex items-center gap-2">
                <span>{label}</span>
                {SKIP_TRIAGE_REASONS.includes(key) && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-300 text-amber-600">
                    <FastForward className="h-2 w-2 mr-0.5" />
                    Skip Triage
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showSkipIndicator && value && SKIP_TRIAGE_REASONS.includes(value) && (
        <div className="flex items-center gap-1 text-xs text-amber-600">
          <FastForward className="h-3 w-3" />
          <span>This visit reason allows skipping triage</span>
        </div>
      )}
    </div>
  );
}
