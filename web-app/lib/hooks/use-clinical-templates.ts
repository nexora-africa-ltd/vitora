/**
 * React hooks for clinical templates.
 * Dual-mode: PowerSync (local SQLite) with React Query API fallback.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicalTemplatesApi } from '@/lib/api/clinical-templates';
import { useOfflineQuery } from '@/lib/powersync/use-offline-query';
import { transformClinicalTemplateRow } from '@/lib/powersync/transforms';
import type { ClinicalTemplateRow } from '@/lib/powersync/schema';
import type {
  ClinicalTemplateListParams,
  ClinicalTemplateCreateData,
  ClinicalTemplate,
  TemplateType,
} from '@/lib/types/clinical-template';
import type { PaginatedResponse } from '@/lib/types';

type TemplateLocalRow = ClinicalTemplateRow & { id: string };

/**
 * Hook for fetching paginated clinical templates.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useClinicalTemplates(params?: ClinicalTemplateListParams) {
  const conditions: string[] = [];
  const sqlParams: (string | number)[] = [];

  if (params?.template_type) {
    conditions.push('template_type = ?');
    sqlParams.push(params.template_type);
  }
  if (params?.specialty) {
    conditions.push('specialty = ?');
    sqlParams.push(params.specialty);
  }
  if (params?.is_active !== undefined) {
    conditions.push('is_active = ?');
    sqlParams.push(params.is_active ? 1 : 0);
  }
  if (params?.is_system !== undefined) {
    conditions.push('is_system = ?');
    sqlParams.push(params.is_system ? 1 : 0);
  }
  if (params?.search) {
    conditions.push('(name LIKE ? OR description LIKE ?)');
    const pattern = `%${params.search}%`;
    sqlParams.push(pattern, pattern);
  }

  const limit = params?.page_size || 25;
  const offset = ((params?.page || 1) - 1) * limit;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return useOfflineQuery<TemplateLocalRow, PaginatedResponse<ClinicalTemplate>>({
    sql: `SELECT * FROM clinical_templates_clinicaltemplate
      ${whereClause}
      ORDER BY name
      LIMIT ? OFFSET ?`,
    params: [...sqlParams, limit, offset],
    transform: (rows) => ({
      count: rows.length < limit ? offset + rows.length : offset + limit + 1,
      next: null,
      previous: null,
      results: rows.map(r => transformClinicalTemplateRow(r) as unknown as ClinicalTemplate),
    }),
    queryKey: ['clinical-templates', params],
    queryFn: () => clinicalTemplatesApi.list(params),
  });
}

/**
 * Hook for fetching a single clinical template.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useClinicalTemplate(id: number) {
  return useOfflineQuery<TemplateLocalRow, ClinicalTemplate>({
    sql: 'SELECT * FROM clinical_templates_clinicaltemplate WHERE id = ?',
    params: [String(id)],
    transform: (rows) => {
      if (rows.length === 0) throw new Error(`Clinical template ${id} not found`);
      return transformClinicalTemplateRow(rows[0]!) as unknown as ClinicalTemplate;
    },
    queryKey: ['clinical-templates', id],
    queryFn: () => clinicalTemplatesApi.get(id),
    forceApi: !id,
  });
}

/**
 * Hook for searching clinical templates.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useClinicalTemplateSearch(query: string, templateType?: TemplateType) {
  const conditions: string[] = ['is_active = 1'];
  const sqlParams: (string | number)[] = [];

  if (query) {
    conditions.push('(name LIKE ? OR description LIKE ?)');
    const pattern = `%${query}%`;
    sqlParams.push(pattern, pattern);
  }
  if (templateType) {
    conditions.push('template_type = ?');
    sqlParams.push(templateType);
  }

  return useOfflineQuery<TemplateLocalRow, ClinicalTemplate[]>({
    sql: `SELECT * FROM clinical_templates_clinicaltemplate
      WHERE ${conditions.join(' AND ')}
      ORDER BY usage_count DESC, name
      LIMIT 20`,
    params: sqlParams,
    transform: (rows) => rows.map(r => transformClinicalTemplateRow(r) as unknown as ClinicalTemplate),
    queryKey: ['clinical-templates', 'search', query, templateType],
    queryFn: () => clinicalTemplatesApi.search(query, templateType),
    forceApi: query.length < 2,
  });
}

/**
 * Hook for fetching templates by specialty.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useClinicalTemplatesBySpecialty(specialty: string) {
  return useOfflineQuery<TemplateLocalRow, ClinicalTemplate[]>({
    sql: `SELECT * FROM clinical_templates_clinicaltemplate
      WHERE is_active = 1 AND specialty = ?
      ORDER BY usage_count DESC, name`,
    params: [specialty],
    transform: (rows) => rows.map(r => transformClinicalTemplateRow(r) as unknown as ClinicalTemplate),
    queryKey: ['clinical-templates', 'specialty', specialty],
    queryFn: () => clinicalTemplatesApi.getBySpecialty(specialty),
    forceApi: !specialty,
  });
}

/**
 * Hook for fetching suggested templates based on encounter context.
 * Remains API-only — suggestion logic is server-side.
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
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useActiveAssessmentTemplates() {
  return useOfflineQuery<TemplateLocalRow, PaginatedResponse<ClinicalTemplate>>({
    sql: `SELECT * FROM clinical_templates_clinicaltemplate
      WHERE is_active = 1 AND template_type = 'assessment'
      ORDER BY usage_count DESC, name
      LIMIT 100`,
    params: [],
    transform: (rows) => ({
      count: rows.length,
      next: null,
      previous: null,
      results: rows.map(r => transformClinicalTemplateRow(r) as unknown as ClinicalTemplate),
    }),
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
