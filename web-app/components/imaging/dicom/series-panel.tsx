/**
 * DICOM Series Navigation Panel Component
 * Phase C Sprint C.3: DICOM Viewer
 */
'use client';

import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DICOMSeriesList, DICOMInstance } from '@/lib/types/imaging';
import { formatBytes } from '@/lib/utils/format';
import { ImageIcon, Film, Layers } from 'lucide-react';

interface SeriesPanelProps {
  /** List of series in the study */
  series: DICOMSeriesList[];
  /** Currently selected series index */
  selectedSeriesIndex: number;
  /** Callback when series is selected */
  onSeriesSelect: (index: number) => void;
  /** Instances for the currently selected series */
  instances?: DICOMInstance[];
  /** Currently selected instance index */
  selectedInstanceIndex?: number;
  /** Callback when instance is selected */
  onInstanceSelect?: (index: number) => void;
  /** Function to get thumbnail URL */
  getThumbnailUrl?: (path: string | null | undefined) => string | null;
  /** Whether panel is collapsed */
  collapsed?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Format modality display name
 */
function getModalityLabel(modality: string): string {
  const labels: Record<string, string> = {
    CT: 'CT',
    MR: 'MRI',
    MRI: 'MRI',
    XR: 'X-Ray',
    CR: 'X-Ray',
    DX: 'X-Ray',
    US: 'Ultrasound',
    NM: 'Nuclear Med',
    PT: 'PET',
    MG: 'Mammo',
    FL: 'Fluoro',
    RF: 'Fluoro',
  };
  return labels[modality] || modality;
}

/**
 * Get icon for modality
 */
function getModalityIcon(modality: string) {
  switch (modality) {
    case 'CT':
    case 'MR':
    case 'MRI':
      return <Layers className="h-4 w-4" />;
    case 'US':
      return <Film className="h-4 w-4" />;
    default:
      return <ImageIcon className="h-4 w-4" />;
  }
}

export function SeriesPanel({
  series,
  selectedSeriesIndex,
  onSeriesSelect,
  instances,
  selectedInstanceIndex,
  onInstanceSelect,
  getThumbnailUrl,
  collapsed = false,
  className,
}: SeriesPanelProps) {
  const [showInstances, setShowInstances] = useState(false);

  if (collapsed) {
    return (
      <div className={cn('flex w-12 flex-col items-center gap-2 bg-muted/50 py-2', className)}>
        {series.map((s, idx) => (
          <button
            key={s.series_instance_uid}
            onClick={() => onSeriesSelect(idx)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded text-xs font-medium transition-colors',
              selectedSeriesIndex === idx
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted-foreground/10'
            )}
            title={s.series_description || `Series ${s.series_number}`}
          >
            {idx + 1}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('flex w-64 flex-col border-r bg-muted/30', className)}>
      {/* Header */}
      <div className="border-b p-3">
        <h3 className="text-sm font-medium">Series ({series.length})</h3>
      </div>

      {/* Series List */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-2">
          {series.map((s, idx) => {
            const thumbnailUrl = getThumbnailUrl?.(s.thumbnail_path);
            const isSelected = selectedSeriesIndex === idx;

            return (
              <button
                key={s.series_instance_uid}
                onClick={() => onSeriesSelect(idx)}
                className={cn(
                  'w-full rounded-lg p-2 text-left transition-colors',
                  isSelected
                    ? 'border border-primary bg-primary/10'
                    : 'border border-transparent bg-background hover:bg-muted'
                )}
              >
                <div className="flex gap-2">
                  {/* Thumbnail */}
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-black">
                    {thumbnailUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={thumbnailUrl}
                        alt={`Series ${s.series_number}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getModalityIcon(s.modality)
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {s.series_description || `Series ${s.series_number || idx + 1}`}
                    </p>
                    <div className="mt-1 flex items-center gap-1">
                      <Badge variant="outline" className="h-4 px-1 py-0 text-[10px]">
                        {getModalityLabel(s.modality)}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {s.number_of_instances} img
                      </span>
                    </div>
                    {s.body_part_examined && (
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {s.body_part_examined}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Instance List (when selected series has multiple instances) */}
      {showInstances && instances && instances.length > 1 && (
        <div className="max-h-32 border-t">
          <div className="border-b bg-muted/50 p-2">
            <h4 className="text-xs font-medium">Images ({instances.length})</h4>
          </div>
          <ScrollArea className="h-24">
            <div className="flex flex-wrap gap-1 p-2">
              {instances.map((instance, idx) => (
                <button
                  key={instance.sop_instance_uid}
                  onClick={() => onInstanceSelect?.(idx)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded text-xs',
                    selectedInstanceIndex === idx
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted-foreground/20'
                  )}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
