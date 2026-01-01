/**
 * Button component stub
 * This is a simplified version - in production, you'd implement a full button component
 */
import React from 'react';
import { cn } from '@/lib/utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'destructive';
  children: React.ReactNode;
}

export function Button({ variant = 'default', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        variant === 'default' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'outline' && 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        variant === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
