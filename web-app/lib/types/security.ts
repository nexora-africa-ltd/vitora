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
  organization: number | null;
  organization_name: string;
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
  organization: number | null;
  organization_name: string;
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
  organization_id?: number;
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
  signer_name?: string;
  signer_full_name: string;
  certificate: number;
  certificate_serial: string;
  content_hash: string;
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

export type DocumentSharePermission = 'VIEW' | 'SIGN';

export interface DocumentShare {
  id: number;
  document_type: string;
  document_id: number;
  shared_by: number;
  shared_by_name: string;
  shared_with: number;
  shared_with_name: string;
  permission: DocumentSharePermission;
  note: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDocumentShareData {
  document_type: string;
  document_id: number;
  shared_with: number;
  permission?: DocumentSharePermission;
  note?: string;
  expires_at?: string | null;
}

export interface DocumentHubItem {
  document_type: string;
  document_id: number;
  document_number: string;
  title: string;
  patient_name: string;
  status: string;
  owner_name: string;
  is_signed: boolean;
  signed_at: string | null;
  can_sign: boolean;
  is_shared_with_me: boolean;
  share_permission: DocumentSharePermission | null;
  shared_by_name: string | null;
  shared_at: string | null;
}
