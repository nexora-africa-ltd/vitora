/**
 * Identification Input Component
 * A clickable label that allows switching between different ID types
 * supported by SHA (Social Health Authority)
 */
'use client';

import React, { useState, useCallback } from 'react';
import { ChevronDown, Check, CreditCard, Hash, Fingerprint, Globe, Building2, Clock, FileText, Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { type IdentificationType, IDENTIFICATION_TYPE_OPTIONS } from '@/lib/types/patient';

// Icons for each ID type
const ID_TYPE_ICONS: Record<IdentificationType, React.ReactNode> = {
  national_id: <CreditCard className="h-4 w-4" />,
  cr_number: <Hash className="h-4 w-4" />,
  mandate_number: <FileText className="h-4 w-4" />,
  alien_id: <Globe className="h-4 w-4" />,
  kra_pin: <Building2 className="h-4 w-4" />,
  temporary_id: <Clock className="h-4 w-4" />,
  passport: <Fingerprint className="h-4 w-4" />,
};

// Placeholder text for each ID type
const ID_TYPE_PLACEHOLDERS: Record<IdentificationType, string> = {
  national_id: 'e.g., 12345678',
  cr_number: 'e.g., CR1234567890-0',
  mandate_number: 'e.g., MN123456',
  alien_id: 'e.g., A123456',
  kra_pin: 'e.g., A001234567K',
  temporary_id: 'e.g., TMP-2026-001',
  passport: 'e.g., AB1234567',
};

interface IdentificationInputProps {
  /** Current ID type */
  identificationType: IdentificationType;
  /** Current ID number value */
  identificationNumber: string;
  /** Called when ID type changes */
  onTypeChange: (type: IdentificationType) => void;
  /** Called when ID number changes */
  onNumberChange: (value: string) => void;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether to show required indicator */
  required?: boolean;
  /** Custom class name */
  className?: string;
  /** Error message */
  error?: string;
  /** Search handler - if provided, shows search icon inside input */
  onSearch?: () => void;
  /** Whether search is in progress */
  isSearching?: boolean;
  /** Minimum length before search is enabled */
  minSearchLength?: number;
}

export function IdentificationInput({
  identificationType,
  identificationNumber,
  onTypeChange,
  onNumberChange,
  disabled = false,
  required = false,
  className,
  error,
  onSearch,
  isSearching = false,
  minSearchLength = 5,
}: IdentificationInputProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const currentTypeOption = IDENTIFICATION_TYPE_OPTIONS.find(opt => opt.value === identificationType);
  const currentLabel = currentTypeOption?.label || 'Select ID Type';
  const currentIcon = ID_TYPE_ICONS[identificationType];
  const currentPlaceholder = ID_TYPE_PLACEHOLDERS[identificationType];

  const handleTypeSelect = useCallback((type: IdentificationType) => {
    onTypeChange(type);
    setDropdownOpen(false);
  }, [onTypeChange]);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Clickable Label */}
      <div className="flex items-center gap-1">
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1 text-sm font-medium',
                'hover:text-primary transition-colors cursor-pointer',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              {currentIcon}
              <span>{currentLabel}</span>
              {required && <span className="text-destructive ml-0.5">*</span>}
              <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {IDENTIFICATION_TYPE_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => handleTypeSelect(option.value)}
                className="flex items-center gap-2"
              >
                {ID_TYPE_ICONS[option.value]}
                <span className="flex-1">{option.label}</span>
                {identificationType === option.value && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Input Field with optional search icon */}
      <div className="relative">
        <Input
          type="text"
          value={identificationNumber}
          onChange={(e) => onNumberChange(e.target.value)}
          placeholder={currentPlaceholder}
          disabled={disabled}
          className={cn(
            error && 'border-destructive',
            onSearch && 'pr-10' // Make room for search icon
          )}
        />
        {/* Search button inside input */}
        {onSearch && (
          <button
            type="button"
            onClick={onSearch}
            disabled={disabled || isSearching || identificationNumber.length < minSearchLength}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
              identificationNumber.length >= minSearchLength && !isSearching && !disabled
                ? 'text-teal-600 hover:bg-teal-600/10 cursor-pointer'
                : 'text-muted-foreground/40 cursor-not-allowed'
            )}
            title={identificationNumber.length < minSearchLength
              ? `Enter at least ${minSearchLength} characters to search`
              : 'Search CR/SHA'
            }
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}

export default IdentificationInput;
