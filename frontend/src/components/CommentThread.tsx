import { useState } from "react";
import { Edit2, Trash2, Reply } from "lucide-react";
import type { Comment } from "../types";
import { CommentInput } from "./CommentInput";

interface CommentThreadProps {
  comment: Comment;
  onReply: (body: string) => void | Promise<void>;
  onEdit: (commentId: number, body: string) => void | Promise<void>;
  onDelete: (commentId: number) => void | Promise<void>;
  isSubmitting?: boolean;
  currentUser?: string;
}

export const CommentThread = ({
  comment,
  onReply,
  onEdit,
  onDelete,
  isSubmitting = false,
  currentUser,
}: CommentThreadProps) => {
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // If currentUser is not provided, assume we can edit/delete for demo purposes
  // or if it matches
  const isOwnComment = currentUser
    ? comment.author.login === currentUser
    : true;

  const handleReply = async (body: string) => {
    await onReply(body);
    setIsReplying(false);
  };

  const handleEdit = async (body: string) => {
    await onEdit(comment.id, body);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this comment?")) {
      setIsDeleting(true);
      await onDelete(comment.id);
      setIsDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-[#18181b] border border-[#27272a] rounded-lg font-sans">
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <img
              src={comment.author.avatar_url}
              alt={comment.author.login}
              className="w-6 h-6 rounded-full flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-200 truncate">
                  {comment.author.login}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {formatDate(comment.createdAt)}
                </span>
                {comment.updatedAt !== comment.createdAt && (
                  <span className="text-[10px] text-zinc-600">(edited)</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {isEditing ? (
          <CommentInput
            onSubmit={handleEdit}
            onCancel={() => setIsEditing(false)}
            initialValue={comment.body}
            isSubmitting={isSubmitting}
          />
        ) : (
          <div className="text-sm text-zinc-300 whitespace-pre-wrap break-words">
            {comment.body}
          </div>
        )}

        {!isEditing && (
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setIsReplying(!isReplying)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Reply size={12} />
              Reply
            </button>
            {isOwnComment && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <Edit2 size={12} />
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-rose-400 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              </>
            )}
          </div>
        )}

        {isReplying && (
          <div className="pt-2">
            <CommentInput
              onSubmit={handleReply}
              onCancel={() => setIsReplying(false)}
              placeholder="Write a reply..."
              isSubmitting={isSubmitting}
            />
          </div>
        )}
      </div>

      {comment.replies.length > 0 && (
        <div className="border-t border-[#27272a] pl-4 space-y-2">
          {comment.replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              isSubmitting={isSubmitting}
              currentUser={currentUser}
            />
          ))}
        </div>
      )}
    </div>
  );
};
