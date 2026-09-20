// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Authenticated route for viewing local DICOM and image files without upload.
 *
 * Use: visit /imaging/local-viewer with imaging study-view permission.
 * Inputs: .dcm, .dicom, PNG, JPEG, and WebP selected in the browser.
 */
'use client';

import { PageHeader } from '@/components/shared/page-header';
import { LocalOneTimeViewer } from '@/components/imaging/local-onetime-viewer';
import { usePermissions } from '@/lib/hooks/use-permissions';

export default function LocalViewerPage() {
  const { hasPermission } = usePermissions();
  const canView = hasPermission('imaging.view_studies');

  if (!canView) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        You do not have permission to use the local imaging viewer.
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Local Imaging Viewer"
        helpContent="Inspect a DICOM or image file locally. The file is never uploaded, linked to a patient, or saved to Vitora."
      />
      <LocalOneTimeViewer />
    </div>
  );
}
