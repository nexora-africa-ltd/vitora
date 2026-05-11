/**
 * Zod schemas for Security module — Audit Integrity & Digital Signatures.
 *
 * DHA Compliance: Gaps #31, #32 (Sprint 3.C — Security Hardening)
 */
import { z } from 'zod';

// =============================================================================
// AUDIT CHAIN INTEGRITY SCHEMAS
// =============================================================================

export const AuditChainStatusSchema = z.object({
  total_entries: z.number(),
  chain_length: z.number(),
  last_verified_at: z.string().nullable(),
  last_verification_valid: z.boolean().nullable(),
  tamper_alerts_count: z.number(),
  entries_with_hashes: z.number(),
  entries_without_hashes: z.number(),
});

export const AuditIntegrityResultSchema = z.object({
  valid: z.boolean(),
  entries_checked: z.number(),
  first_mismatch_seq: z.number().nullable(),
  details: z.string(),
  checked_at: z.string(),
});

// =============================================================================
// CERTIFICATE AUTHORITY SCHEMAS
// =============================================================================

export const CertificateAuthoritySchema = z.object({
  id: z.number(),
  name: z.string(),
  serial_number: z.string(),
  subject_dn: z.string(),
  valid_from: z.string(),
  valid_to: z.string(),
  is_root: z.boolean(),
  parent_ca: z.number().nullable(),
  is_active: z.boolean(),
  is_expired: z.boolean(),
  key_size: z.number(),
  ca_type: z.enum(['root', 'intermediate']),
  created_at: z.string(),
});

export const CertificateAuthorityArraySchema = z.array(CertificateAuthoritySchema);

// =============================================================================
// USER CERTIFICATE SCHEMAS
// =============================================================================

export const UserCertificateSchema = z.object({
  id: z.number(),
  user: z.number(),
  username: z.string(),
  user_name: z.string(),
  certificate_authority: z.number(),
  ca_name: z.string(),
  serial_number: z.string(),
  subject_dn: z.string(),
  valid_from: z.string(),
  valid_to: z.string(),
  is_revoked: z.boolean(),
  revoked_at: z.string().nullable(),
  revocation_reason: z.string(),
  is_expired: z.boolean(),
  is_valid: z.boolean(),
  created_at: z.string(),
});

export const UserCertificateArraySchema = z.array(UserCertificateSchema);

export const PaginatedUserCertificateSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(UserCertificateSchema),
});

// =============================================================================
// CERTIFICATE REVOCATION SCHEMAS
// =============================================================================

export const CertificateRevocationSchema = z.object({
  id: z.number(),
  certificate: z.number(),
  certificate_serial: z.string(),
  revoked_at: z.string(),
  reason: z.string(),
  reason_display: z.string(),
  revoked_by: z.number(),
  revoked_by_username: z.string(),
});

// =============================================================================
// DOCUMENT SIGNATURE SCHEMAS
// =============================================================================

export const DocumentSignatureSchema = z.object({
  id: z.number(),
  document_type: z.string(),
  document_id: z.number(),
  signer: z.number(),
  signer_username: z.string(),
  signer_name: z.string().optional(),
  signer_full_name: z.string(),
  certificate: z.number(),
  certificate_serial: z.string(),
  content_hash: z.string(),
  hash_algorithm: z.string(),
  signed_at: z.string(),
  is_valid: z.boolean(),
  verification_note: z.string(),
  created_at: z.string(),
});

export const DocumentSignatureArraySchema = z.array(DocumentSignatureSchema);

export const PaginatedDocumentSignatureSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(DocumentSignatureSchema),
});

export const SignatureVerificationResultSchema = z.object({
  valid: z.boolean(),
  certificate_valid: z.boolean(),
  content_match: z.boolean(),
  signature_match: z.boolean(),
  signer: z.string(),
  signed_at: z.string(),
  details: z.string(),
});
