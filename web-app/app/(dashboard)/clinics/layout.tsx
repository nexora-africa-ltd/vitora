'use client';

import { ReactNode } from 'react';

interface ClinicsLayoutProps {
  children: ReactNode;
}

/**
 * Layout for the Clinics module.
 * Provides a consistent structure for all clinic-related pages.
 */
export default function ClinicsLayout({ children }: ClinicsLayoutProps) {
  return <>{children}</>;
}
