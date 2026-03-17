/**
 * Certificates & Signatures API client.
 *
 * Provides methods for PKI certificate management and document digital signing.
 * DHA Compliance: Gap #32 — Digital Signatures (Sprint 3.C)
 *
 * All responses are validated with Zod schemas.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  CertificateAuthoritySchema,
  CertificateAuthorityArraySchema,
  UserCertificateSchema,
  PaginatedUserCertificateSchema,
  DocumentSignatureSchema,
  DocumentSignatureArraySchema,
  PaginatedDocumentSignatureSchema,
  SignatureVerificationResultSchema,
} from '@/lib/schemas/security.schema';
import type {
  CertificateAuthority,
  UserCertificate,
  IssueCertificateData,
  RevokeCertificateData,
  CreateIntermediateCAData,
  DocumentSignature,
  SignDocumentData,
  SignatureVerificationResult,
} from '@/lib/types/security';
import type { PaginatedResponse } from '@/lib/types';

// =============================================================================
// CERTIFICATE ENDPOINTS
// =============================================================================

export const certificatesApi = {
  /**
   * List user certificates (admin sees all, regular users see own).
   */
  list: async (params?: Record<string, unknown>): Promise<PaginatedResponse<UserCertificate>> => {
    const response = await apiClient.get('/api/core/certificates/', { params });
    return parseResponse(PaginatedUserCertificateSchema, response.data, {
      context: 'certificatesApi.list',
    });
  },

  /**
   * Get a specific certificate by ID.
   */
  get: async (id: number): Promise<UserCertificate> => {
    const response = await apiClient.get<UserCertificate>(`/api/core/certificates/${id}/`);
    return parseResponse(UserCertificateSchema, response.data, {
      context: 'certificatesApi.get',
    });
  },

  /**
   * List active Certificate Authorities (public info).
   */
  listCAs: async (): Promise<CertificateAuthority[]> => {
    const response = await apiClient.get('/api/core/certificates/ca/');
    return parseResponse(CertificateAuthorityArraySchema, response.data, {
      context: 'certificatesApi.listCAs',
    });
  },

  /**
   * Issue a new certificate for a user (admin only).
   */
  issue: async (data: IssueCertificateData): Promise<UserCertificate> => {
    const response = await apiClient.post('/api/core/certificates/issue/', data);
    return parseResponse(UserCertificateSchema, response.data, {
      context: 'certificatesApi.issue',
    });
  },

  /**
   * Revoke a certificate (admin only).
   */
  revoke: async (id: number, data: RevokeCertificateData): Promise<UserCertificate> => {
    const response = await apiClient.post(`/api/core/certificates/${id}/revoke/`, data);
    return parseResponse(UserCertificateSchema, response.data, {
      context: 'certificatesApi.revoke',
    });
  },

  /**
   * Create an intermediate CA signed by the root CA (admin only).
   */
  createIntermediateCA: async (data: CreateIntermediateCAData): Promise<CertificateAuthority> => {
    const response = await apiClient.post('/api/core/certificates/create_intermediate/', data);
    return parseResponse(CertificateAuthoritySchema, response.data, {
      context: 'certificatesApi.createIntermediateCA',
    });
  },
};

// =============================================================================
// DOCUMENT SIGNATURE ENDPOINTS
// =============================================================================

export const signaturesApi = {
  /**
   * List all document signatures.
   */
  list: async (params?: Record<string, unknown>): Promise<PaginatedResponse<DocumentSignature>> => {
    const response = await apiClient.get('/api/core/signatures/', { params });
    return parseResponse(PaginatedDocumentSignatureSchema, response.data, {
      context: 'signaturesApi.list',
    });
  },

  /**
   * Sign a document.
   */
  sign: async (data: SignDocumentData): Promise<DocumentSignature> => {
    const response = await apiClient.post('/api/core/signatures/sign/', data);
    return parseResponse(DocumentSignatureSchema, response.data, {
      context: 'signaturesApi.sign',
    });
  },

  /**
   * Verify a signature.
   */
  verify: async (signatureId: number): Promise<SignatureVerificationResult> => {
    const response = await apiClient.post('/api/core/signatures/verify/', {
      signature_id: signatureId,
    });
    return parseResponse(SignatureVerificationResultSchema, response.data, {
      context: 'signaturesApi.verify',
    });
  },

  /**
   * Get all signatures for a specific document.
   */
  forDocument: async (type: string, id: number): Promise<DocumentSignature[]> => {
    const response = await apiClient.get('/api/core/signatures/for_document/', {
      params: { type, id },
    });
    return parseResponse(DocumentSignatureArraySchema, response.data, {
      context: 'signaturesApi.forDocument',
    });
  },
};
