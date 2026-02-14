/**
 * DICOM Viewer Components
 * Phase C Sprint C.3: DICOM Viewer
 *
 * NOTE: DICOMViewer uses Cornerstone.js which requires browser-only execution.
 * Import DICOMViewer using next/dynamic with ssr: false:
 *
 * const DICOMViewer = dynamic(
 *   () => import('@/components/imaging/dicom/dicom-viewer').then(m => m.DICOMViewer),
 *   { ssr: false }
 * );
 */

// Static components (safe to import anywhere)
export { ViewerToolbar } from './viewer-toolbar';
export { SeriesPanel } from './series-panel';

// Dynamic-only exports (must use next/dynamic with ssr: false)
// export { DICOMViewer } from './dicom-viewer';
// export { useCornerstone, initCornerstone } from './use-cornerstone';
// export type { UseCornerstoneOptions, UseCornerstoneResult } from './use-cornerstone';
