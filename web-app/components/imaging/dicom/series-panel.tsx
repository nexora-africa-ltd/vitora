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
      <div className={cn('w-12 bg-muted/50 flex flex-col items-center gap-2 py-2', className)}>
        {series.map((s, idx) => (
          <button
            key={s.series_instance_uid}
            onClick={() => onSeriesSelect(idx)}
            className={cn(
              'w-8 h-8 rounded flex items-center justify-center text-xs font-medium transition-colors',
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
    <div className={cn('w-64 bg-muted/30 border-r flex flex-col', className)}>
      {/* Header */}
      <div className="p-3 border-b">
        <h3 className="font-medium text-sm">Series ({series.length})</h3>
      </div>

      {/* Series List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
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
                    ? 'bg-primary/10 border border-primary'
                    : 'bg-background hover:bg-muted border border-transparent'
                )}
              >
                <div className="flex gap-2">
                  {/* Thumbnail */}
                  <div className="w-12 h-12 rounded bg-black flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {thumbnailUrl ? (
                      <img
                        src={thumbnailUrl}
                        alt={`Series ${s.series_number}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      getModalityIcon(s.modality)
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {s.series_description || `Series ${s.series_number || idx + 1}`}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                        {getModalityLabel(s.modality)}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {s.number_of_instances} img
                      </span>
                    </div>
                    {s.body_part_examined && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
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
        <div className="border-t max-h-32">
          <div className="p-2 border-b bg-muted/50">
            <h4 className="text-xs font-medium">Images ({instances.length})</h4>
          </div>
          <ScrollArea className="h-24">
            <div className="p-2 flex gap-1 flex-wrap">
              {instances.map((instance, idx) => (
                <button
                  key={instance.sop_instance_uid}
                  onClick={() => onInstanceSelect?.(idx)}
                  className={cn(
                    'w-8 h-8 rounded text-xs flex items-center justify-center',
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
