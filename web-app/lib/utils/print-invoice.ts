/**
 * Print Invoice Utility
 *
 * @deprecated Use `printInvoice` from '@/lib/documents' instead.
 * This file is kept for backwards compatibility.
 *
 * Migration:
 * ```diff
 * - import { printInvoice } from '@/lib/utils/print-invoice';
 * + import { printInvoice } from '@/lib/documents';
 * ```
 */

// Re-export from centralized documents system
export { printInvoice, previewInvoice } from '@/lib/documents';
export type { PrintInvoiceOptions } from '@/lib/documents';

/**
 * @deprecated Legacy function signature - use the new interface with `facility` object instead
 */
export interface LegacyPrintInvoiceOptions {
  invoice: import('@/lib/types/billing').Invoice;
  facilityName?: string;
  facilityAddress?: string;
  facilityPhone?: string;
  facilityLicense?: string;
}
