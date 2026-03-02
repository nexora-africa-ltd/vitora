'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface KenyaIconProps {
  className?: string;
  size?: number;
}

/**
 * Reusable Kenya icon that adapts to light/dark modes.
 * In dark mode, applies brightness/invert filters to maintain visibility.
 */
export function KenyaIcon({ className, size = 32 }: KenyaIconProps) {
  return (
    <Image
      src="/ke-01.png"
      alt="Kenya"
      width={size}
      height={size}
      className={cn(
        'object-contain',
        // Dark mode: invert and adjust hue to maintain color fidelity
        'dark:brightness-0 dark:invert',
        className
      )}
    />
  );
}
