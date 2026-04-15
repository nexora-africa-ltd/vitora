'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Minimize2, Maximize2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils/cn';

export type PeekPanelState = 'open' | 'minimized' | 'closed';

interface FloatingPeekPanelProps {
  /** Current panel state */
  state: PeekPanelState;
  /** Callback to update state */
  onStateChange: (state: PeekPanelState) => void;
  /** Panel title shown in header and minimized widget */
  title: string;
  /** Optional subtitle (e.g. date, type) */
  subtitle?: string;
  /** Icon component for minimized widget */
  icon?: React.ComponentType<{ className?: string }>;
  /** Link to full detail page (opens in same tab) */
  fullPageHref?: string;
  /** Panel content */
  children: React.ReactNode;
  /** Width class override for the open panel */
  className?: string;
}

export function FloatingPeekPanel({
  state,
  onStateChange,
  title,
  subtitle,
  icon: Icon,
  fullPageHref,
  children,
  className,
}: FloatingPeekPanelProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (state !== 'open') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onStateChange('closed');
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state, onStateChange]);

  const handleMinimize = useCallback(() => onStateChange('minimized'), [onStateChange]);
  const handleRestore = useCallback(() => onStateChange('open'), [onStateChange]);
  const handleClose = useCallback(() => onStateChange('closed'), [onStateChange]);

  if (!mounted || state === 'closed') return null;

  // ── Minimized: floating pill at bottom-right ──
  if (state === 'minimized') {
    return createPortal(
      <button
        type="button"
        onClick={handleRestore}
        className={cn(
          'fixed z-50 bottom-20 right-4',
          'flex items-center gap-2 px-3 py-2 rounded-full',
          'bg-card border shadow-lg',
          'hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]',
          'transition-all duration-200',
          'max-w-[200px]',
        )}
        aria-label={`Restore ${title} panel`}
      >
        {Icon && <Icon className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />}
        <span className="text-xs font-medium truncate">{title}</span>
        <Maximize2 className="h-3 w-3 text-muted-foreground shrink-0" />
      </button>,
      document.body,
    );
  }

  // ── Open: slide-over panel ──
  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 animate-in fade-in-0 duration-200"
        onClick={handleClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label={title}
        className={cn(
          'fixed z-50 inset-y-0 right-0 flex flex-col',
          'w-full sm:w-[420px] lg:w-[480px]',
          'bg-background border-l shadow-2xl',
          'animate-in slide-in-from-right duration-300',
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-muted/30">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold truncate">{title}</h3>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {fullPageHref && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                asChild
              >
                <a href={fullPageHref} aria-label="Open full page">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleMinimize}
              aria-label="Minimize panel"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleClose}
              aria-label="Close panel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4">
            {children}
          </div>
        </ScrollArea>
      </div>
    </>,
    document.body,
  );
}
