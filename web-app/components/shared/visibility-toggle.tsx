'use client';

import { EyeClosed, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

interface VisibilityToggleProps {
  /** Whether the content is currently visible */
  isVisible: boolean;
  /** Callback when visibility is toggled */
  onToggle: () => void;
  /** Label describing what is being shown/hidden (for accessibility) */
  label?: string;
  /** Size of the button */
  size?: 'sm' | 'default';
  /** Additional className for the button */
  className?: string;
}

/**
 * Reusable visibility toggle button with Eye/EyeOff icons.
 * Use for collapsible sections, show/hide toggles, etc.
 */
export function VisibilityToggle({
  isVisible,
  onToggle,
  label = 'content',
  size = 'sm',
  className,
}: VisibilityToggleProps) {
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <Button
      type="button"
      variant="ghost"
      size={size === 'sm' ? 'icon' : 'default'}
      onClick={onToggle}
      className={cn(
        size === 'sm' && 'h-8 w-8',
        className
      )}
      aria-label={isVisible ? `Hide ${label}` : `Show ${label}`}
      aria-expanded={isVisible}
    >
      {isVisible ? (
        <EyeClosed className={iconSize} />
      ) : (
        <Eye className={iconSize} />
      )}
    </Button>
  );
}
