/**
 * React hooks for clinical templates.
 * Provides data fetching and mutations for clinical assessment templates.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicalTemplatesApi } from '@/lib/api/clinical-templates';
import type {
  ClinicalTemplateListParams,
  ClinicalTemplateCreateData,
  TemplateType,
} from '@/lib/types/clinical-template';

/**
 * Hook for fetching paginated clinical templates.
 */
export function useClinicalTemplates(params?: ClinicalTemplateListParams) {
  return useQuery({
    queryKey: ['clinical-templates', params],
    queryFn: () => clinicalTemplatesApi.list(params),
  });
}

/**
 * Hook for fetching a single clinical template.
 */
export function useClinicalTemplate(id: number) {
  return useQuery({
    queryKey: ['clinical-templates', id],
    queryFn: () => clinicalTemplatesApi.get(id),
    enabled: !!id,
  });
}

/**
 * Hook for searching clinical templates.
 */
export function useClinicalTemplateSearch(query: string, templateType?: TemplateType) {
  return useQuery({
    queryKey: ['clinical-templates', 'search', query, templateType],
    queryFn: () => clinicalTemplatesApi.search(query, templateType),
    enabled: query.length >= 2,
  });
}

/**
 * Hook for fetching templates by specialty.
 */
export function useClinicalTemplatesBySpecialty(specialty: string) {
  return useQuery({
    queryKey: ['clinical-templates', 'specialty', specialty],
    queryFn: () => clinicalTemplatesApi.getBySpecialty(specialty),
    enabled: !!specialty,
  });
}

/**
 * Hook for fetching suggested templates based on encounter context.
 */
export function useSuggestedTemplates(params: {
  encounter_type?: string;
  chief_complaint?: string;
}) {
  return useQuery({
    queryKey: ['clinical-templates', 'suggested', params],
    queryFn: () => clinicalTemplatesApi.getSuggested(params),
    enabled: !!(params.encounter_type || params.chief_complaint),
  });
}

/**
 * Hook for fetching active assessment templates.
 * Useful for template selection in encounter forms.
 */
export function useActiveAssessmentTemplates() {
  return useQuery({
    queryKey: ['clinical-templates', 'active', 'assessment'],
    queryFn: () =>
      clinicalTemplatesApi.list({
        template_type: 'assessment',
        is_active: true,
        page_size: 100,
      }),
  });
}

/**
 * Hook for creating a clinical template.
 */
export function useCreateClinicalTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ClinicalTemplateCreateData) =>
      clinicalTemplatesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical-templates'] });
    },
  });
}

/**
 * Hook for updating a clinical template.
 */
export function useUpdateClinicalTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<ClinicalTemplateCreateData>;
    }) => clinicalTemplatesApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['clinical-templates'] });
      queryClient.invalidateQueries({ queryKey: ['clinical-templates', id] });
    },
  });
}

/**
 * Hook for deleting a clinical template.
 */
export function useDeleteClinicalTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => clinicalTemplatesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical-templates'] });
    },
  });
}

/**
 * Hook for recording template usage.
 */
export function useRecordTemplateUsage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => clinicalTemplatesApi.recordUsage(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['clinical-templates', id] });
    },
  });
}
