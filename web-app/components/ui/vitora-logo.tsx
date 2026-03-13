import Image from 'next/image';
import { cn } from '@/lib/utils';

type VitoraLogoVariant = 'full' | 'icon';
type VitoraLogoTone = 'dark' | 'light' | 'burgundy-teal' | 'crimson' | 'teal' | 'white';
type VitoraLogoFit = 'contain' | 'crop';

interface LogoAssetMeta {
  src: string;
  sourceWidth: number;
  sourceHeight: number;
  cropWidth: number;
  cropHeight: number;
  cropLeft: number;
  cropTop: number;
}

export interface VitoraLogoProps {
  variant?: VitoraLogoVariant;
  tone?: VitoraLogoTone;
  fit?: VitoraLogoFit;
  alt: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
}

const LOGO_ASSETS: Record<VitoraLogoTone, Record<VitoraLogoVariant, LogoAssetMeta>> = {
  dark: {
    full: {
      src: '/dark-theme-logo.png',
      sourceWidth: 500,
      sourceHeight: 500,
      cropWidth: 371,
      cropHeight: 197,
      cropLeft: 67,
      cropTop: 149,
    },
    icon: {
      src: '/dark-icon.png',
      sourceWidth: 500,
      sourceHeight: 500,
      cropWidth: 189,
      cropHeight: 196,
      cropLeft: 133,
      cropTop: 156,
    },
  },
  light: {
    full: {
      src: '/light-theme-logo.png',
      sourceWidth: 500,
      sourceHeight: 500,
      cropWidth: 371,
      cropHeight: 196,
      cropLeft: 69,
      cropTop: 153,
    },
    icon: {
      src: '/light-icon.png',
      sourceWidth: 500,
      sourceHeight: 500,
      cropWidth: 189,
      cropHeight: 196,
      cropLeft: 145,
      cropTop: 149,
    },
  },
  'burgundy-teal': {
    full: {
      src: '/burgundy-teal.png',
      sourceWidth: 500,
      sourceHeight: 500,
      cropWidth: 371,
      cropHeight: 197,
      cropLeft: 67,
      cropTop: 149,
    },
    icon: {
      src: '/dark-icon.png',
      sourceWidth: 500,
      sourceHeight: 500,
      cropWidth: 189,
      cropHeight: 196,
      cropLeft: 133,
      cropTop: 156,
    },
  },
  crimson: {
    full: {
      src: '/crimson-logo.png',
      sourceWidth: 500,
      sourceHeight: 500,
      cropWidth: 370,
      cropHeight: 196,
      cropLeft: 58,
      cropTop: 160,
    },
    icon: {
      src: '/favicon.png',
      sourceWidth: 500,
      sourceHeight: 500,
      cropWidth: 189,
      cropHeight: 196,
      cropLeft: 133,
      cropTop: 156,
    },
  },
  teal: {
    full: {
      src: '/teal.png',
      sourceWidth: 500,
      sourceHeight: 500,
      cropWidth: 189,
      cropHeight: 197,
      cropLeft: 142,
      cropTop: 158,
    },
    icon: {
      src: '/teal.png',
      sourceWidth: 500,
      sourceHeight: 500,
      cropWidth: 189,
      cropHeight: 197,
      cropLeft: 142,
      cropTop: 158,
    },
  },
  white: {
    full: {
      src: '/white.png',
      sourceWidth: 500,
      sourceHeight: 500,
      cropWidth: 189,
      cropHeight: 196,
      cropLeft: 127,
      cropTop: 156,
    },
    icon: {
      src: '/white.png',
      sourceWidth: 500,
      sourceHeight: 500,
      cropWidth: 189,
      cropHeight: 196,
      cropLeft: 127,
      cropTop: 156,
    },
  },
};

export function VitoraLogo({
  variant = 'full',
  tone = 'dark',
  fit = 'crop',
  alt,
  className,
  imageClassName,
  priority = false,
}: VitoraLogoProps) {
  const asset = LOGO_ASSETS[tone][variant];

  if (fit === 'contain') {
    return (
      <Image
        src={asset.src}
        alt={alt}
        width={asset.sourceWidth}
        height={asset.sourceHeight}
        priority={priority}
        unoptimized
        className={cn('h-auto w-full object-contain', imageClassName, className)}
      />
    );
  }

  const widthPercent = (asset.sourceWidth / asset.cropWidth) * 100;
  const heightPercent = (asset.sourceHeight / asset.cropHeight) * 100;
  const leftPercent = (asset.cropLeft / asset.cropWidth) * 100;
  const topPercent = (asset.cropTop / asset.cropHeight) * 100;

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        className
      )}
      style={{ aspectRatio: `${asset.cropWidth} / ${asset.cropHeight}` }}
    >
      <Image
        src={asset.src}
        alt={alt}
        width={asset.sourceWidth}
        height={asset.sourceHeight}
        priority={priority}
        unoptimized
        className={cn(
          'absolute max-w-none',
          imageClassName
        )}
        style={{
          width: `${widthPercent}%`,
          height: `${heightPercent}%`,
          left: `-${leftPercent}%`,
          top: `-${topPercent}%`,
        }}
      />
    </div>
  );
}
