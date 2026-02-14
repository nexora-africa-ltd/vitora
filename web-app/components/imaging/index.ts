/**
 * Imaging module components barrel export.
 */

// Status/Priority/Modality Badges
export { OrderStatusBadge } from './order-status-badge';
export { PriorityBadge } from './priority-badge';
export { ModalityBadge } from './modality-badge';

// Procedure Selection
export { ProcedureSelector } from './procedure-selector';

// Order Management
export { ImagingOrderTable } from './imaging-order-table';
export { ImagingOrderForm } from './imaging-order-form';
export { ImagingOrderDetail } from './imaging-order-detail';

// Worklist
export { ImagingWorklist } from './imaging-worklist';

// Scheduling
export { SchedulingCalendar } from './scheduling-calendar';

// DICOM Viewer components (Phase C Sprint C.3)
// NOTE: DICOMViewer must be imported directly or via next/dynamic with ssr: false
// to avoid SSR issues with Cornerstone.js WASM modules.
// Do NOT export useCornerstone from this barrel file.
export { ViewerToolbar, SeriesPanel } from './dicom';
// Use: import dynamic from 'next/dynamic';
// const DICOMViewer = dynamic(() => import('@/components/imaging/dicom').then(m => m.DICOMViewer), { ssr: false });
