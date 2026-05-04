'use client';

/**
 * CommentThread — main container component for clinical comments.
 *
 * Fetches top-level comments, handles reply loading, and manages
 * create/edit/delete mutations. Integrates with React Query for caching.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { commentsApi } from '@/lib/api/comments';
import type { CommentableEntity, ClinicalComment } from '@/lib/types/comments';
import { CommentItem } from './comment-item';
import { CommentInput } from './comment-input';

interface CommentThreadProps {
  entityType: CommentableEntity;
  entityId: number | string;
  currentUserId?: number;
  isAdmin?: boolean;
}

export function CommentThread({
  entityType,
  entityId,
  currentUserId,
  isAdmin = false,
}: CommentThreadProps) {
  const queryClient = useQueryClient();
  const [expandedReplies, setExpandedReplies] = useState<Record<number, ClinicalComment[]>>({});

  const queryKey = ['comments', entityType, entityId];

  // Fetch top-level comments
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => commentsApi.list(entityType, entityId),
    enabled: !!entityId,
  });

  // Create comment mutation
  const createMutation = useMutation({
    mutationFn: (variables: { body: string; parent?: number | null }) =>
      commentsApi.create(entityType, entityId, variables),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Update comment mutation
  const updateMutation = useMutation({
    mutationFn: (variables: { commentId: number; body: string }) =>
      commentsApi.update(entityType, entityId, variables.commentId, variables.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Delete comment mutation
  const deleteMutation = useMutation({
    mutationFn: (commentId: number) => commentsApi.delete(entityType, entityId, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleCreate = useCallback(
    async (body: string) => {
      await createMutation.mutateAsync({ body });
    },
    [createMutation]
  );

  const handleReply = useCallback(
    async (parentId: number, body: string) => {
      await createMutation.mutateAsync({ body, parent: parentId });
      // Reload replies for that parent
      const repliesData = await commentsApi.list(entityType, entityId, { parent: parentId });
      setExpandedReplies((prev) => ({ ...prev, [parentId]: repliesData.results }));
    },
    [createMutation, entityType, entityId]
  );

  const handleEdit = useCallback(
    async (commentId: number, body: string) => {
      await updateMutation.mutateAsync({ commentId, body });
    },
    [updateMutation]
  );

  const handleDelete = useCallback(
    async (commentId: number) => {
      await deleteMutation.mutateAsync(commentId);
    },
    [deleteMutation]
  );

  const handleLoadReplies = useCallback(
    async (parentId: number) => {
      const repliesData = await commentsApi.list(entityType, entityId, { parent: parentId });
      setExpandedReplies((prev) => ({ ...prev, [parentId]: repliesData.results }));
    },
    [entityType, entityId]
  );

  const comments = data?.results ?? [];

  return (
    <div className="space-y-4">
      {/* Comment input */}
      <CommentInput onSubmit={handleCreate} disabled={createMutation.isPending} />

      {/* Loading state */}
      {isLoading && (
        <div className="text-sm text-muted-foreground py-4 text-center">
          Loading comments...
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="text-sm text-destructive py-2">
          Failed to load comments.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && comments.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
          <MessageSquare className="h-8 w-8" />
          <p className="text-sm">No comments yet. Start the conversation.</p>
        </div>
      )}

      {/* Comment list */}
      <div className="space-y-3">
        {comments.map((comment) => (
          <div key={comment.id}>
            <CommentItem
              comment={comment}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              depth={0}
              onReply={handleReply}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onLoadReplies={comment.replies_count > 0 ? handleLoadReplies : undefined}
            />
            {/* Expanded replies */}
            {expandedReplies[comment.id]?.map((reply) => (
              <div key={reply.id} className="mt-2">
                <CommentItem
                  comment={reply}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  depth={1}
                  onReply={handleReply}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onLoadReplies={reply.replies_count > 0 ? handleLoadReplies : undefined}
                />
                {/* Nested replies (depth 2) */}
                {expandedReplies[reply.id]?.map((nestedReply) => (
                  <div key={nestedReply.id} className="mt-2">
                    <CommentItem
                      comment={nestedReply}
                      currentUserId={currentUserId}
                      isAdmin={isAdmin}
                      depth={2}
                      onReply={handleReply}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onLoadReplies={
                        nestedReply.replies_count > 0 ? handleLoadReplies : undefined
                      }
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Pagination hint */}
      {data && data.count > comments.length && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {comments.length} of {data.count} comments
        </p>
      )}
    </div>
  );
}
