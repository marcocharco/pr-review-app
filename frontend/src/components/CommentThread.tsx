import { useState, useRef, useEffect } from "react";
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

// Helper to flatten the comment tree
const flattenComments = (comment: Comment): Comment[] => {
  let acc: Comment[] = [comment];
  if (comment.replies && comment.replies.length > 0) {
    comment.replies.forEach((reply) => {
      acc = [...acc, ...flattenComments(reply)];
    });
  }
  return acc;
};

const CommentItem = ({
  comment,
  onEdit,
  onDelete,
  onReplyClick,
  isSubmitting,
  currentUser,
}: {
  comment: Comment;
  onEdit: (commentId: number, body: string) => void | Promise<void>;
  onDelete: (commentId: number) => void | Promise<void>;
  onReplyClick: () => void;
  isSubmitting: boolean;
  currentUser?: string;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isOwnComment = currentUser
    ? comment.user.login === currentUser
    : true;

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
    if (!dateString) return "Invalid Date";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid Date";
    
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
    <div className="p-3 space-y-2 group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <img
            src={comment.user.avatar_url}
            alt={comment.user.login}
            className="w-6 h-6 rounded-full flex-shrink-0 bg-zinc-800"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-200 truncate">
                {comment.user.login}
              </span>
              <span className="text-[10px] text-zinc-500">
                {formatDate(comment.created_at)}
              </span>
              {comment.updated_at !== comment.created_at && (
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
        <div className="text-sm text-zinc-300 whitespace-pre-wrap break-words pl-8">
          {comment.body}
        </div>
      )}

      {!isEditing && (
        <div className="flex items-center gap-3 pt-1 pl-8 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onReplyClick}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Reply size={10} />
            Reply
          </button>
          {isOwnComment && (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Edit2 size={10} />
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-rose-400 transition-colors disabled:opacity-50"
              >
                <Trash2 size={10} />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const CommentThread = ({
  comment,
  onReply,
  onEdit,
  onDelete,
  isSubmitting = false,
  currentUser,
}: CommentThreadProps) => {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Flatten comments for display
  const threadComments = flattenComments(comment);

  // Focus input when showReplyInput becomes true
  useEffect(() => {
    if (showReplyInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showReplyInput]);

  const handleReplyClick = () => {
    setShowReplyInput(true);
  };

  const handleReplySubmit = async (body: string) => {
    await onReply(body);
    setShowReplyInput(false);
  };

  return (
    <div className="bg-[#18181b] border border-[#27272a] rounded-lg font-sans shadow-sm overflow-hidden">
      {threadComments.map((c, index) => (
        <div key={c.id} className={index > 0 ? "border-t border-[#27272a]" : ""}>
          <CommentItem
            comment={c}
            onEdit={onEdit}
            onDelete={onDelete}
            onReplyClick={handleReplyClick}
            isSubmitting={isSubmitting}
            currentUser={currentUser}
          />
        </div>
      ))}
      
      {/* Always show reply input area at bottom if replying or if it's just a quick reply UI */}
      {/* User asked for "input box for 'replies' shouldn't be nested either" and referenced screenshot */}
      {/* The screenshot shows a persistent-looking input box. Or maybe it appears on click. */}
      {/* Let's keep it hidden until "Reply" is clicked, but once clicked it shows at bottom. */}
      
      {showReplyInput && (
        <div className="border-t border-[#27272a] p-3 bg-[#18181b]">
           <CommentInput
              onSubmit={handleReplySubmit}
              onCancel={() => setShowReplyInput(false)}
              placeholder="Write a reply..."
              isSubmitting={isSubmitting}
              autoFocus
            />
        </div>
      )}
    </div>
  );
};
