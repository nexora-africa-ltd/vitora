/**
 * Form Accordion Component
 * A reusable accordion component for multi-section forms with completion tracking.
 * Ideal for clinical encounters, patient registration, and other multi-step forms.
 * 
 * Features:
 * - Section completion indicators (checkmark)
 * - Error indicators
 * - Badge support for counts
 * - Tooltip support
 * - Custom icons per section
 * - Plus/Minus trigger animation
 */
'use client';

import * as React from 'react';
import { CheckCircle2, MinusIcon, PlusIcon, AlertCircle } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/index';

export interface FormAccordionSection {
  /** Unique identifier for the section */
  id: string;
  /** Full title of the section */
  title: string;
  /** Optional abbreviation shown in parentheses */
  abbreviation?: string;
  /** Icon to display before the title */
  icon?: React.ReactNode;
  /** Whether the section is complete (shows checkmark) */
  isComplete?: boolean;
  /** Whether the section has validation errors */
  hasErrors?: boolean;
  /** Optional badge content (e.g., count of items) */
  badge?: string | number;
  /** Tooltip title (defaults to title if not provided) */
  tooltipTitle?: string;
  /** Tooltip description */
  tooltipDescription?: string;
  /** Section content */
  children: React.ReactNode;
  /** Whether this section is disabled */
  disabled?: boolean;
}

export interface FormAccordionProps {
  /** Array of sections to render */
  sections: FormAccordionSection[];
  /** Which section(s) should be open by default */
  defaultOpen?: string | string[];
  /** Allow multiple sections open at once */
  allowMultiple?: boolean;
  /** Callback when open sections change */
  onSectionChange?: (openSections: string[]) => void;
  /** Additional class names for the accordion container */
  className?: string;
  /** Whether the entire form is disabled */
  disabled?: boolean;
}

/**
 * FormAccordion - A reusable accordion component for multi-section forms
 */
export function FormAccordion({
  sections,
  defaultOpen,
  allowMultiple = false,
  onSectionChange,
  className,
  disabled = false,
}: FormAccordionProps) {
  // Handle controlled state
  const handleValueChange = React.useCallback(
    (value: string | string[]) => {
      if (onSectionChange) {
        const openSections = Array.isArray(value) ? value : value ? [value] : [];
        onSectionChange(openSections);
      }
    },
    [onSectionChange]
  );

  // Determine default value
  const defaultValue = React.useMemo(() => {
    if (allowMultiple) {
      return Array.isArray(defaultOpen) ? defaultOpen : defaultOpen ? [defaultOpen] : [];
    }
    return Array.isArray(defaultOpen) ? defaultOpen[0] : defaultOpen;
  }, [defaultOpen, allowMultiple]);

  if (allowMultiple) {
    return (
      <TooltipProvider delayDuration={300}>
        <Accordion
          type="multiple"
          defaultValue={defaultValue as string[]}
          onValueChange={handleValueChange as (value: string[]) => void}
          className={cn('-space-y-px w-full', className)}
        >
          {sections.map((section, index) => (
            <FormAccordionSectionItem
              key={section.id}
              section={section}
              isFirst={index === 0}
              isLast={index === sections.length - 1}
              disabled={disabled || section.disabled}
            />
          ))}
        </Accordion>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Accordion
        type="single"
        collapsible
        defaultValue={defaultValue as string}
        onValueChange={handleValueChange as (value: string) => void}
        className={cn('-space-y-px w-full', className)}
      >
        {sections.map((section, index) => (
          <FormAccordionSectionItem
            key={section.id}
            section={section}
            isFirst={index === 0}
            isLast={index === sections.length - 1}
            disabled={disabled || section.disabled}
          />
        ))}
      </Accordion>
    </TooltipProvider>
  );
}

interface FormAccordionSectionItemProps {
  section: FormAccordionSection;
  isFirst: boolean;
  isLast: boolean;
  disabled?: boolean;
}

function FormAccordionSectionItem({
  section,
  isFirst,
  isLast,
  disabled,
}: FormAccordionSectionItemProps) {
  const triggerContent = (
    <div className="flex w-full items-center justify-between py-1">
      <div className="flex items-center gap-2">
        {section.icon && (
          <span className="text-muted-foreground shrink-0">{section.icon}</span>
        )}
        <span className="font-medium">
          {section.title}
          {section.abbreviation && (
            <span className="text-muted-foreground font-normal ml-1">
              ({section.abbreviation})
            </span>
          )}
        </span>
        {/* Completion indicator */}
        {section.isComplete && (
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
        )}
        {/* Error indicator */}
        {section.hasErrors && !section.isComplete && (
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
        )}
        {/* Badge for counts */}
        {section.badge !== undefined && section.badge !== null && (
          <Badge variant="secondary" className="ml-1 text-xs">
            {section.badge}
          </Badge>
        )}
        {/* Plus indicator when section is empty and not complete */}
        {!section.isComplete && !section.badge && !section.hasErrors && (
          <span className="text-muted-foreground text-sm">+</span>
        )}
      </div>
      {/* Animated plus/minus icon */}
      <div className="relative size-4 shrink-0 ml-2">
        <PlusIcon className="absolute inset-0 size-4 text-muted-foreground transition-opacity duration-200 group-data-[state=open]:opacity-0" />
        <MinusIcon className="absolute inset-0 size-4 text-muted-foreground opacity-0 transition-opacity duration-200 group-data-[state=open]:opacity-100" />
      </div>
    </div>
  );

  return (
    <AccordionItem
      value={section.id}
      disabled={disabled}
      className={cn(
        'overflow-hidden border bg-background px-4',
        isFirst && 'rounded-t-lg',
        isLast && 'rounded-b-lg border-b',
        disabled && 'opacity-60 cursor-not-allowed'
      )}
    >
      {section.tooltipDescription ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <AccordionTrigger className="group hover:no-underline [&>svg]:hidden">
              {triggerContent}
            </AccordionTrigger>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            <p className="font-medium">{section.tooltipTitle || section.title}</p>
            <p className="text-xs text-muted-foreground">{section.tooltipDescription}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <AccordionTrigger className="group hover:no-underline [&>svg]:hidden">
          {triggerContent}
        </AccordionTrigger>
      )}
      <AccordionContent className="pt-2 pb-4">
        {section.children}
      </AccordionContent>
    </AccordionItem>
  );
}

export default FormAccordion;
