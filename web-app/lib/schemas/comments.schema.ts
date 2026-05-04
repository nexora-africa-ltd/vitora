/**
 * Zod schemas for Clinical Comments API responses.
 */

import { z } from 'zod';

export const CommentAuthorSchema = z.object({
  id: z.number(),
  username: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  full_name: z.string(),
});

export const CommentReactionSchema = z.object({
  emoji: z.string(),
  count: z.number(),
  user_ids: z.array(z.number()),
});

export const ClinicalCommentSchema = z.object({
  id: z.number(),
  parent: z.number().nullable(),
  author: CommentAuthorSchema,
  body: z.string(),
  display_body: z.string(),
  mentions: z.array(z.string()),
  is_edited: z.boolean(),
  is_deleted: z.boolean(),
  created_at: z.string(),
  edited_at: z.string().nullable(),
  replies_count: z.number(),
  reactions: z.array(CommentReactionSchema),
});

export const PaginatedCommentsSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ClinicalCommentSchema),
});

export const MentionSuggestionSchema = z.object({
  id: z.number(),
  username: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  full_name: z.string(),
});

export const ReactionToggleResponseSchema = z.object({
  comment_id: z.number(),
  reactions: z.array(CommentReactionSchema),
  user_reactions: z.array(z.string()),
});
