'use client';

/**
 * CommentItem — renders a single comment with author info, timestamp,
 * reply button, edit/delete controls (if author), and nested replies.
 */

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MessageSquare, Pencil, Trash2, CornerDownRight } from 'lucide-react';
import type { ClinicalComment } from '@/lib/types/comments';
import { CommentInput } from './comment-input';

interface CommentItemProps {
  comment: ClinicalComment;
  currentUserId?: number;
  isAdmin?: boolean;
  depth?: number;
  onReply: (parentId: number, body: string) => Promise<void>;
  onEdit: (commentId: number, body: string) => Promise<void>;
  onDelete: (commentId: number) => Promise<void>;
  onLoadReplies?: (parentId: number) => void;
}

export function CommentItem({
  comment,
  currentUserId,
  isAdmin = false,
  depth = 0,
  onReply,
  onEdit,
  onDelete,
  onLoadReplies,
}: CommentItemProps) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);

  const isAuthor = currentUserId === comment.author.id;
  const canModify = isAuthor && !comment.is_deleted;
  const canDelete = (isAuthor || isAdmin) && !comment.is_deleted;
  const maxIndent = Math.min(depth, 3); // Cap visual indent at 3 levels

  const initials = comment.author.full_name
    ? comment.author.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : comment.author.username.slice(0, 2).toUpperCase();

  const handleReply = async (body: string) => {
    await onReply(comment.id, body);
    setShowReplyInput(false);
  };

  const handleEdit = async () => {
    if (editBody.trim() && editBody.trim() !== comment.body) {
      await onEdit(comment.id, editBody.trim());
    }
    setIsEditing(false);
  };

  return (
    <div className={`flex gap-2 ${maxIndent > 0 ? 'ml-6 sm:ml-8' : ''}`}>
      {maxIndent > 0 && (
        <CornerDownRight className="h-3 w-3 text-muted-foreground mt-3 shrink-0" />
      )}
      <div className="flex-1 space-y-1">
        <div className="flex items-start gap-2">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">
                {comment.author.full_name || comment.author.username}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
              </span>
              {comment.is_edited && (
                <span className="text-xs text-muted-foreground">(edited)</span>
              )}
            </div>

            {isEditing ? (
              <div className="mt-1 space-y-2">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full text-sm border rounded p-2 min-h-[50px] resize-none bg-background"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleEdit}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <p className={`text-sm mt-0.5 ${comment.is_deleted ? 'italic text-muted-foreground' : ''}`}>
                {comment.display_body}
              </p>
            )}

            {/* Action buttons */}
            {!comment.is_deleted && !isEditing && (
              <div className="flex items-center gap-1 mt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowReplyInput(!showReplyInput)}
                >
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Reply
                </Button>
                {canModify && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditBody(comment.body);
                      setIsEditing(true);
                    }}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(comment.id)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                )}
                {comment.replies_count > 0 && onLoadReplies && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground"
                    onClick={() => onLoadReplies(comment.id)}
                  >
                    {comment.replies_count} {comment.replies_count === 1 ? 'reply' : 'replies'}
                  </Button>
                )}
              </div>
            )}

            {/* Reply input */}
            {showReplyInput && (
              <div className="mt-2">
                <CommentInput
                  onSubmit={handleReply}
                  placeholder="Write a reply..."
                  autoFocus
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
