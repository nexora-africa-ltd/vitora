/**
 * DHA Logo Component
 *
 * Official Digital Health Agency (Kenya) logo component.
 * Uses the official DHA branding for consistent identity across the app.
 *
 * Usage:
 * ```tsx
 * <DhaLogo size="sm" />      // 16x16 (inline icons)
 * <DhaLogo size="md" />      // 20x20 (default, button icons)
 * <DhaLogo size="lg" />      // 32x32 (headers)
 * <DhaLogo size="xl" />      // 48x48 (hero sections)
 * <DhaLogo className="..." /> // Custom styling
 * ```
 */
import Image from 'next/image';
import { cn } from '@/lib/utils';

export interface DhaLogoProps {
  /** Size preset for the logo */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Additional CSS classes */
  className?: string;
  /** Whether to show as a subtle/muted version */
  muted?: boolean;
}

const SIZE_MAP = {
  xs: { class: 'h-3 w-auto', height: 12, width: 25 },
  sm: { class: 'h-4 w-auto', height: 16, width: 33 },
  md: { class: 'h-5 w-auto', height: 20, width: 41 },
  lg: { class: 'h-8 w-auto', height: 32, width: 66 },
  xl: { class: 'h-12 w-auto', height: 48, width: 99 },
} as const;

export function DhaLogo({ size = 'md', className, muted = false }: DhaLogoProps) {
  const sizeConfig = SIZE_MAP[size];

  return (
    <Image
      src="/dha-logo.png"
      alt="DHA"
      width={sizeConfig.width}
      height={sizeConfig.height}
      className={cn(
        sizeConfig.class,
        'object-contain',
        muted && 'opacity-60 grayscale',
        className
      )}
      priority={size === 'lg' || size === 'xl'}
    />
  );
}

/**
 * DhaIcon - A functional component matching Lucide icon interface
 * Can be used as a drop-in replacement for Lucide icons in navigation configs
 */
export function DhaIcon({ className }: { className?: string }) {
  const sizeMatch = className ? className.match(/h-(\d+)/) : null;
  const heightNum = sizeMatch && sizeMatch[1] ? parseInt(sizeMatch[1], 10) : 5;

  let size: DhaLogoProps['size'] = 'md';
  if (heightNum <= 3) size = 'xs';
  else if (heightNum <= 4) size = 'sm';
  else if (heightNum <= 5) size = 'md';
  else if (heightNum <= 8) size = 'lg';
  else size = 'xl';

  return <DhaLogo size={size} className={className} />;
}

export default DhaLogo;
