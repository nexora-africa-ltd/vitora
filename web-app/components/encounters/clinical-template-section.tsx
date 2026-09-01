/**
 * Clinical Template Section Component
 * Content component for clinical templates in accordion-based layouts
 */
'use client';

import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TemplateSelector } from '@/components/clinical-templates/template-selector';
import { ClinicalTemplateForm } from '@/components/clinical-templates/clinical-template-form';
import type { ClinicalTemplate } from '@/lib/types/clinical-template';

interface ClinicalTemplateFormContentProps {
  encounterId: number;
  encounterType: string;
  chiefComplaint: string;
  selectedTemplate: ClinicalTemplate | null;
  templateData: Record<string, Record<string, unknown>> | null;
  onTemplateSelect: (template: ClinicalTemplate) => void;
  onTemplateDataChange: (data: Record<string, Record<string, unknown>>) => void;
  onSaveSnapshot?: () => void;
  disabled?: boolean;
}

/**
 * Content-only version of the Clinical Template section
 * Used in accordion-based layouts
 */
export function ClinicalTemplateFormContent({
  encounterId,
  encounterType,
  chiefComplaint,
  selectedTemplate,
  templateData,
  onTemplateSelect,
  onTemplateDataChange,
  onSaveSnapshot,
  disabled = false,
}: ClinicalTemplateFormContentProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Use a structured template to guide focused clinical assessment
        </p>
        <div className="flex items-center gap-2">
          {selectedTemplate && templateData && !disabled && onSaveSnapshot && (
            <Button type="button" variant="outline" size="sm" onClick={onSaveSnapshot}>
              <FileText className="mr-1 h-4 w-4" />
              Save as Attachment
            </Button>
          )}
          {!disabled && (
            <TemplateSelector
              onSelect={onTemplateSelect}
              encounterType={encounterType}
              chiefComplaint={chiefComplaint}
            />
          )}
        </div>
      </div>

      {selectedTemplate ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{selectedTemplate.name}</Badge>
            {selectedTemplate.specialty && (
              <span className="text-xs text-muted-foreground">{selectedTemplate.specialty}</span>
            )}
          </div>
          <ClinicalTemplateForm
            template={selectedTemplate}
            value={templateData || {}}
            onChange={onTemplateDataChange}
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dashed py-6 text-center text-muted-foreground">
          <FileText className="mx-auto mb-3 h-10 w-10 opacity-50" />
          <p className="font-medium">No template selected</p>
          <p className="mt-1 text-sm">Select a template above to guide your clinical assessment</p>
        </div>
      )}
    </div>
  );
}

export default ClinicalTemplateFormContent;
