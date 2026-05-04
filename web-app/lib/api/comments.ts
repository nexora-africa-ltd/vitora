/**
 * API client for Clinical Comments.
 *
 * Supports comments nested under encounters, lab orders, and prescriptions.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  ClinicalCommentSchema,
  MentionSuggestionSchema,
  PaginatedCommentsSchema,
  ReactionToggleResponseSchema,
} from '@/lib/schemas/comments.schema';
import type {
  ClinicalComment,
  ClinicalCommentCreate,
  CommentableEntity,
  MentionSuggestion,
  PaginatedComments,
  ReactionToggleResponse,
} from '@/lib/types/comments';

/**
 * Build the base URL for comments based on entity type and ID.
 */
function getBaseUrl(entityType: CommentableEntity, entityId: number | string): string {
  switch (entityType) {
    case 'encounter':
      return `/api/encounters/${entityId}/comments/`;
    case 'lab-order':
      return `/api/lab/orders/${entityId}/comments/`;
    case 'prescription':
      return `/api/pharmacy/prescriptions/${entityId}/comments/`;
    case 'admission':
      return `/api/admissions/${entityId}/comments/`;
  }
}

export interface CommentListParams {
  parent?: number | 'all' | null;
  page?: number;
}

export const commentsApi = {
  /**
   * List comments for a given entity.
   * Default returns top-level comments; pass parent=id for replies.
   */
  list: async (
    entityType: CommentableEntity,
    entityId: number | string,
    params?: CommentListParams
  ): Promise<PaginatedComments> => {
    const url = getBaseUrl(entityType, entityId);
    const response = await apiClient.get<PaginatedComments>(url, { params });
    return parseResponse(PaginatedCommentsSchema, response.data, {
      context: `commentsApi.list(${entityType}, ${entityId})`,
    });
  },

  /**
   * Create a new comment on an entity.
   */
  create: async (
    entityType: CommentableEntity,
    entityId: number | string,
    data: ClinicalCommentCreate
  ): Promise<ClinicalComment> => {
    const url = getBaseUrl(entityType, entityId);
    const response = await apiClient.post<ClinicalComment>(url, data);
    return parseResponse(ClinicalCommentSchema, response.data, {
      context: `commentsApi.create(${entityType}, ${entityId})`,
    });
  },

  /**
   * Update a comment (body only). Only the author can edit.
   */
  update: async (
    entityType: CommentableEntity,
    entityId: number | string,
    commentId: number,
    body: string
  ): Promise<ClinicalComment> => {
    const url = `${getBaseUrl(entityType, entityId)}${commentId}/`;
    const response = await apiClient.patch<ClinicalComment>(url, { body });
    return parseResponse(ClinicalCommentSchema, response.data, {
      context: `commentsApi.update(${entityType}, ${entityId}, ${commentId})`,
    });
  },

  /**
   * Soft-delete a comment. Only author or admin can delete.
   */
  delete: async (
    entityType: CommentableEntity,
    entityId: number | string,
    commentId: number
  ): Promise<void> => {
    const url = `${getBaseUrl(entityType, entityId)}${commentId}/`;
    await apiClient.delete(url);
  },

  /**
   * Toggle a reaction (emoji) on a comment.
   * If the reaction exists, it is removed; otherwise it is added.
   */
  react: async (
    entityType: CommentableEntity,
    entityId: number | string,
    commentId: number,
    emoji: string
  ): Promise<ReactionToggleResponse> => {
    const url = `${getBaseUrl(entityType, entityId)}${commentId}/react/`;
    const response = await apiClient.post<ReactionToggleResponse>(url, { emoji });
    return parseResponse(ReactionToggleResponseSchema, response.data, {
      context: `commentsApi.react(${entityType}, ${entityId}, ${commentId})`,
    });
  },

  /**
   * Search for mentionable users (org-scoped).
   */
  mentionSearch: async (query: string): Promise<MentionSuggestion[]> => {
    const response = await apiClient.get<MentionSuggestion[]>('/api/comments/mentions/', {
      params: { q: query },
    });
    const { z } = await import('zod');
    return parseResponse(z.array(MentionSuggestionSchema), response.data, {
      context: `commentsApi.mentionSearch(${query})`,
    });
  },
};
