'use client';

import { useQuery } from '@tanstack/react-query';
import { commentsApi } from '@/lib/api/comments';
import type { CommentableEntity } from '@/lib/types/comments';

/**
 * Hook to fetch comment count for an entity.
 * Returns 0 while loading or if no comments exist.
 */
export function useCommentCount(entityType: CommentableEntity, entityId: number | string | undefined) {
  const { data: count = 0 } = useQuery({
    queryKey: ['comment-count', entityType, entityId],
    queryFn: () => commentsApi.count(entityType, entityId!),
    enabled: !!entityId,
    staleTime: 30_000,
  });

  return count;
}
