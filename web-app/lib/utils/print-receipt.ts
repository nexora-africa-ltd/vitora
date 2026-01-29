/**
 * Print Receipt Utility
 *
 * @deprecated Use `printReceipt` from '@/lib/documents' instead.
 * This file is kept for backwards compatibility.
 *
 * Migration:
 * ```diff
 * - import { printReceipt } from '@/lib/utils/print-receipt';
 * + import { printReceipt } from '@/lib/documents';
 * ```
 */

// Re-export from centralized documents system
export { printReceipt, previewReceipt } from '@/lib/documents';
export type { PrintReceiptOptions } from '@/lib/documents';

/**
 * @deprecated Legacy function signature - use the new interface with `facility` object instead
 */
export interface LegacyPrintReceiptOptions {
  receipt: import('@/lib/types/billing').Receipt;
  facilityName?: string;
  facilityAddress?: string;
  facilityPhone?: string;
}
