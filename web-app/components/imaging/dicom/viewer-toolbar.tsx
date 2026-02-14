/**
 * DICOM Viewer Toolbar Component
 * Phase C Sprint C.3: DICOM Viewer
 */
'use client';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import {
  Move,
  ZoomIn,
  SunDim,
  Ruler,
  TriangleRight,
  Square,
  Circle,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  RotateCw,
  Contrast,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DICOMViewerTool } from '@/lib/types/imaging';

interface ViewerToolbarProps {
  /** Currently active tool */
  activeTool: DICOMViewerTool;
  /** Callback when tool is selected */
  onToolChange: (tool: DICOMViewerTool) => void;
  /** Callback for reset viewport */
  onReset: () => void;
  /** Callback for invert image */
  onInvert: () => void;
  /** Callback for flip horizontal */
  onFlipH: () => void;
  /** Callback for flip vertical */
  onFlipV: () => void;
  /** Callback for rotate 90 degrees */
  onRotate: () => void;
  /** Current image index */
  currentIndex: number;
  /** Total images */
  totalImages: number;
  /** Go to previous image */
  onPrevious: () => void;
  /** Go to next image */
  onNext: () => void;
  /** Whether viewer is ready */
  isReady: boolean;
  /** Orientation: horizontal or vertical */
  orientation?: 'horizontal' | 'vertical';
  /** Additional class names */
  className?: string;
}

interface ToolButtonProps {
  tool: DICOMViewerTool;
  activeTool: DICOMViewerTool;
  onToolChange: (tool: DICOMViewerTool) => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}

function ToolButton({ tool, activeTool, onToolChange, icon, label, disabled }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={activeTool === tool ? 'default' : 'ghost'}
          size="icon"
          className={cn(
            'h-8 w-8',
            activeTool === tool && 'bg-primary text-primary-foreground'
          )}
          onClick={() => onToolChange(tool)}
          disabled={disabled}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface ActionButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}

function ActionButton({ onClick, icon, label, disabled }: ActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClick}
          disabled={disabled}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function ViewerToolbar({
  activeTool,
  onToolChange,
  onReset,
  onInvert,
  onFlipH,
  onFlipV,
  onRotate,
  currentIndex,
  totalImages,
  onPrevious,
  onNext,
  isReady,
  orientation = 'horizontal',
  className,
}: ViewerToolbarProps) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'flex items-center gap-0.5 sm:gap-1 p-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border rounded-lg',
          isHorizontal ? 'flex-row' : 'flex-col',
          className
        )}
      >
        {/* Navigation Tools - always visible */}
        <div className={cn('flex gap-0.5', !isHorizontal && 'flex-col')}>
          <ToolButton
            tool="pan"
            activeTool={activeTool}
            onToolChange={onToolChange}
            icon={<Move className="h-4 w-4" />}
            label="Pan (Middle Mouse)"
            disabled={!isReady}
          />
          <ToolButton
            tool="zoom"
            activeTool={activeTool}
            onToolChange={onToolChange}
            icon={<ZoomIn className="h-4 w-4" />}
            label="Zoom (Right Mouse)"
            disabled={!isReady}
          />
          <ToolButton
            tool="window_level"
            activeTool={activeTool}
            onToolChange={onToolChange}
            icon={<SunDim className="h-4 w-4" />}
            label="Window/Level (Left Mouse)"
            disabled={!isReady}
          />
        </div>

        <Separator orientation={isHorizontal ? 'vertical' : 'horizontal'} className={cn(isHorizontal ? 'h-6' : 'w-6', 'hidden sm:block')} />

        {/* Measurement Tools - hidden on mobile */}
        <div className={cn('hidden sm:flex gap-0.5', !isHorizontal && 'flex-col')}>
          <ToolButton
            tool="ruler"
            activeTool={activeTool}
            onToolChange={onToolChange}
            icon={<Ruler className="h-4 w-4" />}
            label="Measure Length"
            disabled={!isReady}
          />
          <ToolButton
            tool="angle"
            activeTool={activeTool}
            onToolChange={onToolChange}
            icon={<TriangleRight className="h-4 w-4" />}
            label="Measure Angle"
            disabled={!isReady}
          />
          <ToolButton
            tool="rectangle"
            activeTool={activeTool}
            onToolChange={onToolChange}
            icon={<Square className="h-4 w-4" />}
            label="Rectangle ROI"
            disabled={!isReady}
          />
          <ToolButton
            tool="ellipse"
            activeTool={activeTool}
            onToolChange={onToolChange}
            icon={<Circle className="h-4 w-4" />}
            label="Ellipse ROI"
            disabled={!isReady}
          />
        </div>

        <Separator orientation={isHorizontal ? 'vertical' : 'horizontal'} className={cn(isHorizontal ? 'h-6' : 'w-6', 'hidden sm:block')} />

        {/* Manipulation Actions - only reset on mobile, all on sm+ */}
        <div className={cn('flex gap-0.5', !isHorizontal && 'flex-col')}>
          <span className="hidden sm:contents">
            <ActionButton
              onClick={onInvert}
              icon={<Contrast className="h-4 w-4" />}
              label="Invert Image"
              disabled={!isReady}
            />
            <ActionButton
              onClick={onFlipH}
              icon={<FlipHorizontal className="h-4 w-4" />}
              label="Flip Horizontal"
              disabled={!isReady}
            />
            <ActionButton
              onClick={onFlipV}
              icon={<FlipVertical className="h-4 w-4" />}
              label="Flip Vertical"
              disabled={!isReady}
            />
            <ActionButton
              onClick={onRotate}
              icon={<RotateCw className="h-4 w-4" />}
              label="Rotate 90°"
              disabled={!isReady}
            />
          </span>
          <ActionButton
            onClick={onReset}
            icon={<RotateCcw className="h-4 w-4" />}
            label="Reset View"
            disabled={!isReady}
          />
        </div>

        <Separator orientation={isHorizontal ? 'vertical' : 'horizontal'} className={isHorizontal ? 'h-6' : 'w-6'} />

        {/* Image Navigation - always visible */}
        <div className={cn('flex items-center gap-0.5 sm:gap-1', !isHorizontal && 'flex-col')}>
          <ActionButton
            onClick={onPrevious}
            icon={<ChevronLeft className="h-4 w-4" />}
            label="Previous Image"
            disabled={!isReady || currentIndex <= 0}
          />
          <span className="text-xs text-muted-foreground min-w-[40px] sm:min-w-[60px] text-center">
            {isReady ? `${currentIndex + 1}/${totalImages}` : '-/-'}
          </span>
          <ActionButton
            onClick={onNext}
            icon={<ChevronRight className="h-4 w-4" />}
            label="Next Image"
            disabled={!isReady || currentIndex >= totalImages - 1}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
