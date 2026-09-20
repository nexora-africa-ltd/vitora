/**
 * Hook for initializing Cornerstone3D and managing viewport lifecycle.
 * Phase C Sprint C.3: DICOM Viewer
 *
 * Uses dynamic imports to avoid SSR issues with WASM modules.
 */
'use client';

import { useEffect, useRef, useState, useCallback, useId } from 'react';
import { DICOMViewerTool } from '@/lib/types/imaging';
import { tokenStorage } from '@/lib/auth/storage';

// =============================================================================
// MODULE REFERENCES (populated after dynamic import)
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cornerstoneCore: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cornerstoneTools: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dicomImageLoader: any = null;

let cornerstoneInitialized = false;
let initializationPromise: Promise<void> | null = null;

// Tool names (will be populated after init)
let TOOL_NAMES: Record<string, string> = {};

const VALID_VOI_LUT_FUNCTIONS = new Set(['LINEAR', 'LINEAR_EXACT', 'SIGMOID']);

function toImageId(source: string): string {
  return source.startsWith('dicomfile:') ? source : `wadouri:${source}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeVOILUTFunction(image: any): void {
  const metadataValue = Array.isArray(image.data?.VOILUTFunction)
    ? image.data.VOILUTFunction[0]
    : image.data?.VOILUTFunction;
  const candidate = String(metadataValue ?? image.voiLUTFunction ?? '')
    .trim()
    .toUpperCase();

  // DICOM defaults to LINEAR when VOILUTFunction is absent. Cornerstone 5.10.7
  // may truncate an explicit string to its first character ("S" or "L").
  image.voiLUTFunction = VALID_VOI_LUT_FUNCTIONS.has(candidate) ? candidate : 'LINEAR';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadAndNormalizeImage(core: any, imageId: string): Promise<void> {
  const image = await core.imageLoader.loadAndCacheImage(imageId);
  normalizeVOILUTFunction(image);
}

function attachDICOMAuth(xhr: XMLHttpRequest): void {
  // Web mode: send httpOnly auth cookies.
  xhr.withCredentials = true;

  // Desktop mode: attach Bearer token from local storage.
  const accessToken = tokenStorage.getAccessToken();
  if (accessToken) {
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resetViewportSafely(viewport: any): void {
  viewport.resetCamera?.();

  // Avoid resetProperties() because some StackViewport states throw inside
  // Cornerstone internals when VOI LUT metadata is incomplete.
  try {
    viewport.setProperties?.({ invert: false });
  } catch (error) {
    console.warn('[useCornerstone] setProperties failed during reset', error);
  }

  try {
    viewport.setViewPresentation?.({
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
    });
  } catch (error) {
    console.warn('[useCornerstone] setViewPresentation failed during reset', error);
  }

  viewport.render?.();
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize Cornerstone3D and related libraries.
 * This should be called once at app startup.
 */
export async function initCornerstone(): Promise<void> {
  if (cornerstoneInitialized) return;

  // Only run in browser
  if (typeof window === 'undefined') {
    throw new Error('Cornerstone can only be initialized in browser environment');
  }

  // StrictMode and multiple viewers can enter before the first import finishes.
  // Share the whole initialization, not just the completed flag.
  if (!initializationPromise) {
    initializationPromise = initializeCornerstone().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}

async function initializeCornerstone(): Promise<void> {
  try {
    // Dynamic imports to avoid SSR issues
    const [coreModule, toolsModule, dicomLoaderModule] = await Promise.all([
      import('@cornerstonejs/core'),
        import('@cornerstonejs/tools'),
      import('@cornerstonejs/dicom-image-loader'),
    ]);

    cornerstoneCore = coreModule;
    cornerstoneTools = toolsModule;
    dicomImageLoader = dicomLoaderModule.default || dicomLoaderModule;

    await cornerstoneCore.init();

    // Configure codec options to suppress filesystem warnings
    // The "Unable to add filesystem" is a known Emscripten issue when codecs initialize
    const dicomImageLoaderConfig = {
      strict: false,
      // Workers initialize eagerly; a stack viewer does not need one decoder
      // for every pair of logical CPU cores before displaying its first image.
      maxWebWorkers: 2,
      // Configure request headers for authentication (httpOnly cookies)
      beforeSend: attachDICOMAuth,
    };

    // Initialize DICOM image loader with dicom-parser
    // Note: In @cornerstonejs/dicom-image-loader v4+, dicom-parser is bundled internally
    // so we don't need to set external.dicomParser manually
    if (dicomImageLoader.init) {
      dicomImageLoader.init(dicomImageLoaderConfig);
    }

    // Also configure wadouri loader headers if available (alternative location)
    if (dicomImageLoader.wadouri?.configure) {
      dicomImageLoader.wadouri.configure({
        beforeSend: attachDICOMAuth,
      });
    }

    // Configure external dicomParser if the property exists (older API compatibility)
    if (dicomImageLoader.external) {
      const dicomParserModule = await import('dicom-parser');
      dicomImageLoader.external.dicomParser = dicomParserModule.default || dicomParserModule;
    } else if (dicomImageLoader.wadouri?.externalModules) {
      // Alternative location in some versions
      const dicomParserModule = await import('dicom-parser');
      dicomImageLoader.wadouri.externalModules.dicomParser =
        dicomParserModule.default || dicomParserModule;
    }
    // If neither exists, dicom-parser is bundled internally (v4+ behavior)

    // Configure cornerstone core (suppress WebGL warnings for SSR)
    try {
      cornerstoneCore.setUseSharedArrayBuffer?.(false);
    } catch {
      // SharedArrayBuffer may not be available without cross-origin isolation
      console.warn('[Cornerstone] SharedArrayBuffer not available');
    }

    // Register tools
    await cornerstoneTools.init();

    cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
    cornerstoneTools.addTool(cornerstoneTools.PanTool);
    cornerstoneTools.addTool(cornerstoneTools.WindowLevelTool);
    cornerstoneTools.addTool(cornerstoneTools.LengthTool);
    cornerstoneTools.addTool(cornerstoneTools.AngleTool);
    cornerstoneTools.addTool(cornerstoneTools.EllipticalROITool);
    cornerstoneTools.addTool(cornerstoneTools.RectangleROITool);
    cornerstoneTools.addTool(cornerstoneTools.StackScrollTool);

    // Populate tool names
    TOOL_NAMES = {
      pan: cornerstoneTools.PanTool.toolName,
      zoom: cornerstoneTools.ZoomTool.toolName,
      window_level: cornerstoneTools.WindowLevelTool.toolName,
      ruler: cornerstoneTools.LengthTool.toolName,
      angle: cornerstoneTools.AngleTool.toolName,
      rectangle: cornerstoneTools.RectangleROITool.toolName,
      ellipse: cornerstoneTools.EllipticalROITool.toolName,
    };

    cornerstoneInitialized = true;
    console.log('[Cornerstone] Initialized successfully');
  } catch (error) {
    console.error('[Cornerstone] Initialization failed:', error);
    throw error;
  }
}

// =============================================================================
// HOOK TYPES
// =============================================================================

export interface UseCornerstoneOptions {
  /** WADO URLs for all images in the stack */
  imageUrls: string[];
  /** Callback when image changes */
  onImageChange?: (index: number, total: number) => void;
  /** Callback when window/level changes */
  onWindowLevelChange?: (windowWidth: number, windowCenter: number) => void;
}

export interface UseCornerstoneResult {
  /** Reference to attach to the viewport container element */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Whether Cornerstone is ready */
  isReady: boolean;
  /** Current image index (0-based) */
  currentIndex: number;
  /** Total number of images */
  totalImages: number;
  /** Loading progress (0-100) */
  loadingProgress: number;
  /** Whether a different image is replacing the currently rendered frame */
  isImageLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Navigate to next image */
  nextImage: () => Promise<void>;
  /** Navigate to previous image */
  previousImage: () => Promise<void>;
  /** Go to specific image index */
  goToImage: (index: number) => Promise<void>;
  /** Set the active tool */
  setActiveTool: (tool: DICOMViewerTool) => void;
  /** Reset viewport to initial state */
  resetViewport: () => void;
  /** Invert the image */
  invertImage: () => void;
  /** Flip horizontal */
  flipHorizontal: () => void;
  /** Flip vertical */
  flipVertical: () => void;
  /** Rotate by 90 degrees */
  rotate90: () => void;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Hook for managing a Cornerstone viewport.
 */
export function useCornerstone(options: UseCornerstoneOptions): UseCornerstoneResult {
  const { imageUrls, onImageChange } = options;
  // Callers often recreate the array during polling/parent renders. Only a
  // change in URL contents should tear down and reload the viewport.
  const imageUrlsKey = JSON.stringify(imageUrls);
  const instanceId = useId();

  const containerRef = useRef<HTMLDivElement | null>(null);
  // Keep the loaded module on this viewer instance. Module globals can be
  // replaced during Fast Refresh while an already-mounted viewer is navigating.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cornerstoneCoreRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderingEngineRef = useRef<any>(null);
  // Stash callbacks in refs so they don't trigger the setup effect when their identity changes
  const onImageChangeRef = useRef(onImageChange);
  useEffect(() => {
    onImageChangeRef.current = onImageChange;
  }, [onImageChange]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolGroupRef = useRef<any>(null);

  const [isReady, setIsReady] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalImages, setTotalImages] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigationRequestRef = useRef(0);

  const viewportId = `dicom-viewport-${instanceId}`;
  const renderingEngineId = `vitora-dicom-engine-${instanceId}`;
  const toolGroupId = `vitora-dicom-toolgroup-${instanceId}`;
  const viewPresentationRef = useRef({
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
  });

  // Initialize Cornerstone and create viewport
  useEffect(() => {
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;
    let cancelLayoutWait: (() => void) | null = null;
    let removeImageListener: (() => void) | null = null;
    let removeImageErrorListener: (() => void) | null = null;
    // Each effect owns its resources. A stale async continuation must never
    // operate on refs belonging to a newer stack or another viewer.
    let renderingEngine: InstanceType<typeof cornerstoneCore.RenderingEngine> | null = null;
    let toolGroupCreated = false;
    const element = containerRef.current;
    const urls: string[] = JSON.parse(imageUrlsKey);
    const startedAt = performance.now();
    const logTiming = (phase: string) => {
      if (process.env.NODE_ENV !== 'production') {
        console.info('[Cornerstone timing]', {
          phase,
          elapsed_ms: Math.round(performance.now() - startedAt),
          images: urls.length,
        });
      }
    };

    async function setup() {
      setIsReady(false);
      setError(null);
      setLoadingProgress(0);
      setTotalImages(0);
      setCurrentIndex(0);
      if (!element || urls.length === 0) return;

      try {
        // Initialize Cornerstone if needed
        await initCornerstone();
        if (!mounted) return;
        logTiming('libraries_initialized');

        if (!cornerstoneCore || !cornerstoneTools) {
          throw new Error('Cornerstone modules not loaded');
        }
        cornerstoneCoreRef.current = cornerstoneCore;

        const { RenderingEngine, Enums } = cornerstoneCore;
        const { ToolGroupManager } = cornerstoneTools;

        // Create rendering engine
        renderingEngine = new RenderingEngine(renderingEngineId);
        renderingEngineRef.current = renderingEngine;

        // Create viewport - use string literal for ViewportType in v4+
        // In CST3D v4, ViewportType values are: 'stack', 'orthographic', 'perspective', 'video'
        // Wait for the container to have non-zero layout dimensions before
        // calling enableElement().  In flex / dynamic-import layouts the
        // container may still report 0×0 at this point which causes
        // Cornerstone to create a degenerate canvas that cannot be recovered
        // by later resize() calls.
        if (element.clientWidth === 0 || element.clientHeight === 0) {
          await new Promise<void>((resolve) => {
            const ro = new ResizeObserver((entries) => {
              for (const entry of entries) {
                if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                  ro.disconnect();
                  resolve();
                  return;
                }
              }
            });
            cancelLayoutWait = () => {
              ro.disconnect();
              resolve();
            };
            ro.observe(element);
          });
          // Bail out if the component was unmounted while we waited
          if (!mounted) return;
        }

        const viewportInput = {
          viewportId,
          element,
          type: Enums?.ViewportType?.STACK ?? 'stack',
        };
        renderingEngine.enableElement(viewportInput);

        // Keep the rendering engine in sync with the container size.
        // Without this, the canvas can be CSS-scaled which causes visible stretching/distortion.
        if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
          resizeObserver?.disconnect();
          resizeObserver = new ResizeObserver(() => {
            const engine = renderingEngine;
            if (!engine || !mounted) return;
            // keepCamera=true preserves current zoom/pan while resizing.
            engine.resize(true, true);
            engine.getViewport(viewportId)?.render();
          });
          resizeObserver.observe(element);
        }

        // Get the stack viewport
        const viewport = renderingEngine.getViewport(viewportId);
        viewPresentationRef.current = {
          rotation: 0,
          flipHorizontal: false,
          flipVertical: false,
        };

        // Prepare image IDs with wadouri scheme
        const imageIds = urls.map(toImageId);
        const firstImageId = imageIds[0];
        if (!firstImageId) return;

        // Cornerstone 5.10.7 can truncate a string VOI LUT function to one
        // character. Restore the full DICOM value before StackViewport uses it.
        await loadAndNormalizeImage(cornerstoneCoreRef.current, firstImageId);
        if (!mounted) return;
        logTiming('first_image_cached');

        // Subscribe before loading: setStack can render the first frame itself.
        // Remove before resizing/rendering to prevent re-entrant camera resets.
        const renderedEvent = Enums.Events.IMAGE_RENDERED;
        const handleImageRendered = () => {
          removeImageListener?.();
          if (!mounted || !renderingEngine) return;
          renderingEngine.resize(true, true);
          viewport.resetCamera();
          viewport.render();
          logTiming('first_frame_rendered');
        };
        removeImageListener = () => element.removeEventListener(renderedEvent, handleImageRendered);
        element.addEventListener(renderedEvent, handleImageRendered, { once: true });

        let imageLoadError: unknown;
        const imageLoadErrorEvent = Enums.Events.IMAGE_LOAD_ERROR;
        const handleImageLoadError = (event: Event) => {
          imageLoadError = (event as CustomEvent<{ error?: unknown }>).detail?.error;
        };
        removeImageErrorListener = () =>
          element.removeEventListener(imageLoadErrorEvent, handleImageLoadError);
        element.addEventListener(imageLoadErrorEvent, handleImageLoadError, { once: true });

        // Set the stack
        await viewport.setStack(imageIds);
        removeImageErrorListener();
        if (imageLoadError) {
          throw imageLoadError instanceof Error
            ? imageLoadError
            : new Error('Cornerstone could not load this DICOM image.');
        }
        if (!mounted) return;
        logTiming('stack_ready');

        // Create tool group
        const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
        toolGroupCreated = Boolean(toolGroup);
        toolGroupRef.current = toolGroup;

        // Add viewport to tool group
        toolGroup?.addViewport(viewportId, renderingEngineId);

        // Add tools to group
        Object.values(TOOL_NAMES).forEach((toolName) => {
          if (toolName) toolGroup?.addTool(toolName);
        });
        toolGroup?.addTool(cornerstoneTools.StackScrollTool.toolName);

        // Set default tools
        const { MouseBindings } = cornerstoneTools.Enums;
        toolGroup?.setToolActive(TOOL_NAMES.window_level, {
          bindings: [{ mouseButton: MouseBindings.Primary }],
        });
        toolGroup?.setToolActive(TOOL_NAMES.pan, {
          bindings: [{ mouseButton: MouseBindings.Auxiliary }],
        });
        toolGroup?.setToolActive(TOOL_NAMES.zoom, {
          bindings: [{ mouseButton: MouseBindings.Secondary }],
        });
        toolGroup?.setToolActive(cornerstoneTools.StackScrollTool.toolName, {
          bindings: [{ mouseButton: MouseBindings.Wheel }],
        });

        // Render initial frame
        viewport.render();

        if (mounted) {
          setTotalImages(urls.length);
          setCurrentIndex(0);
          setIsReady(true);
          setLoadingProgress(100);
          onImageChangeRef.current?.(0, urls.length);
        }
      } catch (err) {
        if (!mounted) return;
        console.error('[useCornerstone] Setup error:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize DICOM viewer');
        }
      }
    }

    setup();

    return () => {
      mounted = false;
      navigationRequestRef.current += 1;
      setIsImageLoading(false);
      cancelLayoutWait?.();
      removeImageListener?.();
      removeImageErrorListener?.();
      resizeObserver?.disconnect();
      resizeObserver = null;
      // Cleanup
      renderingEngine?.destroy();
      if (renderingEngineRef.current === renderingEngine) {
        renderingEngineRef.current = null;
      }
      if (toolGroupCreated && cornerstoneTools) {
        cornerstoneTools.ToolGroupManager.destroyToolGroup(toolGroupId);
        toolGroupRef.current = null;
      }
    };
  }, [imageUrlsKey, renderingEngineId, toolGroupId, viewportId]);

  // Navigation functions
  const goToImage = useCallback(
    async (index: number) => {
      if (!renderingEngineRef.current) return;

      const clampedIndex = Math.max(0, Math.min(index, totalImages - 1));
      if (clampedIndex === currentIndex) return;
      const viewport = renderingEngineRef.current.getViewport(viewportId);

      if (viewport) {
        const requestId = ++navigationRequestRef.current;
        setIsImageLoading(true);
        setError(null);
        try {
          const imageUrl = (JSON.parse(imageUrlsKey) as string[])[clampedIndex];
          if (!imageUrl) return;
          const core = cornerstoneCoreRef.current;
          if (!core) {
            throw new Error('Cornerstone is not initialized for this viewer.');
          }
          await loadAndNormalizeImage(core, toImageId(imageUrl));
          if (navigationRequestRef.current !== requestId) return;
          await viewport.setImageIdIndex(clampedIndex);
          if (navigationRequestRef.current !== requestId) return;
          setCurrentIndex(clampedIndex);
          onImageChangeRef.current?.(clampedIndex, totalImages);
        } catch (err) {
          if (navigationRequestRef.current !== requestId) return;
          setError(err instanceof Error ? err.message : 'Failed to load DICOM image');
        } finally {
          if (navigationRequestRef.current === requestId) {
            setIsImageLoading(false);
          }
        }
      }
    },
    [currentIndex, imageUrlsKey, totalImages, viewportId]
  );

  const nextImage = useCallback(() => {
    return goToImage(currentIndex + 1);
  }, [currentIndex, goToImage]);

  const previousImage = useCallback(() => {
    return goToImage(currentIndex - 1);
  }, [currentIndex, goToImage]);

  const withViewport = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handler: (viewport: any) => void) => {
      const viewport = renderingEngineRef.current?.getViewport(viewportId);
      if (!viewport) return;

      try {
        handler(viewport);
      } catch (error) {
        console.error('[useCornerstone] Viewport action failed:', error);
      }
    },
    [viewportId]
  );

  // Tool management
  const setActiveTool = useCallback(
    (tool: DICOMViewerTool) => {
      const toolGroup = toolGroupRef.current;
      if (!toolGroup || !cornerstoneTools) return;

      if (tool === 'reset') {
        withViewport((viewport) => {
          resetViewportSafely(viewport);
        });
        return;
      }

      const toolName = TOOL_NAMES[tool];
      if (!toolName) return;

      // Deactivate ALL tools on primary mouse button (navigation + annotation)
      // This prevents tool conflicts where two tools respond to the same click
      [
        TOOL_NAMES.window_level,
        TOOL_NAMES.pan,
        TOOL_NAMES.zoom,
        TOOL_NAMES.ruler,
        TOOL_NAMES.angle,
        TOOL_NAMES.ellipse,
        TOOL_NAMES.rectangle,
      ]
        .filter(Boolean)
        .forEach((name) => {
          toolGroup.setToolPassive(name);
        });

      // Set the new tool as active on primary mouse button
      const { MouseBindings } = cornerstoneTools.Enums;
      toolGroup.setToolActive(toolName, {
        bindings: [{ mouseButton: MouseBindings.Primary }],
      });

      // Keep middle-button pan and right-button zoom as secondary bindings
      // (unless the user explicitly selected those tools for primary)
      if (toolName !== TOOL_NAMES.pan) {
        toolGroup.setToolActive(TOOL_NAMES.pan, {
          bindings: [{ mouseButton: MouseBindings.Auxiliary }],
        });
      }
      if (toolName !== TOOL_NAMES.zoom) {
        toolGroup.setToolActive(TOOL_NAMES.zoom, {
          bindings: [{ mouseButton: MouseBindings.Secondary }],
        });
      }
    },
    [withViewport]
  );

  // Viewport manipulation
  const resetViewport = useCallback(() => {
    viewPresentationRef.current = {
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
    };
    withViewport((viewport) => {
      resetViewportSafely(viewport);
    });
  }, [withViewport]);

  const invertImage = useCallback(() => {
    withViewport((viewport) => {
      const { invert } = viewport.getProperties();
      viewport.setProperties({ invert: !invert });
      viewport.render();
    });
  }, [withViewport]);

  const flipHorizontal = useCallback(() => {
    const nextFlipHorizontal = !viewPresentationRef.current.flipHorizontal;
    viewPresentationRef.current = {
      ...viewPresentationRef.current,
      flipHorizontal: nextFlipHorizontal,
    };

    withViewport((viewport) => {
      viewport.resetCamera?.();
      viewport.setViewPresentation?.({
        ...viewPresentationRef.current,
      });
      viewport.render();
    });
  }, [withViewport]);

  const flipVertical = useCallback(() => {
    const nextFlipVertical = !viewPresentationRef.current.flipVertical;
    viewPresentationRef.current = {
      ...viewPresentationRef.current,
      flipVertical: nextFlipVertical,
    };

    withViewport((viewport) => {
      viewport.resetCamera?.();
      viewport.setViewPresentation?.({
        ...viewPresentationRef.current,
      });
      viewport.render();
    });
  }, [withViewport]);

  const rotate90 = useCallback(() => {
    viewPresentationRef.current = {
      ...viewPresentationRef.current,
      rotation: (viewPresentationRef.current.rotation + 90) % 360,
    };

    withViewport((viewport) => {
      viewport.setViewPresentation?.({
        ...viewPresentationRef.current,
      });
      viewport.render();
    });
  }, [withViewport]);

  return {
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    isReady,
    currentIndex,
    totalImages,
    loadingProgress,
    isImageLoading,
    error,
    nextImage,
    previousImage,
    goToImage,
    setActiveTool,
    resetViewport,
    invertImage,
    flipHorizontal,
    flipVertical,
    rotate90,
  };
}
