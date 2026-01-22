'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

interface KenyaCoatOfArmsProps {
  /** Size of the icon (default: 24) */
  size?: number;
  /** Additional CSS classes */
  className?: string;
  /** Alt text for accessibility */
  alt?: string;
}

/**
 * Kenya Coat of Arms Icon
 *
 * Official emblem of the Republic of Kenya, used to indicate
 * government-related services and integrations like:
 * - SHA (Social Health Authority)
 * - DHA (Digital Health Authority)
 * - KHIS (Kenya Health Information System)
 * - Government registries
 *
 * @example
 * <KenyaCoatOfArms size={20} className="text-muted-foreground" />
 */
export function KenyaCoatOfArms({
  size = 24,
  className,
  alt = 'Kenya Coat of Arms',
}: KenyaCoatOfArmsProps) {
  return (
    <Image
      src="/coa.svg"
      alt={alt}
      width={size}
      height={size}
      className={cn('inline-block shrink-0', className)}
      // Ensure crisp rendering at small sizes
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
      }}
    />
  );
}

export default KenyaCoatOfArms;
