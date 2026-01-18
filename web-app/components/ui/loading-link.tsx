'use client';

import * as React from 'react';
import Link, { LinkProps } from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface LoadingLinkProps extends LinkProps {
  children: React.ReactNode;
  className?: string;
  showSpinner?: boolean;
}

/**
 * Link component that shows loading state when clicked
 * Useful for navigation that may take time
 */
export function LoadingLink({
  children,
  className,
  showSpinner = true,
  href,
  ...props
}: LoadingLinkProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Don't show loading for external links or hash links
    const hrefString = typeof href === 'string' ? href : href.pathname || '';
    if (hrefString.startsWith('http') || hrefString.startsWith('#')) {
      return;
    }

    setIsLoading(true);

    // Reset loading state after navigation (backup in case route doesn't change)
    setTimeout(() => setIsLoading(false), 3000);
  };

  return (
    <Link
      href={href}
      className={cn('inline-flex items-center gap-2', className)}
      onClick={handleClick}
      {...props}
    >
      {isLoading && showSpinner && (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      )}
      {children}
    </Link>
  );
}

export default LoadingLink;
