/**
 * React hooks for inpatient (Admissions/IPD) data fetching and mutations.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inpatientApi } from '@/lib/api/inpatient';
import type {
  Admission,
  AdmissionListParams,
  AdmissionRecommendation,
  AdmissionRecommendationListParams,
  Bed,
  BedListParams,
  Discharge,
  DischargeCreateData,
  DischargeListParams,
  InpatientWard,
  KardexHandoverNoteCreateData,
  KardexListParams,
  KardexShiftNoteCreateData,
  KardexUpdateData,
  NursingKardex,
  ShiftHandover,
  ShiftHandoverCreateData,
  ShiftHandoverListParams,
  Transfer,
  TransferCreateData,
  TransferListParams,
  WardRound,
  WardRoundCreateData,
  WardRoundListParams,
} from '@/lib/types/inpatient';

// ============================================================================
// Query Keys
// ============================================================================

export const inpatientQueryKeys = {
  all: ['inpatient'] as const,
  wards: () => [...inpatientQueryKeys.all, 'wards'] as const,
  ward: (id: number) => [...inpatientQueryKeys.wards(), id] as const,
  wardBeds: (wardId: number, params?: Record<string, unknown>) => 
    [...inpatientQueryKeys.ward(wardId), 'beds', params] as const,
  beds: (params?: BedListParams) => [...inpatientQueryKeys.all, 'beds', params] as const,
  recommendations: (params?: AdmissionRecommendationListParams) => 
    [...inpatientQueryKeys.all, 'admission-recommendations', params] as const,
  admissions: (params?: AdmissionListParams) => 
    [...inpatientQueryKeys.all, 'admissions', params] as const,
  admission: (id: number) => [...inpatientQueryKeys.all, 'admissions', id] as const,
  discharges: (params?: DischargeListParams) => 
    [...inpatientQueryKeys.all, 'discharges', params] as const,
  discharge: (id: number) => [...inpatientQueryKeys.all, 'discharges', id] as const,
  transfers: (params?: TransferListParams) => 
    [...inpatientQueryKeys.all, 'transfers', params] as const,
  transfer: (id: number) => [...inpatientQueryKeys.all, 'transfers', id] as const,
  wardRounds: (params?: WardRoundListParams) => 
    [...inpatientQueryKeys.all, 'ward-rounds', params] as const,
  wardRound: (id: number) => [...inpatientQueryKeys.all, 'ward-rounds', id] as const,
  kardex: (params?: KardexListParams) => 
    [...inpatientQueryKeys.all, 'kardex', params] as const,
  kardexById: (id: number) => [...inpatientQueryKeys.all, 'kardex', id] as const,
  kardexByAdmission: (admissionId: number) => 
    [...inpatientQueryKeys.all, 'kardex', 'admission', admissionId] as const,
  shiftHandovers: (params?: ShiftHandoverListParams) => 
    [...inpatientQueryKeys.all, 'shift-handovers', params] as const,
  shiftHandover: (id: number) => [...inpatientQueryKeys.all, 'shift-handovers', id] as const,
};

// ============================================================================
// Ward Hooks
// ============================================================================

export function useInpatientWards() {
  return useQuery({
    queryKey: inpatientQueryKeys.wards(),
    queryFn: () => inpatientApi.listWards(),
  });
}

export function useInpatientWard(wardId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.ward(wardId!),
    queryFn: () => inpatientApi.getWard(wardId!),
    enabled: typeof wardId === 'number',
  });
}

export function useUpdateWard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InpatientWard> }) => 
      inpatientApi.updateWard(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.ward(id) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.wards() });
    },
  });
}

export function useWardBeds(
  wardId: number | undefined,
  params?: Omit<BedListParams, 'ward'> & { page?: number; page_size?: number }
) {
  return useQuery({
    queryKey: inpatientQueryKeys.wardBeds(wardId!, params),
    enabled: typeof wardId === 'number',
    queryFn: () => inpatientApi.listWardBeds(wardId as number, params),
  });
}

// ============================================================================
// Bed Hooks
// ============================================================================

export function useBeds(params?: BedListParams) {
  return useQuery({
    queryKey: inpatientQueryKeys.beds(params),
    queryFn: () => inpatientApi.listBeds(params),
  });
}

export function useUpdateBed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Bed> }) => inpatientApi.updateBed(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.all });
    },
  });
}

// ============================================================================
// Admission Recommendation Hooks
// ============================================================================

export function useAdmissionRecommendations(params?: AdmissionRecommendationListParams) {
  return useQuery({
    queryKey: inpatientQueryKeys.recommendations(params),
    queryFn: () => inpatientApi.listAdmissionRecommendations(params),
  });
}

export function useCreateAdmissionRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AdmissionRecommendation>) => inpatientApi.createAdmissionRecommendation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.recommendations() });
    },
  });
}

export function useAcceptAdmissionRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: number; userId: number }) =>
      inpatientApi.acceptAdmissionRecommendation(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.recommendations() });
    },
  });
}

export function useDeclineAdmissionRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId, reason }: { id: number; userId: number; reason: string }) =>
      inpatientApi.declineAdmissionRecommendation(id, userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.recommendations() });
    },
  });
}

// ============================================================================
// Admission Hooks
// ============================================================================

export function useAdmissions(params?: AdmissionListParams) {
  return useQuery({
    queryKey: inpatientQueryKeys.admissions(params),
    queryFn: () => inpatientApi.listAdmissions(params),
  });
}

export function useAdmission(admissionId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.admission(admissionId!),
    enabled: typeof admissionId === 'number',
    queryFn: () => inpatientApi.getAdmission(admissionId as number),
  });
}

export function useCreateAdmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Admission>) => inpatientApi.createAdmission(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.all });
    },
  });
}

export function useUpdateAdmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Admission> }) => inpatientApi.updateAdmission(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admission(variables.id) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admissions() });
    },
  });
}

// ============================================================================
// Discharge Hooks
// ============================================================================

export function useDischarges(params?: DischargeListParams) {
  return useQuery({
    queryKey: inpatientQueryKeys.discharges(params),
    queryFn: () => inpatientApi.listDischarges(params),
  });
}

export function useDischarge(dischargeId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.discharge(dischargeId!),
    enabled: typeof dischargeId === 'number',
    queryFn: () => inpatientApi.getDischarge(dischargeId!),
  });
}

export function useCreateDischarge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DischargeCreateData) => inpatientApi.createDischarge(data),
    onSuccess: (discharge) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.discharges() });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admission(discharge.admission) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admissions() });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.beds() });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.wards() });
    },
  });
}

export function useUpdateDischarge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DischargeCreateData> }) => 
      inpatientApi.updateDischarge(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.discharge(variables.id) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.discharges() });
    },
  });
}

// ============================================================================
// Transfer Hooks
// ============================================================================

export function useTransfers(params?: TransferListParams) {
  return useQuery({
    queryKey: inpatientQueryKeys.transfers(params),
    queryFn: () => inpatientApi.listTransfers(params),
  });
}

export function useTransfer(transferId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.transfer(transferId!),
    enabled: typeof transferId === 'number',
    queryFn: () => inpatientApi.getTransfer(transferId!),
  });
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TransferCreateData) => inpatientApi.createTransfer(data),
    onSuccess: (transfer) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.transfers() });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admission(transfer.admission) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admissions() });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.beds() });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.wards() });
    },
  });
}

// ============================================================================
// Ward Round Hooks
// ============================================================================

export function useWardRounds(params?: WardRoundListParams) {
  return useQuery({
    queryKey: inpatientQueryKeys.wardRounds(params),
    queryFn: () => inpatientApi.listWardRounds(params),
  });
}

export function useWardRound(wardRoundId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.wardRound(wardRoundId!),
    enabled: typeof wardRoundId === 'number',
    queryFn: () => inpatientApi.getWardRound(wardRoundId!),
  });
}

export function useAdmissionWardRounds(admissionId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.wardRounds({ admission: admissionId }),
    enabled: typeof admissionId === 'number',
    queryFn: () => inpatientApi.listWardRounds({ admission: admissionId }),
  });
}

export function useCreateWardRound() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: WardRoundCreateData) => inpatientApi.createWardRound(data),
    onSuccess: (wardRound) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.wardRounds() });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.wardRounds({ admission: wardRound.admission }) });
    },
  });
}

export function useUpdateWardRound() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<WardRoundCreateData> }) => 
      inpatientApi.updateWardRound(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.wardRound(variables.id) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.wardRounds() });
    },
  });
}

// ============================================================================
// Nursing Kardex Hooks
// ============================================================================

export function useKardexList(params?: KardexListParams) {
  return useQuery({
    queryKey: inpatientQueryKeys.kardex(params),
    queryFn: () => inpatientApi.listKardex(params),
  });
}

export function useKardex(kardexId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.kardexById(kardexId!),
    enabled: typeof kardexId === 'number',
    queryFn: () => inpatientApi.getKardex(kardexId!),
  });
}

export function useKardexByAdmission(admissionId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.kardexByAdmission(admissionId!),
    enabled: typeof admissionId === 'number',
    queryFn: () => inpatientApi.getKardexByAdmission(admissionId!),
  });
}

export function useUpdateKardex() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: KardexUpdateData }) => 
      inpatientApi.updateKardex(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.kardexById(variables.id) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.kardex() });
    },
  });
}

export function useAddKardexShiftNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kardexId, data }: { kardexId: number; data: KardexShiftNoteCreateData }) => 
      inpatientApi.addKardexShiftNote(kardexId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.kardexById(variables.kardexId) });
    },
  });
}

export function useAddKardexHandoverNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kardexId, data }: { kardexId: number; data: KardexHandoverNoteCreateData }) => 
      inpatientApi.addKardexHandoverNote(kardexId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.kardexById(variables.kardexId) });
    },
  });
}

// ============================================================================
// Shift Handover Hooks
// ============================================================================

export function useShiftHandovers(params?: ShiftHandoverListParams) {
  return useQuery({
    queryKey: inpatientQueryKeys.shiftHandovers(params),
    queryFn: () => inpatientApi.listShiftHandovers(params),
  });
}

export function useShiftHandover(handoverId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.shiftHandover(handoverId!),
    enabled: typeof handoverId === 'number',
    queryFn: () => inpatientApi.getShiftHandover(handoverId!),
  });
}

export function useCreateShiftHandover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ShiftHandoverCreateData) => inpatientApi.createShiftHandover(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.shiftHandovers() });
    },
  });
}

export function useAcknowledgeShiftHandover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (handoverId: number) => inpatientApi.acknowledgeShiftHandover(handoverId),
    onSuccess: (_data, handoverId) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.shiftHandover(handoverId) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.shiftHandovers() });
    },
  });
}

export function useAutoPopulateShiftHandover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (handoverId: number) => inpatientApi.autoPopulateShiftHandover(handoverId),
    onSuccess: (_data, handoverId) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.shiftHandover(handoverId) });
    },
  });
}
