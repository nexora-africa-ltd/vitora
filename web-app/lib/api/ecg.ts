/**
 * ECG Interpreter API client.
 *
 * All TibaBot ECG calls are proxied through the Django backend.
 * The frontend never calls TibaBot directly.
 */

import { apiClient } from '@/lib/api/client';
import {
  CHA2DS2VAScResponseSchema,
  ECGCompareResponseSchema,
  ECGInterpretResponseSchema,
  ECGPatternsResponseSchema,
  ECGUploadResponseSchema,
  HASBLEDResponseSchema,
} from '@/lib/schemas/ecg.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type {
  CHA2DS2VAScRequest,
  CHA2DS2VAScResponse,
  ECGCompareRequest,
  ECGCompareResponse,
  ECGInterpretRequest,
  ECGInterpretResponse,
  ECGPattern,
  ECGUploadResponse,
  HASBLEDRequest,
  HASBLEDResponse,
  ECGReportRequest,
} from '@/lib/types/ecg';

export const ecgApi = {
  /**
   * Interpret ECG findings (structured parameters or free-text).
   * Returns structured interpretation with urgency, differentials, and actions.
   */
  interpret: async (data: ECGInterpretRequest): Promise<ECGInterpretResponse> => {
    const response = await apiClient.post('/api/ai/ecg/interpret/', data);
    return parseResponse(ECGInterpretResponseSchema, response.data, {
      context: 'ecgApi.interpret',
    }) as unknown as ECGInterpretResponse;
  },

  /**
   * Compare two ECGs for serial change detection.
   * Identifies interval changes, new findings, and clinical progression.
   */
  compare: async (data: ECGCompareRequest): Promise<ECGCompareResponse> => {
    const response = await apiClient.post('/api/ai/ecg/compare/', data);
    return parseResponse(ECGCompareResponseSchema, response.data, {
      context: 'ecgApi.compare',
    });
  },

  /**
   * Upload an ECG image or machine format file for auto-interpretation.
   * Supports JPEG, PNG, TIFF, BMP, DICOM, GE MUSE XML, HL7 aECG, SCP-ECG.
   * Max file size: 10 MB.
   */
  upload: async (file: File): Promise<ECGUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/api/ai/ecg/upload/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000, // 2 min for image processing
    });
    return parseResponse(ECGUploadResponseSchema, response.data, {
      context: 'ecgApi.upload',
    }) as unknown as ECGUploadResponse;
  },

  /**
   * Generate a downloadable PDF report from ECG interpretation results.
   * Returns a Blob that can be used to trigger a file download.
   */
  generateReport: async (data: ECGReportRequest): Promise<Blob> => {
    const response = await apiClient.post('/api/ai/ecg/report/', data, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  /**
   * Calculate CHA₂DS₂-VASc stroke risk score for AF patients.
   * Used to determine anticoagulation indication.
   */
  scoreCHA2DS2VASc: async (data: CHA2DS2VAScRequest): Promise<CHA2DS2VAScResponse> => {
    const response = await apiClient.post('/api/ai/ecg/scores/cha2ds2-vasc/', data);
    return parseResponse(CHA2DS2VAScResponseSchema, response.data, {
      context: 'ecgApi.scoreCHA2DS2VASc',
    });
  },

  /**
   * Calculate HAS-BLED bleeding risk score.
   * Used alongside CHA₂DS₂-VASc for anticoagulation risk-benefit assessment.
   */
  scoreHASBLED: async (data: HASBLEDRequest): Promise<HASBLEDResponse> => {
    const response = await apiClient.post('/api/ai/ecg/scores/has-bled/', data);
    return parseResponse(HASBLEDResponseSchema, response.data, {
      context: 'ecgApi.scoreHASBLED',
    });
  },

  /**
   * List all supported ECG patterns/diagnoses.
   * Public endpoint (no auth required on TibaBot side, proxied through Django).
   */
  getPatterns: async (): Promise<ECGPattern[]> => {
    const response = await apiClient.get('/api/ai/ecg/patterns/');
    return parseResponse(ECGPatternsResponseSchema, response.data, {
      context: 'ecgApi.getPatterns',
    });
  },
};
