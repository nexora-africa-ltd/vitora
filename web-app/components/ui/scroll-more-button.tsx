'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ScrollDirection = 'down' | 'up';

export interface ScrollMoreButtonProps {
  /** Ref to the ScrollArea root element (the one rendered by `ScrollArea`) */
  scrollAreaRef: React.RefObject<HTMLElement | null>;
  /** Which direction this button scrolls */
  direction?: ScrollDirection;
  /** Optional fixed scroll position override (rarely needed) */
  scrollToPx?: number;
  /** Extra classes for the wrapper (positioning) */
  className?: string;
  /** Extra classes for the button */
  buttonClassName?: string;
  /** Accessible label override */
  ariaLabel?: string;
}

function getViewportEl(scrollAreaRoot: HTMLElement | null): HTMLElement | null {
  if (!scrollAreaRoot) return null;
  return scrollAreaRoot.querySelector(
    '[data-slot="scroll-area-viewport"]'
  ) as HTMLElement | null;
}

function computeScrollState(viewport: HTMLElement) {
  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const canScrollUp = viewport.scrollTop > 1;
  const canScrollDown = viewport.scrollTop < maxScrollTop - 1;
  return { canScrollUp, canScrollDown };
}

export function ScrollMoreButton({
  scrollAreaRef,
  direction = 'down',
  scrollToPx,
  className,
  buttonClassName,
  ariaLabel,
}: ScrollMoreButtonProps) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const viewport = getViewportEl(scrollAreaRef.current);
    if (!viewport) return;

    let raf = 0;

    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const { canScrollDown, canScrollUp } = computeScrollState(viewport);
        setVisible(direction === 'down' ? canScrollDown : canScrollUp);
      });
    };

    update();

    viewport.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    const ro = new ResizeObserver(update);
    ro.observe(viewport);

    return () => {
      cancelAnimationFrame(raf);
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [direction, scrollAreaRef]);

  const Icon = direction === 'down' ? ChevronDown : ChevronUp;
  const label =
    ariaLabel ?? (direction === 'down' ? 'Scroll for more' : 'Scroll up');

  const handleClick = React.useCallback(() => {
    const viewport = getViewportEl(scrollAreaRef.current);
    if (!viewport) return;

    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const top =
      scrollToPx ?? (direction === 'down' ? maxScrollTop : 0);

    viewport.scrollTo({
      top,
      behavior: 'smooth',
    });
  }, [direction, scrollAreaRef, scrollToPx]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        'pointer-events-none absolute left-1/2 z-20 -translate-x-1/2',
        direction === 'down' ? 'bottom-3' : 'top-3',
        className
      )}
    >
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={label}
        className={cn(
          'pointer-events-auto h-8 w-8 rounded-full shadow-md',
          'bg-background/80 text-foreground backdrop-blur',
          'border border-primary/15 dark:border-primary/25',
          'hover:bg-background/95 hover:border-primary/25 dark:hover:border-primary/35',
          buttonClassName
        )}
        onClick={handleClick}
      >
        <Icon className="h-4 w-4" />
      </Button>
    </div>
  );
}
