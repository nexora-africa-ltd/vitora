import * as React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
  label?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, name, id, type = 'text', ...props }, ref) => {
    // Generate a stable, SSR/CSR-consistent ID (prevents hydration mismatches).
    const reactId = React.useId();
    const safeReactId = React.useMemo(() => reactId.replace(/:/g, ''), [reactId]);
    const inputId = id ?? (name ? `${name}-${safeReactId}` : `input-${safeReactId}`);

    return (
      <div className="flex w-full flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium">
            {label}
          </label>
        )}

        <input
          ref={ref}
          id={inputId} // always has an ID
          name={name} // optional, but recommended for autofill
          type={type}
          data-slot="input"
          className={cn(
            'shadow-xs h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 md:text-sm',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive',
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
