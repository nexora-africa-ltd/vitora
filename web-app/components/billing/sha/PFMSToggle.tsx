/**
 * PFMS Eligibility Toggle Component
 * Allows setting PFMS (Public Finance Management System) eligibility for SHA members
 * 
 * SHA Integration Checklist Item #13:
 * "If the patient is eligible for PFMS coverage then both SHA and PFMS coverage 
 * must be mentioned in insurance section."
 * 
 * PFMS covers vulnerable populations: indigent, elderly, disabled, orphans
 */
'use client';

import React from 'react';
import {
  Building2,
  HelpCircle,
  User,
  UserCircle,
  Heart,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PFMSCategory } from '@/lib/types/sha';
import { PFMS_CATEGORY_LABELS } from '@/lib/types/sha';

// ============================================================================
// Types
// ============================================================================

interface PFMSToggleProps {
  /** Whether PFMS is enabled */
  isPFMSEligible: boolean;
  /** Current PFMS category */
  pfmsCategory?: PFMSCategory;
  /** Callback when PFMS eligibility changes */
  onPFMSEligibleChange: (eligible: boolean) => void;
  /** Callback when PFMS category changes */
  onPFMSCategoryChange: (category: PFMSCategory) => void;
  /** Whether the fields are disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Icons for categories
// ============================================================================

const CATEGORY_ICONS: Record<PFMSCategory, React.ReactNode> = {
  vulnerable: <Heart className="h-4 w-4 text-rose-500" />,
  elderly: <UserCircle className="h-4 w-4 text-amber-500" />,
  disabled: <User className="h-4 w-4 text-blue-500" />,
  orphan: <User className="h-4 w-4 text-purple-500" />,
  indigent: <Building2 className="h-4 w-4 text-green-500" />,
};

// ============================================================================
// Component
// ============================================================================

export function PFMSToggle({
  isPFMSEligible,
  pfmsCategory,
  onPFMSEligibleChange,
  onPFMSCategoryChange,
  disabled = false,
  className,
}: PFMSToggleProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {/* PFMS Toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="pfms-toggle" className="font-medium">
            PFMS Eligible
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">
                  <strong>PFMS (Public Finance Management System)</strong> provides 
                  government-subsidized healthcare coverage for vulnerable populations 
                  including: elderly, persons with disabilities, orphans, and the indigent.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Switch
          id="pfms-toggle"
          checked={isPFMSEligible}
          onCheckedChange={onPFMSEligibleChange}
          disabled={disabled}
        />
      </div>

      {/* PFMS Category Selector */}
      {isPFMSEligible && (
        <div className="space-y-2">
          <Label htmlFor="pfms-category">PFMS Category</Label>
          <Select
            value={pfmsCategory}
            onValueChange={(value) => onPFMSCategoryChange(value as PFMSCategory)}
            disabled={disabled}
          >
            <SelectTrigger id="pfms-category" className="w-full">
              <SelectValue placeholder="Select PFMS category" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PFMS_CATEGORY_LABELS) as PFMSCategory[]).map((category) => (
                <SelectItem key={category} value={category}>
                  <div className="flex items-center gap-2">
                    {CATEGORY_ICONS[category]}
                    <span>{PFMS_CATEGORY_LABELS[category]}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Category determines the PFMS scheme code used for claims
          </p>
        </div>
      )}

      {/* PFMS Status Badge */}
      {isPFMSEligible && pfmsCategory && (
        <div className="pt-2">
          <Badge 
            variant="secondary" 
            className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
          >
            <Building2 className="h-3 w-3 mr-1" />
            PFMS: {PFMS_CATEGORY_LABELS[pfmsCategory]}
          </Badge>
          <p className="text-xs text-muted-foreground mt-1">
            Claims will include both SHA and PFMS coverage for dual reimbursement
          </p>
        </div>
      )}
    </div>
  );
}

export default PFMSToggle;
