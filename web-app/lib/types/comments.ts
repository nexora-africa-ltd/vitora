/**
 * TypeScript interfaces for Clinical Comments.
 */

export type CommentableEntity = 'encounter' | 'lab-order' | 'prescription';

export interface CommentAuthor {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
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
