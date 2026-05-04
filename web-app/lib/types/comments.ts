/**
 * TypeScript interfaces for Clinical Comments.
 */

export type CommentableEntity = 'encounter' | 'lab-order' | 'prescription' | 'admission';

export interface CommentAuthor {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
}

export interface CommentReaction {
  emoji: string;
  count: number;
  user_ids: number[];
}

export interface ClinicalComment {
  id: number;
  parent: number | null;
  author: CommentAuthor;
  body: string;
  display_body: string;
  mentions: string[];
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  edited_at: string | null;
  replies_count: number;
  reactions: CommentReaction[];
}

export interface ClinicalCommentCreate {
  body: string;
  parent?: number | null;
}

export interface PaginatedComments {
  count: number;
  next: string | null;
  previous: string | null;
  results: ClinicalComment[];
}

export interface MentionSuggestion {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
}

export interface ReactionToggleResponse {
  comment_id: number;
  reactions: CommentReaction[];
  user_reactions: string[];
}
