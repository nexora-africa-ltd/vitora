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
    [cornerstone]
  );

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  return (
    <div
      className={isFullscreen ? 'fixed inset-0 z-50 bg-black' : 'absolute inset-0 bg-black'}
      role="region"
      aria-label={studyDescription || 'DICOM Viewer'}
    >
      {/* Toolbar */}
      <div
        className="absolute left-1/2 top-2 z-30 max-w-[calc(100%-6rem)] -translate-x-1/2 overflow-x-auto sm:max-w-none"
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
        className="absolute right-2 top-2 z-30 bg-black/60 text-white hover:bg-black/80"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={toggleFullscreen}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </Button>

      {/* Cornerstone viewport */}
      <div
        ref={cornerstone.containerRef}
        className="absolute inset-0"
        style={{ touchAction: 'none' }}
      />

      {/* Loading overlay */}
      {!cornerstone.isReady && imageUrls.length > 0 && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/80">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-sm text-white">Loading DICOM images...</div>
          <div className="h-2 w-48 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${cornerstone.loadingProgress}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {Math.round(cornerstone.loadingProgress)}%
          </div>
        </div>
      )}

      {/* Error state */}
      {cornerstone.error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/90 p-8">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h4 className="font-medium text-white">Failed to load viewer</h4>
          <p className="max-w-md text-center text-sm text-muted-foreground">{cornerstone.error}</p>
        </div>
      )}

      {/* Image info overlay */}
      {cornerstone.isReady && (
        <div className="absolute bottom-2 left-2 z-10 rounded bg-black/60 px-2 py-1 text-xs text-white">
          Image: {cornerstone.currentIndex + 1} / {cornerstone.totalImages}
        </div>
      )}
    </div>
  );
}
