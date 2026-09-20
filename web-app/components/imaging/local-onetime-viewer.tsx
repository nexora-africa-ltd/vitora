// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Browser-only viewer for one-time DICOM and standard image inspection.
 *
 * Use from an authenticated imaging route. Files are retained only in browser
 * memory/object URLs and are never posted to an API or persisted by Vitora.
 * Accepted inputs: .dcm, .dicom, PNG, JPEG, and WebP files.
 */
'use client';

import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, FileImage, Loader2, Maximize2, Minimize2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ViewerToolbar } from '@/components/imaging/dicom/viewer-toolbar';
import { initCornerstone, useCornerstone } from '@/components/imaging/dicom/use-cornerstone';
import { DICOMViewerTool } from '@/lib/types/imaging';

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DICOM_EXTENSIONS = new Set(['dcm', 'dicom']);

function isDicomFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return file.type === 'application/dicom' || Boolean(extension && DICOM_EXTENSIONS.has(extension));
}

function isSupportedImageFile(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.has(file.type);
}

export function LocalOneTimeViewer() {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const dicomImageIdsRef = useRef<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileManagerRef = useRef<any>(null);
  const [dicomImageIds, setDicomImageIds] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<DICOMViewerTool>('window_level');
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const cornerstone = useCornerstone({ imageUrls: dicomImageIds });
  const isDicom = dicomImageIds.length > 0;

  const clearViewer = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (fileManagerRef.current) {
      dicomImageIdsRef.current.forEach((imageId) => {
        const index = Number(imageId.replace('dicomfile:', ''));
        if (Number.isInteger(index)) fileManagerRef.current.remove(index);
      });
    }
    dicomImageIdsRef.current = [];
    setDicomImageIds([]);
    setImageUrl(null);
    setFileName(null);
    setSelectionError(null);
    setActiveTool('window_level');
    setIsFullscreen(false);
  }, []);

  useEffect(() => clearViewer, [clearViewer]);

  const selectFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (!files.length) return;

      clearViewer();
      const dicomFiles = files.filter(isDicomFile);
      const imageFile = files.find(isSupportedImageFile);

      if (dicomFiles.length && imageFile) {
        setSelectionError('Select DICOM files or one standard image, not both together.');
        return;
      }
      if (imageFile) {
        const objectUrl = URL.createObjectURL(imageFile);
        objectUrlRef.current = objectUrl;
        setImageUrl(objectUrl);
        setFileName(imageFile.name);
        return;
      }
      if (!dicomFiles.length) {
        setSelectionError('Choose a DICOM (.dcm, .dicom), PNG, JPEG, or WebP file.');
        return;
      }

      try {
        await initCornerstone();
        const dicomModule = await import('@cornerstonejs/dicom-image-loader');
        const loader = dicomModule.default || dicomModule;
        fileManagerRef.current = loader.wadouri.fileManager;
        const imageIds = dicomFiles.map((file) => fileManagerRef.current.add(file));
        dicomImageIdsRef.current = imageIds;
        setDicomImageIds(imageIds);
        setFileName(
          dicomFiles.length === 1 && dicomFiles[0]
            ? dicomFiles[0].name
            : `${dicomFiles.length} DICOM files`
        );
      } catch (error) {
        setSelectionError(
          error instanceof Error ? error.message : 'Could not open the selected DICOM file.'
        );
      }
    },
    [clearViewer]
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium">Local, one-time viewing</p>
            <p className="text-sm text-muted-foreground">
              Files stay in this browser session. They are not linked to a patient, uploaded, or
              saved to Vitora.
            </p>
          </div>
          <Button onClick={() => inputRef.current?.click()} className="w-full shrink-0 sm:w-auto">
            <Upload className="mr-2 h-4 w-4" />
            Choose Files
          </Button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".dcm,.dicom,application/dicom,image/jpeg,image/png,image/webp"
            multiple
            onChange={selectFiles}
          />
        </CardContent>
      </Card>

      {selectionError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {selectionError}
        </div>
      )}

      {!fileName && !selectionError && (
        <Card className="border-dashed">
          <CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center">
            <FileImage className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Open a local DICOM or image</p>
            <p className="max-w-md text-sm text-muted-foreground">
              DICOM series, PNG, JPEG, and WebP are supported. Nothing leaves this device.
            </p>
          </CardContent>
        </Card>
      )}

      {fileName && (
        <div
          className={
            isFullscreen
              ? 'fixed inset-0 z-50 bg-black'
              : 'relative min-h-[28rem] overflow-hidden rounded-xl border bg-black sm:min-h-[36rem]'
          }
          role="region"
          aria-label="Local imaging preview"
        >
          <div className="absolute left-3 top-3 z-30 max-w-[calc(100%-7rem)] truncate rounded bg-black/60 px-2 py-1 text-xs text-white">
            {fileName}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 z-30 bg-black/60 text-white hover:bg-black/80"
            onClick={clearViewer}
            aria-label="Clear local viewer"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-14 top-3 z-30 bg-black/60 text-white hover:bg-black/80"
            onClick={() => setIsFullscreen((current) => !current)}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          {isDicom && (
            <div className="absolute left-1/2 top-3 z-30 max-w-[calc(100%-8rem)] -translate-x-1/2 overflow-x-auto sm:max-w-none">
              <ViewerToolbar
                activeTool={activeTool}
                onToolChange={(tool) => {
                  setActiveTool(tool);
                  cornerstone.setActiveTool(tool);
                }}
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

          {imageUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- browser object URLs cannot use Next image optimization. */}
              <img
                src={imageUrl}
                alt="Local preview"
                className="absolute inset-0 h-full w-full object-contain"
              />
            </>
          )}
          {isDicom && (
            <div
              ref={cornerstone.containerRef}
              className="absolute inset-0"
              style={{ touchAction: 'none' }}
            />
          )}

          {isDicom && (!cornerstone.isReady || cornerstone.isImageLoading) && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 text-white">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm">
                {cornerstone.isImageLoading
                  ? 'Loading selected image...'
                  : 'Loading local DICOM...'}
              </span>
            </div>
          )}
          {cornerstone.error && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/90 p-6 text-center text-white">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <span className="max-w-md text-sm">{cornerstone.error}</span>
            </div>
          )}
          {isDicom && cornerstone.isReady && (
            <div className="absolute bottom-3 left-3 z-20 rounded bg-black/60 px-2 py-1 text-xs text-white">
              Image: {cornerstone.currentIndex + 1} / {cornerstone.totalImages}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
