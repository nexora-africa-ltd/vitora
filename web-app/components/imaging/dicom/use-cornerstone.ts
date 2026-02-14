/**
 * Hook for initializing Cornerstone3D and managing viewport lifecycle.
 * Phase C Sprint C.3: DICOM Viewer
 *
 * Uses dynamic imports to avoid SSR issues with WASM modules.
 */
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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

// Tool names (will be populated after init)
let TOOL_NAMES: Record<string, string> = {};

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

  try {
    // Dynamic imports to avoid SSR issues
    const [coreModule, toolsModule, dicomLoaderModule, dicomParserModule] = await Promise.all([
      import('@cornerstonejs/core'),
      import('@cornerstonejs/tools'),
      import('@cornerstonejs/dicom-image-loader'),
      import('dicom-parser'),
    ]);

    cornerstoneCore = coreModule;
    cornerstoneTools = toolsModule;
    dicomImageLoader = dicomLoaderModule.default || dicomLoaderModule;

    // Configure codec options to suppress filesystem warnings
    // The "Unable to add filesystem" is a known Emscripten issue when codecs initialize
    const dicomImageLoaderConfig = {
      strict: false,
      // Use web workers for decoding when available
      useWebWorkers: true,
      // Decode config - simpler decoding without advanced codecs if needed
      decodeConfig: {
        // Allow native decoding where possible
        convertFloatPixelDataToInt: false,
      },
      // Configure request headers for authentication
      beforeSend: (xhr: XMLHttpRequest) => {
        const token = tokenStorage.getAccessToken();
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
      },
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
        beforeSend: (xhr: XMLHttpRequest) => {
          const token = tokenStorage.getAccessToken();
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
        },
      });
    }

    // Configure external dicomParser if the property exists (older API compatibility)
    if (dicomImageLoader.external) {
      dicomImageLoader.external.dicomParser = dicomParserModule.default || dicomParserModule;
    } else if (dicomImageLoader.wadouri?.externalModules) {
      // Alternative location in some versions
      dicomImageLoader.wadouri.externalModules.dicomParser = dicomParserModule.default || dicomParserModule;
    }
    // If neither exists, dicom-parser is bundled internally (v4+ behavior)

    // Configure cornerstone core (suppress WebGL warnings for SSR)
    try {
      cornerstoneCore.setUseSharedArrayBuffer?.(false);
    } catch {
      // SharedArrayBuffer may not be available without cross-origin isolation
      console.warn('[Cornerstone] SharedArrayBuffer not available');
    }

    // Initialize cornerstone core (required before creating RenderingEngine)
    await cornerstoneCore.init();

    // Initialize tools
    await cornerstoneTools.init();

    // Register tools
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
  /** Error message if any */
  error: string | null;
  /** Navigate to next image */
  nextImage: () => void;
  /** Navigate to previous image */
  previousImage: () => void;
  /** Go to specific image index */
  goToImage: (index: number) => void;
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderingEngineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolGroupRef = useRef<any>(null);

  const [isReady, setIsReady] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalImages, setTotalImages] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const viewportId = 'dicom-viewport';
  const renderingEngineId = 'vitora-dicom-engine';
  const toolGroupId = 'vitora-dicom-toolgroup';

  // Initialize Cornerstone and create viewport
  useEffect(() => {
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;

    async function setup() {
      if (!containerRef.current || imageUrls.length === 0) return;

      try {
        // Initialize Cornerstone if needed
        await initCornerstone();

        if (!cornerstoneCore || !cornerstoneTools) {
          throw new Error('Cornerstone modules not loaded');
        }

        const { RenderingEngine, Enums } = cornerstoneCore;
        const { ToolGroupManager } = cornerstoneTools;

        // Debug: log available viewport types
        console.log('[Cornerstone] ViewportType enum:', Enums?.ViewportType);

        // Clean up any existing rendering engine
        if (renderingEngineRef.current) {
          renderingEngineRef.current.destroy();
        }

        // Create rendering engine
        const renderingEngine = new RenderingEngine(renderingEngineId);
        renderingEngineRef.current = renderingEngine;

        // Create viewport - use string literal for ViewportType in v4+
        // In CST3D v4, ViewportType values are: 'stack', 'orthographic', 'perspective', 'video'
        const element = containerRef.current;
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
            const engine = renderingEngineRef.current;
            if (!engine) return;
            // keepCamera=true preserves current zoom/pan while resizing.
            engine.resize(true, true);
            engine.getViewport(viewportId)?.render();
          });
          resizeObserver.observe(element);
        }

        // Get the stack viewport
        const viewport = renderingEngine.getViewport(viewportId);

        // Prepare image IDs with wadouri scheme
        const imageIds = imageUrls.map((url) => `wadouri:${url}`);

        // Set the stack
        await viewport.setStack(imageIds);

        // Create tool group
        let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
        if (!toolGroup) {
          toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
        }
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

        // Render
        viewport.render();

        if (mounted) {
          setTotalImages(imageUrls.length);
          setCurrentIndex(0);
          setIsReady(true);
          setLoadingProgress(100);
          onImageChange?.(0, imageUrls.length);
        }
      } catch (err) {
        console.error('[useCornerstone] Setup error:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize DICOM viewer');
        }
      }
    }

    setup();

    return () => {
      mounted = false;
      resizeObserver?.disconnect();
      resizeObserver = null;
      // Cleanup
      if (renderingEngineRef.current) {
        renderingEngineRef.current.destroy();
        renderingEngineRef.current = null;
      }
      if (toolGroupRef.current && cornerstoneTools) {
        cornerstoneTools.ToolGroupManager.destroyToolGroup(toolGroupId);
        toolGroupRef.current = null;
      }
    };
  }, [imageUrls, onImageChange]);

  // Navigation functions
  const goToImage = useCallback(
    (index: number) => {
      if (!renderingEngineRef.current) return;

      const clampedIndex = Math.max(0, Math.min(index, totalImages - 1));
      const viewport = renderingEngineRef.current.getViewport(viewportId);

      if (viewport) {
        viewport.setImageIdIndex(clampedIndex);
        viewport.render();
        setCurrentIndex(clampedIndex);
        onImageChange?.(clampedIndex, totalImages);
      }
    },
    [totalImages, onImageChange]
  );

  const nextImage = useCallback(() => {
    goToImage(currentIndex + 1);
  }, [currentIndex, goToImage]);

  const previousImage = useCallback(() => {
    goToImage(currentIndex - 1);
  }, [currentIndex, goToImage]);

  // Tool management
  const setActiveTool = useCallback((tool: DICOMViewerTool) => {
    const toolGroup = toolGroupRef.current;
    if (!toolGroup || !cornerstoneTools) return;

    if (tool === 'reset') {
      // Reset viewport
      const viewport = renderingEngineRef.current?.getViewport(viewportId);
      if (viewport) {
        viewport.resetCamera();
        viewport.resetProperties();
        viewport.render();
      }
      return;
    }

    const toolName = TOOL_NAMES[tool];
    if (!toolName) return;

    // Deactivate all annotation tools first
    [TOOL_NAMES.ruler, TOOL_NAMES.angle, TOOL_NAMES.ellipse, TOOL_NAMES.rectangle]
      .filter(Boolean)
      .forEach((name) => {
        toolGroup.setToolPassive(name);
      });

    // Set the new tool as active on primary mouse button
    const { MouseBindings } = cornerstoneTools.Enums;
    toolGroup.setToolActive(toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  }, []);

  // Viewport manipulation
  const resetViewport = useCallback(() => {
    const viewport = renderingEngineRef.current?.getViewport(viewportId);
    if (viewport) {
      viewport.resetCamera();
      viewport.resetProperties();
      viewport.render();
    }
  }, []);

  const invertImage = useCallback(() => {
    const viewport = renderingEngineRef.current?.getViewport(viewportId);
    if (viewport) {
      const { invert } = viewport.getProperties();
      viewport.setProperties({ invert: !invert });
      viewport.render();
    }
  }, []);

  const flipHorizontal = useCallback(() => {
    const viewport = renderingEngineRef.current?.getViewport(viewportId);
    if (viewport) {
      viewport.render();
    }
  }, []);

  const flipVertical = useCallback(() => {
    const viewport = renderingEngineRef.current?.getViewport(viewportId);
    if (viewport) {
      viewport.render();
    }
  }, []);

  const rotate90 = useCallback(() => {
    const viewport = renderingEngineRef.current?.getViewport(viewportId);
    if (viewport) {
      const { rotation = 0 } = viewport.getProperties();
      viewport.setProperties({ rotation: (rotation + 90) % 360 });
      viewport.render();
    }
  }, []);

  return {
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    isReady,
    currentIndex,
    totalImages,
    loadingProgress,
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
