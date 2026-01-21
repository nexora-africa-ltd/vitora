/**
 * Clinical Template Form Renderer
 * Dynamically renders a clinical template as a form
 */
'use client';

import { useState, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  CheckCircle,
  AlertCircle,
  Wand2,
  Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils/cn';
import { coreApi } from '@/lib/api/core';
import type {
  ClinicalTemplate,
  TemplateField,
  TemplateContent,
} from '@/lib/types/clinical-template';

interface ClinicalTemplateFormProps {
  template: ClinicalTemplate;
  value: Record<string, Record<string, unknown>>;
  onChange: (value: Record<string, Record<string, unknown>>) => void;
  disabled?: boolean;
}

export function ClinicalTemplateForm({
  template,
  value,
  onChange,
  disabled = false,
}: ClinicalTemplateFormProps) {
  const sections = template?.content?.sections || [];

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(sections.map((s) => s.name))
  );

  const toggleSection = (sectionName: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionName)) {
        next.delete(sectionName);
      } else {
        next.add(sectionName);
      }
      return next;
    });
  };

  const handleFieldChange = useCallback(
    (sectionName: string, fieldName: string, fieldValue: unknown) => {
      onChange({
        ...value,
        [sectionName]: {
          ...(value[sectionName] || {}),
          [fieldName]: fieldValue,
        },
      });
    },
    [value, onChange]
  );

  // Guard against missing template or content
  if (!template || !template.content || !template.content.sections) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Template has no content</p>
        <p className="text-sm mt-1">
          This template doesn&apos;t have any sections defined.
        </p>
      </div>
    );
  }

  const getSectionCompleteness = (sectionName: string, fields: TemplateField[]) => {
    const sectionData = value[sectionName] || {};
    const requiredFields = fields.filter((f) => f.required);
    const completedRequired = requiredFields.filter((f) => {
      const val = sectionData[f.name];
      return val !== undefined && val !== null && val !== '';
    });
    return {
      required: requiredFields.length,
      completed: completedRequired.length,
      isComplete: completedRequired.length === requiredFields.length,
    };
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {template.name}
          </CardTitle>
          <Badge variant="outline">{template.specialty || 'General'}</Badge>
        </div>
        {template.description && (
          <p className="text-sm text-muted-foreground">{template.description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {template.content.sections
          .sort((a, b) => a.order - b.order)
          .map((section) => {
            const completeness = getSectionCompleteness(section.name, section.fields);
            const isExpanded = expandedSections.has(section.name);

            return (
              <Collapsible
                key={section.name}
                open={isExpanded}
                onOpenChange={() => toggleSection(section.name)}
              >
                <CollapsibleTrigger asChild>
                  <div
                    className={cn(
                      'flex items-center justify-between p-3 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors',
                      completeness.isComplete && 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="font-medium">{section.name}</span>
                      {completeness.required > 0 && (
                        <Badge
                          variant={completeness.isComplete ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {completeness.completed}/{completeness.required}
                        </Badge>
                      )}
                    </div>
                    {completeness.isComplete && completeness.required > 0 && (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid gap-4 pt-4 pl-6">
                    {section.fields.map((field) => (
                      <TemplateFieldRenderer
                        key={field.name}
                        field={field}
                        value={value[section.name]?.[field.name]}
                        onChange={(v) =>
                          handleFieldChange(section.name, field.name, v)
                        }
                        disabled={disabled}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
      </CardContent>
    </Card>
  );
}

interface TemplateFieldRendererProps {
  field: TemplateField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

function TemplateFieldRenderer({
  field,
  value,
  onChange,
  disabled,
}: TemplateFieldRendererProps) {
  const id = `field-${field.name}`;
  const [isGenerating, setIsGenerating] = useState(false);

  const handleAutoGenerate = async () => {
    if (!field.auto_generate) return;

    setIsGenerating(true);
    try {
      let generatedValue: string;

      switch (field.auto_generate) {
        case 'prc':
          generatedValue = await coreApi.generatePRCNumber();
          break;
        case 'case':
          generatedValue = await coreApi.generateCaseNumber('CASE');
          break;
        default:
          return;
      }

      onChange(generatedValue);
    } catch (error) {
      console.error('Failed to generate value:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  switch (field.type) {
    case 'text':
      return (
        <div className="space-y-2">
          <Label htmlFor={id}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <div className="flex gap-2">
            <Input
              id={id}
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              className={field.auto_generate ? 'flex-1' : undefined}
            />
            {field.auto_generate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAutoGenerate}
                disabled={disabled || isGenerating}
                className="shrink-0"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-1" />
                    Generate
                  </>
                )}
              </Button>
            )}
          </div>
          {field.help_text && (
            <p className="text-xs text-muted-foreground">{field.help_text}</p>
          )}
        </div>
      );

    case 'textarea':
      return (
        <div className="space-y-2">
          <Label htmlFor={id}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Textarea
            id={id}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            rows={3}
          />
          {field.help_text && (
            <p className="text-xs text-muted-foreground">{field.help_text}</p>
          )}
        </div>
      );

    case 'number':
      return (
        <div className="space-y-2">
          <Label htmlFor={id}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Input
            id={id}
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) =>
              onChange(e.target.value ? Number(e.target.value) : null)
            }
            min={field.min}
            max={field.max}
            placeholder={field.placeholder}
            disabled={disabled}
          />
          {field.help_text && (
            <p className="text-xs text-muted-foreground">{field.help_text}</p>
          )}
        </div>
      );

    case 'date':
      return (
        <div className="space-y-2">
          <Label htmlFor={id}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <DatePicker
            value={(value as string) ? parseISO(value as string) : undefined}
            onChange={(date) => onChange(date ? format(date, 'yyyy-MM-dd') : '')}
            disabled={disabled}
            placeholder="Select date"
          />
          {field.help_text && (
            <p className="text-xs text-muted-foreground">{field.help_text}</p>
          )}
        </div>
      );

    case 'boolean':
      return (
        <div className="flex items-center space-x-2">
          <Checkbox
            id={id}
            checked={(value as boolean) || false}
            onCheckedChange={(checked) => onChange(checked)}
            disabled={disabled}
          />
          <Label htmlFor={id} className="cursor-pointer">
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
        </div>
      );

    case 'select':
      return (
        <div className="space-y-2">
          <Label htmlFor={id}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Select
            value={(value as string) || ''}
            onValueChange={onChange}
            disabled={disabled}
          >
            <SelectTrigger id={id}>
              <SelectValue placeholder={field.placeholder || 'Select...'} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.help_text && (
            <p className="text-xs text-muted-foreground">{field.help_text}</p>
          )}
        </div>
      );

    case 'multiselect':
      const selectedValues = (value as string[]) || [];
      return (
        <div className="space-y-2">
          <Label>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {field.options?.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <Checkbox
                  id={`${id}-${option}`}
                  checked={selectedValues.includes(option)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onChange([...selectedValues, option]);
                    } else {
                      onChange(selectedValues.filter((v) => v !== option));
                    }
                  }}
                  disabled={disabled}
                />
                <Label htmlFor={`${id}-${option}`} className="cursor-pointer text-sm">
                  {option}
                </Label>
              </div>
            ))}
          </div>
          {field.help_text && (
            <p className="text-xs text-muted-foreground">{field.help_text}</p>
          )}
        </div>
      );

    default:
      return (
        <div className="text-sm text-muted-foreground">
          Unsupported field type: {field.type}
        </div>
      );
  }
}

export default ClinicalTemplateForm;
