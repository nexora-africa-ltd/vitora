/**
 * React hooks for ECG Interpreter features.
 *
 * Provides mutation hooks for interpretation, comparison, upload,
 * risk scores, and report generation.
 */

'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import { ecgApi } from '@/lib/api/ecg';
import type {
  CHA2DS2VAScRequest,
  ECGCompareRequest,
  ECGInterpretRequest,
  HASBLEDRequest,
  ECGReportRequest,
} from '@/lib/types/ecg';

/**
 * Hook for interpreting ECG findings.
 * Accepts structured parameters or free-text findings.
 */
export function useECGInterpret() {
  return useMutation({
    mutationFn: (data: ECGInterpretRequest) => ecgApi.interpret(data),
    mutationKey: ['ecg', 'interpret'],
  });
}

/**
 * Hook for comparing two ECGs (serial change detection).
 */
export function useECGCompare() {
  return useMutation({
    mutationFn: (data: ECGCompareRequest) => ecgApi.compare(data),
    mutationKey: ['ecg', 'compare'],
  });
}

/**
 * Hook for uploading an ECG file (image or machine format).
 */
export function useECGUpload() {
  return useMutation({
    mutationFn: (file: File) => ecgApi.upload(file),
    mutationKey: ['ecg', 'upload'],
  });
}

/**
 * Hook for generating a PDF report from ECG interpretation.
 * Triggers browser download on success.
 */
export function useECGReport() {
  return useMutation({
    mutationFn: async (data: ECGReportRequest) => {
      const blob = await ecgApi.generateReport(data);
      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ecg_report.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return blob;
    },
    mutationKey: ['ecg', 'report'],
  });
}

/**
 * Hook for calculating CHA₂DS₂-VASc stroke risk score.
 */
export function useCHA2DS2VASc() {
  return useMutation({
    mutationFn: (data: CHA2DS2VAScRequest) => ecgApi.scoreCHA2DS2VASc(data),
    mutationKey: ['ecg', 'scores', 'cha2ds2-vasc'],
  });
}

/**
 * Hook for calculating HAS-BLED bleeding risk score.
 */
export function useHASBLED() {
  return useMutation({
    mutationFn: (data: HASBLEDRequest) => ecgApi.scoreHASBLED(data),
    mutationKey: ['ecg', 'scores', 'has-bled'],
  });
}

/**
 * Hook for fetching the ECG pattern catalog (reference data).
 * Cached indefinitely since patterns rarely change.
 */
export function useECGPatterns() {
  return useQuery({
    queryKey: ['ecg', 'patterns'],
    queryFn: () => ecgApi.getPatterns(),
    staleTime: Infinity,
  });
}
