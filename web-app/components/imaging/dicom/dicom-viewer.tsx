/**
 * Main DICOM Viewer Component
 * Phase C Sprint C.3: DICOM Viewer
 *
 * A full-featured DICOM viewer with:
 * - Image rendering via Cornerstone3D
 * - Pan, zoom, window/level controls
 * - Measurement tools (ruler, angle, ROI)
 * - Series navigation
 * - Image manipulation (invert, flip, rotate)
 */
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { DICOMStudyDetail, DICOMSeriesList, DICOMInstance, DICOMViewerTool } from '@/lib/types/imaging';
import { imagingApi } from '@/lib/api/imaging';
import { ViewerToolbar } from './viewer-toolbar';
import { SeriesPanel } from './series-panel';
import { useCornerstone } from './use-cornerstone';
import {
  Maximize2,
  Minimize2,
  AlertCircle,
  Loader2,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';

interface DICOMViewerProps {
  /** DICOM study to display */
  study: DICOMStudyDetail;
  /** Initial series index to display (default: 0) */
  initialSeriesIndex?: number;
  /** Show series panel */
  showSeriesPanel?: boolean;
  /** Show toolbar */
  showToolbar?: boolean;
  /** Enable fullscreen toggle */
  enableFullscreen?: boolean;
  /** Additional class names */
  className?: string;
  /** Height of the viewer (default: 600px) */
  height?: string | number;
}

// Formatted image info display
function ImageInfo({
  currentIndex,
  totalImages,
  windowWidth,
  windowCenter,
}: {
  currentIndex: number;
  totalImages: number;
  windowWidth?: number;
  windowCenter?: number;
}) {
  return (
    <div className="absolute bottom-2 left-2 z-10 bg-black/60 text-white text-xs px-2 py-1 rounded">
      <div>Image: {currentIndex + 1} / {totalImages}</div>
      {windowWidth !== undefined && windowCenter !== undefined && (
        <div>W: {Math.round(windowWidth)} L: {Math.round(windowCenter)}</div>
      )}
    </div>
  );
}

// Loading overlay
function LoadingOverlay({ progress }: { progress: number }) {
  return (
    <div className="absolute inset-0 z-20 bg-black/80 flex flex-col items-center justify-center gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <div className="text-white text-sm">Loading DICOM images...</div>
      <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="text-muted-foreground text-xs">{Math.round(progress)}%</div>
    </div>
  );
}

// Error display
function ErrorDisplay({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="absolute inset-0 z-20 bg-black/90 flex flex-col items-center justify-center gap-4 p-8">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <h4 className="text-white font-medium">Failed to load viewer</h4>
      <p className="text-muted-foreground text-sm text-center max-w-md">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}

/**
 * Production-grade DICOM viewer component.
 */
export function DICOMViewer({
  study,
  initialSeriesIndex = 0,
  showSeriesPanel = true,
  showToolbar = true,
  enableFullscreen = true,
  className,
  height = 600,
}: DICOMViewerProps) {
  // State
  const [selectedSeriesIndex, setSelectedSeriesIndex] = useState(initialSeriesIndex);
  const [activeTool, setActiveTool] = useState<DICOMViewerTool>('window_level');
  const [instances, setInstances] = useState<DICOMInstance[]>([]);
  const [isLoadingInstances, setIsLoadingInstances] = useState(false);
  const [instanceError, setInstanceError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Auto-collapse panel on mobile (< 768px)
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : true
  );

  // Listen for window resize to auto-collapse/expand panel
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768 && !isPanelCollapsed) {
        setIsPanelCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isPanelCollapsed]);

  // Get current series
  const currentSeries = study.series[selectedSeriesIndex];

  // Build image URLs for the current series
  const imageUrls = useMemo(() => {
    return instances.map((instance) =>
      imagingApi.getDICOMFileUrl(instance.sop_instance_uid)
    );
  }, [instances]);

  // Initialize Cornerstone
  const cornerstone = useCornerstone({
    imageUrls,
    onImageChange: (index, total) => {
      // Optional: track analytics or update UI
    },
  });

  // Load instances when series changes
  useEffect(() => {
    async function loadInstances() {
      if (!currentSeries) return;

      setIsLoadingInstances(true);
      setInstanceError(null);

      try {
        // Get all instances for the study
        const allInstances = await imagingApi.getStudyInstances(study.study_instance_uid);

        // Filter to current series (match by series_instance_uid via the instance's series relation)
        // Since instances don't have series_uid directly, we need to fetch them differently
        // For now, use all instances from the study
        // TODO: Add series-specific instance endpoint
        setInstances(allInstances);
      } catch (error) {
        console.error('Failed to load DICOM instances:', error);
        setInstanceError(
          error instanceof Error ? error.message : 'Failed to load images'
        );
      } finally {
        setIsLoadingInstances(false);
      }
    }

    loadInstances();
  }, [study.study_instance_uid, currentSeries]);

  // Handle series selection
  const handleSeriesSelect = useCallback((index: number) => {
    setSelectedSeriesIndex(index);
  }, []);

  // Handle tool change
  const handleToolChange = useCallback((tool: DICOMViewerTool) => {
    setActiveTool(tool);
    cornerstone.setActiveTool(tool);
  }, [cornerstone]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // Get thumbnail URL helper
  const getThumbnailUrl = useCallback((path: string | null | undefined) => {
    return imagingApi.getThumbnailUrl(path);
  }, []);

  // Compute viewer height
  const viewerHeight = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={cn(
        'relative bg-black rounded-lg overflow-hidden',
        isFullscreen && 'fixed inset-0 z-50 rounded-none',
        className
      )}
      style={{ height: isFullscreen ? '100vh' : viewerHeight }}
    >
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        {showToolbar && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100%-6rem)] sm:max-w-none overflow-x-auto">
            <ViewerToolbar
              activeTool={activeTool}
              onToolChange={handleToolChange}
              onReset={cornerstone.resetViewport}
              onInvert={cornerstone.invertImage}
              onFlipH={cornerstone.flipHorizontal}
              onFlipV={cornerstone.flipVertical}
              onRotate={cornerstone.rotate90}
              currentIndex={cornerstone.currentIndex}
              totalImages={cornerstone.totalImages}
              onPrevious={cornerstone.previousImage}
              onNext={cornerstone.nextImage}
              isReady={cornerstone.isReady}
              orientation="horizontal"
            />
          </div>
        )}

        {/* Fullscreen toggle */}
        {enableFullscreen && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-30 bg-black/60 hover:bg-black/80 text-white"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* Panel collapse toggle */}
        {showSeriesPanel && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 left-2 z-30 bg-black/60 hover:bg-black/80 text-white"
            onClick={() => setIsPanelCollapsed((prev) => !prev)}
          >
            {isPanelCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Series Panel */}
          {showSeriesPanel && (
            <SeriesPanel
              series={study.series}
              selectedSeriesIndex={selectedSeriesIndex}
              onSeriesSelect={handleSeriesSelect}
              instances={instances}
              selectedInstanceIndex={cornerstone.currentIndex}
              onInstanceSelect={cornerstone.goToImage}
              getThumbnailUrl={getThumbnailUrl}
              collapsed={isPanelCollapsed}
            />
          )}

          {/* Viewport */}
          <div className="flex-1 relative bg-black">
            {/* Cornerstone viewport container */}
            <div
              ref={cornerstone.containerRef}
              className="absolute inset-0"
              style={{ touchAction: 'none' }}
            />

            {/* Loading states */}
            {isLoadingInstances && (
              <LoadingOverlay progress={50} />
            )}

            {!isLoadingInstances && !cornerstone.isReady && imageUrls.length > 0 && (
              <LoadingOverlay progress={cornerstone.loadingProgress} />
            )}

            {/* Error state */}
            {(instanceError || cornerstone.error) && (
              <ErrorDisplay
                message={instanceError || cornerstone.error || 'Unknown error'}
                onRetry={() => window.location.reload()}
              />
            )}

            {/* No images state */}
            {!isLoadingInstances && instances.length === 0 && !instanceError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No images in this study</p>
                </div>
              </div>
            )}

            {/* Image info overlay */}
            {cornerstone.isReady && (
              <ImageInfo
                currentIndex={cornerstone.currentIndex}
                totalImages={cornerstone.totalImages}
              />
            )}

            {/* Study info overlay */}
            <div className="absolute top-2 right-12 z-10 text-right text-white text-xs hidden sm:block">
              <div className="bg-black/60 px-2 py-1 rounded">
                <div className="font-medium">{study.patient_name}</div>
                <div className="text-muted-foreground">{study.study_date}</div>
                {study.study_description && (
                  <div className="text-muted-foreground truncate max-w-48">
                    {study.study_description}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DICOMViewer;
