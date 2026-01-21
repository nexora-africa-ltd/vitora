/**
 * SHA Logo Component
 *
 * Official Social Health Authority (Kenya) logo component.
 * Uses the official SHA branding SVG for consistent identity across the app.
 *
 * Usage:
 * ```tsx
 * <SHALogo size="sm" />      // 16x16 (inline icons)
 * <SHALogo size="md" />      // 20x20 (default, button icons)
 * <SHALogo size="lg" />      // 32x32 (headers)
 * <SHALogo size="xl" />      // 48x48 (hero sections)
 * <SHALogo className="..." /> // Custom styling
 * ```
 */
import Image from 'next/image';
import { cn } from '@/lib/utils';

export interface SHALogoProps {
  /** Size preset for the logo */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Additional CSS classes */
  className?: string;
  /** Whether to show as a subtle/muted version */
  muted?: boolean;
}

const SIZE_MAP = {
  xs: { class: 'h-3 w-3', px: 12 },
  sm: { class: 'h-4 w-4', px: 16 },
  md: { class: 'h-5 w-5', px: 20 },
  lg: { class: 'h-8 w-8', px: 32 },
  xl: { class: 'h-12 w-12', px: 48 },
} as const;

export function SHALogo({ size = 'md', className, muted = false }: SHALogoProps) {
  const sizeConfig = SIZE_MAP[size];

  return (
    <Image
      src="/sha-logo.svg"
      alt="SHA"
      width={sizeConfig.px}
      height={sizeConfig.px}
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
 * SHAIcon - A functional component matching Lucide icon interface
 * Can be used as a drop-in replacement for Lucide icons in navigation configs
 */
export function SHAIcon({ className }: { className?: string }) {
  // Extract size from className if present (e.g., "h-4 w-4")
  const sizeMatch = className ? className.match(/h-(\d+)/) : null;
  const heightNum = sizeMatch && sizeMatch[1] ? parseInt(sizeMatch[1], 10) : 5;

  // Map Tailwind height classes to our size presets
  let size: SHALogoProps['size'] = 'md';
  if (heightNum <= 3) size = 'xs';
  else if (heightNum <= 4) size = 'sm';
  else if (heightNum <= 5) size = 'md';
  else if (heightNum <= 8) size = 'lg';
  else size = 'xl';

  return <SHALogo size={size} className={className} />;
}

export default SHALogo;
