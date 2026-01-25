/**
 * Zod schemas for Billing API response validation
 *
 * TODO: Implement full schemas matching lib/types/billing.ts
 * See lib/schemas/clinic.schema.ts for implementation example.
 */
import { z } from 'zod';

// =============================================================================
// PLACEHOLDER SCHEMAS - TO BE IMPLEMENTED
// =============================================================================

// Invoice schemas
export const InvoiceSchema = z.object({}).passthrough();
export const InvoiceItemSchema = z.object({}).passthrough();

// Payment schemas
export const PaymentSchema = z.object({}).passthrough();

// Service schemas
export const ServiceSchema = z.object({}).passthrough();
export const ServiceCategorySchema = z.object({}).passthrough();

// Insurance schemas
export const InsuranceClaimSchema = z.object({}).passthrough();

// Paginated responses
export const PaginatedInvoiceSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(InvoiceSchema),
});

export const PaginatedPaymentSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(PaymentSchema),
});

export const PaginatedServiceSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ServiceSchema),
});

// Array responses
export const InvoiceItemArrayResponseSchema = z.object({
  results: z.array(InvoiceItemSchema),
});
