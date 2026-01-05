/**
 * Clinical Template Selector
 * Allows users to search and select a clinical template
 */
'use client';

import { useState } from 'react';
import {
  FileText,
  Search,
  ChevronRight,
  Star,
  History,
} from 'lucide-react';
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
import { useClinicalTemplates, useClinicalTemplateSearch } from '@/lib/hooks/use-clinical-templates';
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

  // Fetch all active templates
  const {
    data: templatesData,
    isLoading: isLoadingTemplates,
  } = useClinicalTemplates({
    is_active: true,
    page_size: 50,
  });

  // Search templates
  const {
    data: searchResults,
    isLoading: isSearching,
  } = useClinicalTemplateSearch(searchQuery);

  const templates = searchQuery.length >= 2
    ? searchResults
    : templatesData?.results;

  const handleSelect = (template: ClinicalTemplate) => {
    onSelect(template);
    setOpen(false);
    setSearchQuery('');
  };

  // Group templates by specialty
  const groupedTemplates = templates?.reduce<Record<string, ClinicalTemplate[]>>((acc, template) => {
    const specialty = template.specialty || 'General';
    if (!acc[specialty]) {
      acc[specialty] = [];
    }
    acc[specialty].push(template);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <FileText className="h-4 w-4 mr-2" />
            Select Template
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Select Clinical Template</DialogTitle>
          <DialogDescription>
            Choose a template to guide your clinical assessment
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
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
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery
                ? 'No templates found matching your search'
                : 'No templates available'}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({
  template,
  onClick,
}: {
  template: ClinicalTemplate;
  onClick: () => void;
}) {
  const sectionCount = template.content.sections?.length || 0;

  return (
    <div
      className="p-3 rounded-md border hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{template.name}</span>
            {template.is_system && (
              <Badge variant="secondary" className="text-xs">
                <Star className="h-3 w-3 mr-1" />
                System
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {template.template_type}
            </Badge>
          </div>
          {template.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {template.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>{sectionCount} sections</span>
            {template.usage_count > 0 && (
              <span className="flex items-center gap-1">
                <History className="h-3 w-3" />
                Used {template.usage_count} times
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
      </div>
    </div>
  );
}

export default TemplateSelector;
