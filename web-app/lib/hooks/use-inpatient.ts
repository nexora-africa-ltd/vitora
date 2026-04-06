/**
 * React hooks for inpatient (Admissions/IPD) data fetching and mutations.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inpatientApi } from '@/lib/api/inpatient';
import type {
  Admission,
  AdmissionCreateInput,
  AdmissionListParams,
  AdmissionRecommendation,
  AdmissionRecommendationListParams,
  Bed,
  BedListParams,
  BloodTransfusion,
  BloodTransfusionCreateData,
  BPMonitoringReading,
  BPMonitoringReadingCreateData,
  Discharge,
  DischargeCreateData,
  DischargeListParams,
  FluidBalanceEntry,
  FluidBalanceEntryCreateData,
  FluidBalanceSheet,
  FluidBalanceSheetCreateData,
  FluidBalanceSheetUpdateData,
  InpatientWard,
  InpatientConsumableUsageCreateData,
  KardexHandoverNoteCreateData,
  KardexListParams,
  KardexShiftNoteCreateData,
  KardexUpdateData,
  InpatientConsumableUsageReverseData,
  InpatientConsumableUsage,
  NursingKardex,
  NursingCarePlanEntry,
  NursingCarePlanEntryCreateData,
  NursingCarePlanEntryUpdateData,
  ReviewRequest,
  ReviewRequestCreateData,
  ReviewRequestListParams,
  ShiftHandover,
  ShiftHandoverCreateData,
  ShiftHandoverListParams,
  SmartRecommendBedRequest,
  TemperatureReading,
  TemperatureReadingCreateData,
  Transfer,
  TransferCreateData,
  TransferListParams,
  TransfusionObservationEntryCreateData,
  SetExpectedDischargeRequest,
  BedOverrideRequest,
  WardRound,
  WardRoundCreateData,
  WardRoundListParams,
  AdverseTransfusionReactionCreate,
  ATRLabInvestigation,
  ATRSubmitToPPB,
  ATRAcknowledge,
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
  wardBedUtilization: (wardId: number) =>
    [...inpatientQueryKeys.ward(wardId), 'bed-utilization'] as const,
  wardPredictedDischarges: (wardId: number, hoursAhead?: number) =>
    [...inpatientQueryKeys.ward(wardId), 'predicted-discharges', hoursAhead ?? 24] as const,
  beds: (params?: BedListParams) => [...inpatientQueryKeys.all, 'beds', params] as const,
  recommendations: (params?: AdmissionRecommendationListParams) =>
    [...inpatientQueryKeys.all, 'admission-recommendations', params] as const,
  recommendation: (id: number) =>
    [...inpatientQueryKeys.all, 'admission-recommendations', id] as const,
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
  reviewRequests: (params?: ReviewRequestListParams) =>
    [...inpatientQueryKeys.all, 'review-requests', params] as const,
  reviewRequest: (id: number) => [...inpatientQueryKeys.all, 'review-requests', id] as const,
  kardex: (params?: KardexListParams) =>
    [...inpatientQueryKeys.all, 'kardex', params] as const,
  kardexById: (id: number) => [...inpatientQueryKeys.all, 'kardex', id] as const,
  kardexByAdmission: (admissionId: number) =>
    [...inpatientQueryKeys.all, 'kardex', 'admission', admissionId] as const,
  admissionClearanceStatus: (admissionId: number) =>
    [...inpatientQueryKeys.admission(admissionId), 'clearance-status'] as const,
  admissionConsumableUsage: (admissionId: number) =>
    [...inpatientQueryKeys.admission(admissionId), 'consumable-usage'] as const,
  shiftHandovers: (params?: ShiftHandoverListParams) =>
    [...inpatientQueryKeys.all, 'shift-handovers', params] as const,
  shiftHandover: (id: number) => [...inpatientQueryKeys.all, 'shift-handovers', id] as const,
  temperatureReadings: (admissionId: number) =>
    [...inpatientQueryKeys.all, 'temperature-readings', admissionId] as const,
  fluidBalanceSheets: (params?: { admission?: number; chart_date?: string; page?: number; page_size?: number }) =>
    [...inpatientQueryKeys.all, 'fluid-balance-sheets', params] as const,
  fluidBalanceSheet: (id: number) => [...inpatientQueryKeys.all, 'fluid-balance-sheets', id] as const,
  fluidBalanceEntries: (params?: { fluid_balance_sheet?: number; entry_type?: string; page?: number; page_size?: number }) =>
    [...inpatientQueryKeys.all, 'fluid-balance-entries', params] as const,
  bloodTransfusions: (admissionId: number) =>
    [...inpatientQueryKeys.all, 'blood-transfusions', admissionId] as const,
  bloodTransfusion: (id: number) =>
    [...inpatientQueryKeys.all, 'blood-transfusions', 'detail', id] as const,
  bpReadings: (admissionId: number) =>
    [...inpatientQueryKeys.all, 'bp-readings', admissionId] as const,
  atrReports: (params?: { transfusion__admission?: number; status?: string }) =>
    [...inpatientQueryKeys.all, 'atr-reports', params] as const,
  atrReport: (id: number) =>
    [...inpatientQueryKeys.all, 'atr-reports', 'detail', id] as const,
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

export function useCreateWard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof inpatientApi.createWard>[0]) =>
      inpatientApi.createWard(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.wards() });
    },
  });
}

/**
 * Generate missing beds for a ward based on its capacity.
 * Creates bed records up to the ward's capacity if fewer beds currently exist.
 */
export function useGenerateWardBeds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (wardId: number) => inpatientApi.generateWardBeds(wardId),
    onSuccess: (_, wardId) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.ward(wardId) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.wardBeds(wardId) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.beds() });
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
    enabled: params !== undefined,
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

export function useMarkBedCleaning() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bedId, notes }: { bedId: number; notes?: string }) =>
      inpatientApi.markBedCleaning(bedId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.all });
    },
  });
}

export function useMarkBedAvailable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bedId: number) => inpatientApi.markBedAvailable(bedId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.all });
    },
  });
}

export function useBedUtilization(wardId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.wardBedUtilization(wardId!),
    queryFn: () => inpatientApi.getBedUtilization(wardId!),
    enabled: typeof wardId === 'number',
  });
}

export function usePredictedDischarges(wardId: number | undefined, hoursAhead = 24) {
  return useQuery({
    queryKey: inpatientQueryKeys.wardPredictedDischarges(wardId!, hoursAhead),
    queryFn: () => inpatientApi.getPredictedDischarges(wardId!, hoursAhead),
    enabled: typeof wardId === 'number',
  });
}

export function useRecommendBed() {
  return useMutation({
    mutationFn: ({
      wardId,
      data,
    }: {
      wardId: number;
      data: {
        patient_id: number;
        requires_isolation?: boolean;
        requires_oxygen?: boolean;
        requires_ventilator?: boolean;
      };
    }) => inpatientApi.recommendBed(wardId, data),
  });
}

export function useSmartRecommendBed() {
  return useMutation({
    mutationFn: ({ wardId, data }: { wardId: number; data: SmartRecommendBedRequest }) =>
      inpatientApi.smartRecommendBed(wardId, data),
  });
}

/**
 * Check if a patient is compatible with a specific ward.
 * Returns a mutation that can be called imperatively.
 */
export function useCheckWardCompatibility() {
  return useMutation({
    mutationFn: ({
      wardId,
      patientId,
      requiresIsolation,
      requiresOxygen,
      requiresVentilator,
    }: {
      wardId: number;
      patientId: number;
      requiresIsolation?: boolean;
      requiresOxygen?: boolean;
      requiresVentilator?: boolean;
    }) => inpatientApi.checkWardCompatibility(wardId, patientId, requiresIsolation, requiresOxygen, requiresVentilator),
  });
}

/**
 * Bulk check compatibility for multiple patients across all wards.
 * Useful for emergency mass-casualty scenarios.
 */
export function useBulkCompatibilityCheck() {
  return useMutation({
    mutationFn: ({
      patientIds,
      requiresIsolation,
    }: {
      patientIds: number[];
      requiresIsolation?: boolean[];
    }) => inpatientApi.bulkCheckCompatibility(patientIds, requiresIsolation),
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

export function useAdmissionRecommendation(id: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.recommendation(id!),
    queryFn: () => inpatientApi.getAdmissionRecommendation(id!),
    enabled: !!id,
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
    mutationFn: (data: AdmissionCreateInput) => inpatientApi.createAdmission(data),
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

export function useOverrideBed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ admissionId, data }: { admissionId: number; data: BedOverrideRequest }) =>
      inpatientApi.overrideBed(admissionId, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admission(result.admission.id) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admissions() });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.wards() });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.beds() });
      queryClient.invalidateQueries({
        queryKey: inpatientQueryKeys.ward(result.admission.ward),
      });
      queryClient.invalidateQueries({
        queryKey: inpatientQueryKeys.wardBeds(result.admission.ward),
      });
      queryClient.invalidateQueries({
        queryKey: inpatientQueryKeys.wardBedUtilization(result.admission.ward),
      });
    },
  });
}

export function useSetExpectedDischarge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      admissionId,
      data,
    }: {
      admissionId: number;
      data: SetExpectedDischargeRequest;
    }) => inpatientApi.setExpectedDischarge(admissionId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admission(variables.admissionId) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admissions() });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.wards() });
    },
  });
}

// ============================================================================
// Discharge Hooks
// ============================================================================

export function useClearanceStatus(admissionId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.admissionClearanceStatus(admissionId!),
    queryFn: () => inpatientApi.getClearanceStatus(admissionId!),
    enabled: typeof admissionId === 'number' && admissionId > 0,
    refetchInterval: 30_000,
  });
}

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

export function useDischargeByAdmission(admissionId: number | undefined) {
  return useQuery({
    queryKey: [...inpatientQueryKeys.discharges(), 'by-admission', admissionId],
    enabled: typeof admissionId === 'number',
    queryFn: async () => {
      const result = await inpatientApi.listDischarges({ admission: admissionId!, page_size: 1 });
      return result.results[0] ?? null;
    },
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
// Review Request Hooks
// ============================================================================

export function useReviewRequests(params?: ReviewRequestListParams) {
  return useQuery({
    queryKey: inpatientQueryKeys.reviewRequests(params),
    queryFn: () => inpatientApi.listReviewRequests(params),
  });
}

export function useReviewRequest(requestId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.reviewRequest(requestId!),
    enabled: typeof requestId === 'number',
    queryFn: () => inpatientApi.getReviewRequest(requestId!),
  });
}

export function useAdmissionReviewRequests(admissionId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.reviewRequests({ admission: admissionId }),
    enabled: typeof admissionId === 'number',
    queryFn: () => inpatientApi.listReviewRequests({ admission: admissionId }),
  });
}

export function usePendingReviewRequests() {
  return useQuery({
    queryKey: inpatientQueryKeys.reviewRequests({ status: 'PENDING' }),
    queryFn: () => inpatientApi.listReviewRequests({ status: 'PENDING' }),
  });
}

export function useCreateReviewRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ReviewRequestCreateData) => inpatientApi.createReviewRequest(data),
    onSuccess: (reviewRequest) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.reviewRequests() });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.reviewRequests({ admission: reviewRequest.admission }) });
    },
  });
}

export function useAcknowledgeReviewRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: number) => inpatientApi.acknowledgeReviewRequest(requestId),
    onSuccess: (reviewRequest) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.reviewRequest(reviewRequest.id) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.reviewRequests() });
    },
  });
}

export function useCompleteReviewRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: number) => inpatientApi.completeReviewRequest(requestId),
    onSuccess: (reviewRequest) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.reviewRequest(reviewRequest.id) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.reviewRequests() });
    },
  });
}

export function useCancelReviewRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, reason }: { requestId: number; reason: string }) =>
      inpatientApi.cancelReviewRequest(requestId, reason),
    onSuccess: (reviewRequest) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.reviewRequest(reviewRequest.id) });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.reviewRequests() });
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

export function useAddCarePlanEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kardexId, data }: { kardexId: number; data: NursingCarePlanEntryCreateData }) =>
      inpatientApi.addCarePlanEntry(kardexId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.kardexById(variables.kardexId) });
    },
  });
}

export function useUpdateCarePlanEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kardexId, entryId, data }: { kardexId: number; entryId: number; data: NursingCarePlanEntryUpdateData }) =>
      inpatientApi.updateCarePlanEntry(kardexId, entryId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.kardexById(variables.kardexId) });
    },
  });
}

export function useResolveAllCarePlans() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kardexId, evaluation }: { kardexId: number; evaluation?: string }) =>
      inpatientApi.resolveAllCarePlans(kardexId, evaluation),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.kardexById(variables.kardexId) });
    },
  });
}

export function useDiscontinueCarePlanEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kardexId, entryId, reason }: { kardexId: number; entryId: number; reason: string }) =>
      inpatientApi.discontinueCarePlanEntry(kardexId, entryId, reason),
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

// ============================================================================
// Admission Orders Hooks
// ============================================================================

export function useAdmissionOrders(admissionId: number | undefined) {
  return useQuery({
    queryKey: [...inpatientQueryKeys.admission(admissionId!), 'orders'] as const,
    queryFn: () => inpatientApi.getAdmissionOrders(admissionId!),
    enabled: typeof admissionId === 'number',
  });
}

export function useAdmissionLabOrders(admissionId: number | undefined) {
  return useQuery({
    queryKey: [...inpatientQueryKeys.admission(admissionId!), 'lab-orders'] as const,
    queryFn: () => inpatientApi.getAdmissionLabOrders(admissionId!),
    enabled: typeof admissionId === 'number',
  });
}

export function useAdmissionImagingOrders(admissionId: number | undefined) {
  return useQuery({
    queryKey: [...inpatientQueryKeys.admission(admissionId!), 'imaging-orders'] as const,
    queryFn: () => inpatientApi.getAdmissionImagingOrders(admissionId!),
    enabled: typeof admissionId === 'number',
  });
}

export function useAdmissionPrescriptions(admissionId: number | undefined) {
  return useQuery({
    queryKey: [...inpatientQueryKeys.admission(admissionId!), 'prescriptions'] as const,
    queryFn: () => inpatientApi.getAdmissionPrescriptions(admissionId!),
    enabled: typeof admissionId === 'number',
  });
}

export function useAdmissionConsumableUsage(admissionId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.admissionConsumableUsage(admissionId!),
    queryFn: () => inpatientApi.getAdmissionConsumableUsage(admissionId!),
    enabled: typeof admissionId === 'number',
  });
}

export function useRecordAdmissionConsumableUsage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ admissionId, data }: { admissionId: number; data: InpatientConsumableUsageCreateData }) =>
      inpatientApi.recordAdmissionConsumableUsage(admissionId, data),
    onSuccess: (usage) => {
      queryClient.invalidateQueries({
        queryKey: inpatientQueryKeys.admissionConsumableUsage(usage.admission),
      });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admission(usage.admission) });
      queryClient.invalidateQueries({ queryKey: ['stock-batches'] });
    },
  });
}

export function useReverseAdmissionConsumableUsage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      admissionId,
      usageId,
      data,
    }: {
      admissionId: number;
      usageId: number;
      data: InpatientConsumableUsageReverseData;
    }) => inpatientApi.reverseAdmissionConsumableUsage(admissionId, usageId, data),
    onSuccess: (usage) => {
      queryClient.invalidateQueries({
        queryKey: inpatientQueryKeys.admissionConsumableUsage(usage.admission),
      });
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.admission(usage.admission) });
      queryClient.invalidateQueries({ queryKey: ['stock-batches'] });
    },
  });
}

// ============================================================================
// Temperature Chart Hooks
// ============================================================================

export function useTemperatureReadings(admissionId: number | undefined, pageSize = 100) {
  return useQuery({
    queryKey: inpatientQueryKeys.temperatureReadings(admissionId!),
    queryFn: () => inpatientApi.listTemperatureReadings({ admission: admissionId!, page_size: pageSize }),
    enabled: typeof admissionId === 'number',
  });
}

export function useCreateTemperatureReading() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TemperatureReadingCreateData) => inpatientApi.createTemperatureReading(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: inpatientQueryKeys.temperatureReadings(variables.admission),
      });
    },
  });
}

export function useFluidBalanceSheets(admissionId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.fluidBalanceSheets({ admission: admissionId!, page_size: 30 }),
    queryFn: () => inpatientApi.listFluidBalanceSheets({ admission: admissionId!, page_size: 30 }),
    enabled: typeof admissionId === 'number',
  });
}

export function useFluidBalanceEntries(sheetId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.fluidBalanceEntries({ fluid_balance_sheet: sheetId!, page_size: 200 }),
    queryFn: () => inpatientApi.listFluidBalanceEntries({ fluid_balance_sheet: sheetId!, page_size: 200 }),
    enabled: typeof sheetId === 'number',
  });
}

export function useCreateFluidBalanceSheet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: FluidBalanceSheetCreateData) => inpatientApi.createFluidBalanceSheet(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...inpatientQueryKeys.all, 'fluid-balance-sheets'],
      });
    },
  });
}

export function useUpdateFluidBalanceSheet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: FluidBalanceSheetUpdateData }) =>
      inpatientApi.updateFluidBalanceSheet(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: inpatientQueryKeys.fluidBalanceSheet(variables.id),
      });
      queryClient.invalidateQueries({
        queryKey: [...inpatientQueryKeys.all, 'fluid-balance-sheets'],
      });
    },
  });
}

export function useCreateFluidBalanceEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: FluidBalanceEntryCreateData) => inpatientApi.createFluidBalanceEntry(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: inpatientQueryKeys.fluidBalanceEntries({ fluid_balance_sheet: variables.fluid_balance_sheet, page_size: 200 }),
      });
      queryClient.invalidateQueries({
        queryKey: [...inpatientQueryKeys.all, 'fluid-balance-sheets'],
      });
    },
  });
}

// ============================================================================
// Blood Transfusion Hooks
// ============================================================================

export function useBloodTransfusions(admissionId: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.bloodTransfusions(admissionId!),
    queryFn: () => inpatientApi.listBloodTransfusions({ admission: admissionId! }),
    enabled: typeof admissionId === 'number',
  });
}

export function useBloodTransfusion(id: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.bloodTransfusion(id!),
    queryFn: () => inpatientApi.getBloodTransfusion(id!),
    enabled: typeof id === 'number',
  });
}

export function useCreateBloodTransfusion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BloodTransfusionCreateData) => inpatientApi.createBloodTransfusion(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: inpatientQueryKeys.bloodTransfusions(variables.admission),
      });
    },
  });
}

export function useAddTransfusionObservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { transfusionId: number; data: TransfusionObservationEntryCreateData }) =>
      inpatientApi.addTransfusionObservation(args.transfusionId, args.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.all });
    },
  });
}

export function useMarkTransfusionReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { transfusionId: number; data: { reaction_type: string; action_taken?: string } }) =>
      inpatientApi.markTransfusionReaction(args.transfusionId, args.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.all });
    },
  });
}

export function useCompleteTransfusion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { transfusionId: number; data?: { time_ended?: string } }) =>
      inpatientApi.completeTransfusion(args.transfusionId, args.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.all });
    },
  });
}

// ============================================================================
// BP Monitoring Hooks
// ============================================================================

export function useBPReadings(admissionId: number | undefined, pageSize = 100) {
  return useQuery({
    queryKey: inpatientQueryKeys.bpReadings(admissionId!),
    queryFn: () => inpatientApi.listBPReadings({ admission: admissionId!, page_size: pageSize }),
    enabled: typeof admissionId === 'number',
  });
}

export function useCreateBPReading() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BPMonitoringReadingCreateData) => inpatientApi.createBPReading(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: inpatientQueryKeys.bpReadings(variables.admission),
      });
    },
  });
}

/**
 * Smart ward recommendation — evaluate all wards for a patient.
 */
export function useRecommendWard() {
  return useMutation({
    mutationFn: (data: {
      patient_id: number;
      requires_isolation?: boolean;
      requires_oxygen?: boolean;
      requires_ventilator?: boolean;
      admission_type?: string;
    }) => inpatientApi.recommendWard(data),
  });
}

// ============================================================================
// Adverse Transfusion Reaction (ATR) Hooks
// ============================================================================

export function useATRReports(admissionId?: number) {
  return useQuery({
    queryKey: inpatientQueryKeys.atrReports({ transfusion__admission: admissionId }),
    queryFn: () => inpatientApi.listATRReports({ transfusion__admission: admissionId }),
    enabled: !!admissionId,
  });
}

export function useATRReport(id: number | undefined) {
  return useQuery({
    queryKey: inpatientQueryKeys.atrReport(id ?? 0),
    queryFn: () => inpatientApi.getATRReport(id!),
    enabled: !!id,
  });
}

export function useCreateATRReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AdverseTransfusionReactionCreate) => inpatientApi.createATRReport(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.all });
    },
  });
}

export function useUpdateATRLabInvestigation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ATRLabInvestigation }) =>
      inpatientApi.updateATRLabInvestigation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.all });
    },
  });
}

export function useSubmitATRToPPB() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ATRSubmitToPPB }) =>
      inpatientApi.submitATRToPPB(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.all });
    },
  });
}

export function useAcknowledgeATR() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ATRAcknowledge }) =>
      inpatientApi.acknowledgeATR(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inpatientQueryKeys.all });
    },
  });
}
