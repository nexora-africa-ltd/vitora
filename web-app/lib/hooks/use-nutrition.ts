/**
 * Nutrition React Hooks
 * Sprint Allied Health - Nutrition data fetching and mutations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nutritionApi } from '@/lib/api/nutrition';
import type {
  NutritionConsultationListParams,
  NutritionConsultationCreateData,
  NutritionConsultationUpdateData,
  DietPlanListParams,
  DietPlanCreateData,
} from '@/lib/types/nutrition';

// ============ Query Key Factory ============

export const nutritionKeys = {
  all: ['nutrition'] as const,
  // Consultations
  consultations: () => [...nutritionKeys.all, 'consultations'] as const,
  consultationList: (params?: NutritionConsultationListParams) =>
    [...nutritionKeys.consultations(), 'list', params] as const,
  consultation: (id: number) => [...nutritionKeys.consultations(), 'detail', id] as const,
  consultationByNumber: (orderNumber: string) =>
    [...nutritionKeys.consultations(), 'by-number', orderNumber] as const,
  // Diet Plans
  dietPlans: () => [...nutritionKeys.all, 'diet-plans'] as const,
  dietPlanList: (params?: DietPlanListParams) =>
    [...nutritionKeys.dietPlans(), 'list', params] as const,
  dietPlan: (id: number) => [...nutritionKeys.dietPlans(), 'detail', id] as const,
  consultationDietPlans: (consultationId: number) =>
    [...nutritionKeys.dietPlans(), 'consultation', consultationId] as const,
};

// ============ Consultation Hooks ============

export function useNutritionConsultations(params?: NutritionConsultationListParams) {
  return useQuery({
    queryKey: nutritionKeys.consultationList(params),
    queryFn: () => nutritionApi.listConsultations(params),
  });
}

export function useNutritionConsultation(id: number | undefined) {
  return useQuery({
    queryKey: nutritionKeys.consultation(id!),
    queryFn: () => nutritionApi.getConsultation(id!),
    enabled: !!id,
  });
}

export function useNutritionConsultationByNumber(orderNumber: string | undefined) {
  return useQuery({
    queryKey: nutritionKeys.consultationByNumber(orderNumber!),
    queryFn: () => nutritionApi.getConsultationByNumber(orderNumber!),
    enabled: !!orderNumber,
  });
}

export function useCreateNutritionConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NutritionConsultationCreateData) => nutritionApi.createConsultation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.consultations() });
    },
  });
}

export function useUpdateNutritionConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: NutritionConsultationUpdateData }) =>
      nutritionApi.updateConsultation(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.consultation(id) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.consultations() });
    },
  });
}

export function useDeleteNutritionConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => nutritionApi.deleteConsultation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.consultations() });
    },
  });
}

// Consultation Actions
export function useApproveNutritionConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => nutritionApi.approveConsultation(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.consultation(id) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.consultations() });
    },
  });
}

export function useAssignDietitian() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dietitianId }: { id: number; dietitianId: number }) =>
      nutritionApi.assignDietitian(id, dietitianId),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.consultation(id) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.consultations() });
    },
  });
}

export function useSyncAnthropometrics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => nutritionApi.syncAnthropometrics(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.consultation(id) });
    },
  });
}

export function useCompleteNutritionConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => nutritionApi.completeConsultation(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.consultation(id) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.consultations() });
    },
  });
}

export function useCancelNutritionConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      nutritionApi.cancelConsultation(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.consultation(id) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.consultations() });
    },
  });
}

// ============ Diet Plan Hooks ============

export function useDietPlans(params?: DietPlanListParams) {
  return useQuery({
    queryKey: nutritionKeys.dietPlanList(params),
    queryFn: () => nutritionApi.listDietPlans(params),
  });
}

export function useDietPlan(id: number | undefined) {
  return useQuery({
    queryKey: nutritionKeys.dietPlan(id!),
    queryFn: () => nutritionApi.getDietPlan(id!),
    enabled: !!id,
  });
}

export function useConsultationDietPlans(consultationId: number | undefined) {
  return useQuery({
    queryKey: nutritionKeys.consultationDietPlans(consultationId!),
    queryFn: () => nutritionApi.getConsultationDietPlans(consultationId!),
    enabled: !!consultationId,
  });
}

export function useCreateDietPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DietPlanCreateData) => nutritionApi.createDietPlan(data),
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.dietPlans() });
      queryClient.invalidateQueries({
        queryKey: nutritionKeys.consultationDietPlans(data.consultation_id),
      });
    },
  });
}

export function useUpdateDietPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DietPlanCreateData> }) =>
      nutritionApi.updateDietPlan(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.dietPlan(id) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.dietPlans() });
    },
  });
}

export function useDeleteDietPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => nutritionApi.deleteDietPlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.dietPlans() });
    },
  });
}

// Diet Plan Actions
export function useActivateDietPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => nutritionApi.activateDietPlan(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.dietPlan(id) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.dietPlans() });
    },
  });
}

export function useDiscontinueDietPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      nutritionApi.discontinueDietPlan(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.dietPlan(id) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.dietPlans() });
    },
  });
}

export function usePutDietPlanOnHold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      nutritionApi.putDietPlanOnHold(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.dietPlan(id) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.dietPlans() });
    },
  });
}

export function useCompleteDietPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => nutritionApi.completeDietPlan(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: nutritionKeys.dietPlan(id) });
      queryClient.invalidateQueries({ queryKey: nutritionKeys.dietPlans() });
    },
  });
}
