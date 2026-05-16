/**
 * Lightweight Cornerstone DICOM Viewer for public share pages.
 *
 * Reuses the same `useCornerstone` hook and `ViewerToolbar` from the
 * authenticated DICOM viewer, but skips the series panel and
 * authenticated API calls.
 */
'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2, Loader2, AlertCircle } from 'lucide-react';
import { DICOMViewerTool } from '@/lib/types/imaging';
import { ViewerToolbar } from '@/components/imaging/dicom/viewer-toolbar';
import { useCornerstone } from '@/components/imaging/dicom/use-cornerstone';

interface ShareCornerstoneViewerProps {
  /** WADO-compatible URLs to raw DICOM instance files */
  imageUrls: string[];
  /** Study description for accessibility */
  studyDescription?: string;
}

export function ShareCornerstoneViewer({
  imageUrls,
  studyDescription,
}: ShareCornerstoneViewerProps) {
  const [activeTool, setActiveTool] = useState<DICOMViewerTool>('window_level');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const cornerstone = useCornerstone({ imageUrls });

  const handleToolChange = useCallback(
    (tool: DICOMViewerTool) => {
      setActiveTool(tool);
      cornerstone.setActiveTool(tool);
    },
    [cornerstone],
  );

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-black'
          : 'absolute inset-0 bg-black'
      }
      role="region"
      aria-label={studyDescription || 'DICOM Viewer'}
    >
      {/* Toolbar */}
      <div
        className="absolute top-2 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100%-6rem)] sm:max-w-none overflow-x-auto"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
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

      {/* Fullscreen toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 z-30 bg-black/60 hover:bg-black/80 text-white"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={toggleFullscreen}
      >
        {isFullscreen ? (
          <Minimize2 className="h-4 w-4" />
        ) : (
          <Maximize2 className="h-4 w-4" />
        )}
      </Button>

      {/* Cornerstone viewport */}
      <div
        ref={cornerstone.containerRef}
        className="absolute inset-0"
        style={{ touchAction: 'none' }}
      />

      {/* Loading overlay */}
      {!cornerstone.isReady && imageUrls.length > 0 && (
        <div className="absolute inset-0 z-20 bg-black/80 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-white text-sm">Loading DICOM images...</div>
          <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${cornerstone.loadingProgress}%` }}
            />
          </div>
          <div className="text-muted-foreground text-xs">
            {Math.round(cornerstone.loadingProgress)}%
          </div>
        </div>
      )}

      {/* Error state */}
      {cornerstone.error && (
        <div className="absolute inset-0 z-20 bg-black/90 flex flex-col items-center justify-center gap-4 p-8">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h4 className="text-white font-medium">Failed to load viewer</h4>
          <p className="text-muted-foreground text-sm text-center max-w-md">
            {cornerstone.error}
          </p>
        </div>
      )}

      {/* Image info overlay */}
      {cornerstone.isReady && (
        <div className="absolute bottom-2 left-2 z-10 bg-black/60 text-white text-xs px-2 py-1 rounded">
          Image: {cornerstone.currentIndex + 1} / {cornerstone.totalImages}
        </div>
      )}
    </div>
  );
}
