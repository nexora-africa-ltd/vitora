/**
 * Clinical Template Selector
 * Allows users to search and select a clinical template
 */
'use client';

import { useState } from 'react';
import { FileText, Search, ChevronRight, Star, History, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useClinicalTemplates,
  useClinicalTemplateSearch,
} from '@/lib/hooks/use-clinical-templates';
import { clinicalTemplatesApi } from '@/lib/api/clinical-templates';
import type { ClinicalTemplate } from '@/lib/types/clinical-template';

interface TemplateSelectorProps {
  onSelect: (template: ClinicalTemplate) => void;
  encounterType?: string;
  chiefComplaint?: string;
  trigger?: React.ReactNode;
}

export function TemplateSelector({
  onSelect,
  encounterType,
  chiefComplaint,
  trigger,
}: TemplateSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);

  // Fetch all active templates
  const { data: templatesData, isLoading: isLoadingTemplates } = useClinicalTemplates({
    is_active: true,
    page_size: 50,
  });

  // Search templates
  const { data: searchResults, isLoading: isSearching } = useClinicalTemplateSearch(searchQuery);

  const templates = searchQuery.length >= 2 ? searchResults : templatesData?.results;

  const handleSelect = async (template: ClinicalTemplate) => {
    // Fetch full template with content (list endpoint excludes content for performance)
    setIsLoadingTemplate(true);
    try {
      const fullTemplate = await clinicalTemplatesApi.get(template.id);
      onSelect(fullTemplate);
      setOpen(false);
      setSearchQuery('');
    } catch (error) {
      console.error('Failed to fetch template:', error);
      // Fall back to partial template if fetch fails
      onSelect(template);
      setOpen(false);
      setSearchQuery('');
    } finally {
      setIsLoadingTemplate(false);
    }
  };

  // Group templates by specialty
  const groupedTemplates = templates?.reduce<Record<string, ClinicalTemplate[]>>(
    (acc, template) => {
      const specialty = template.specialty || 'General';
      if (!acc[specialty]) {
        acc[specialty] = [];
      }
      acc[specialty].push(template);
      return acc;
    },
    {}
  );

  return (
    <Dialog open={open} onOpenChange={(value) => !isLoadingTemplate && setOpen(value)}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <FileText className="mr-2 h-4 w-4" />
            Select Template
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-2xl">
        {isLoadingTemplate ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading template...</p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Select Clinical Template</DialogTitle>
              <DialogDescription>
                Choose a template to guide your clinical assessment
              </DialogDescription>
            </DialogHeader>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Template List */}
            <ScrollArea className="h-[400px] pr-4">
              {isLoadingTemplates || isSearching ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : templates && templates.length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(groupedTemplates || {}).map(([specialty, specTemplates]) => (
                    <div key={specialty}>
                      <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                        {specialty}
                      </h4>
                      <div className="space-y-2">
                        {(specTemplates as ClinicalTemplate[]).map((template) => (
                          <TemplateCard
                            key={template.id}
                            template={template}
                            onClick={() => handleSelect(template)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  {searchQuery
                    ? 'No templates found matching your search'
                    : 'No templates available'}
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({ template, onClick }: { template: ClinicalTemplate; onClick: () => void }) {
  const sectionCount = template.content?.sections?.length || 0;

  return (
    <div
      className="cursor-pointer rounded-md border p-3 transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{template.name}</span>
            {template.is_system && (
              <Badge variant="secondary" className="text-xs">
                <Star className="mr-1 h-3 w-3" />
                System
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {template.template_type}
            </Badge>
          </div>
          {template.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {template.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{sectionCount} sections</span>
            {template.usage_count > 0 && (
              <span className="flex items-center gap-1">
                <History className="h-3 w-3" />
                Used {template.usage_count} times
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </div>
    </div>
  );
}

export default TemplateSelector;
