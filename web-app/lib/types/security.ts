/**
 * Security module types — Audit Integrity & Digital Signatures (PKI).
 *
 * DHA Compliance: Gaps #31, #32 (Sprint 3.C — Security Hardening)
 */

// =============================================================================
// AUDIT CHAIN INTEGRITY
// =============================================================================

export interface AuditChainStatus {
  total_entries: number;
  chain_length: number;
  last_verified_at: string | null;
  last_verification_valid: boolean | null;
  tamper_alerts_count: number;
  entries_with_hashes: number;
  entries_without_hashes: number;
}

export interface AuditIntegrityResult {
  valid: boolean;
  entries_checked: number;
  first_mismatch_seq: number | null;
  details: string;
  checked_at: string;
}

// =============================================================================
// CERTIFICATE AUTHORITY
// =============================================================================

export interface CertificateAuthority {
  id: number;
  name: string;
  serial_number: string;
  subject_dn: string;
  valid_from: string;
  valid_to: string;
  is_root: boolean;
  parent_ca: number | null;
  is_active: boolean;
  is_expired: boolean;
  key_size: number;
  ca_type: 'root' | 'intermediate';
  created_at: string;
}

// =============================================================================
// USER CERTIFICATE
// =============================================================================

export interface UserCertificate {
  id: number;
  user: number;
  username: string;
  user_name: string;
  certificate_authority: number;
  ca_name: string;
  serial_number: string;
  subject_dn: string;
  valid_from: string;
  valid_to: string;
  is_revoked: boolean;
  revoked_at: string | null;
  revocation_reason: string;
  is_expired: boolean;
  is_valid: boolean;
  created_at: string;
}

export interface IssueCertificateData {
  user_id: number;
  validity_years?: number;
}

export interface RevokeCertificateData {
  reason: string;
}

export interface CreateIntermediateCAData {
  name: string;
  org?: string;
  country?: string;
  key_size?: number;
  validity_years?: number;
  parent_ca_id?: number;
}

// =============================================================================
// CERTIFICATE REVOCATION
// =============================================================================

export interface CertificateRevocation {
  id: number;
  certificate: number;
  certificate_serial: string;
  revoked_at: string;
  reason: string;
  reason_display: string;
  revoked_by: number;
  revoked_by_username: string;
}

// =============================================================================
// DOCUMENT SIGNATURE
// =============================================================================

export interface DocumentSignature {
  id: number;
  document_type: string;
  document_id: number;
  signer: number;
  signer_username: string;
  signer_full_name: string;
  certificate: number;
  certificate_serial: string;
  content_hash: string;
  signature: string;
  hash_algorithm: string;
  signed_at: string;
  is_valid: boolean;
  verification_note: string;
  created_at: string;
}

export interface SignDocumentData {
  document_type: string;
  document_id: number;
}

export interface VerifySignatureData {
  signature_id: number;
}

export interface SignatureVerificationResult {
  valid: boolean;
  certificate_valid: boolean;
  content_match: boolean;
  signature_match: boolean;
  signer: string;
  signed_at: string;
  details: string;
}
