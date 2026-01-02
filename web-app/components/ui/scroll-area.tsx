'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'vertical' | 'horizontal' | 'both';
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, orientation = 'vertical', ...props }, ref) => {
    const scrollClasses = {
      vertical: 'overflow-y-auto overflow-x-hidden',
      horizontal: 'overflow-x-auto overflow-y-hidden',
      both: 'overflow-auto',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'relative',
          scrollClasses[orientation],
          // Custom scrollbar styling
          'scrollbar-thin scrollbar-thumb-rounded-md',
          'scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent',
          'hover:scrollbar-thumb-muted-foreground/40',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };
