'use client';

import Link, { type LinkProps } from 'next/link';
import type { ReactNode } from 'react';
import { useCreateRouteAccess } from '@/lib/hooks/use-create-route-access';

type CreateRouteLinkProps = LinkProps & {
  children: ReactNode;
  className?: string;
};

export function CreateRouteLink({ href, children, className, ...rest }: CreateRouteLinkProps) {
  const canCreateRoute = useCreateRouteAccess();
  const route = typeof href === 'string' ? href : href.pathname ?? '';

  if (!canCreateRoute(String(route))) {
    return null;
  }

  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}
