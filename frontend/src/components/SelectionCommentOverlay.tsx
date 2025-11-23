import { MessageSquare } from "lucide-react";
import type { Comment } from "../types";

interface SelectionCommentOverlayProps {
  comments: Comment[];
  onAddComment: () => void;
  onShowComments: () => void;
}

export const SelectionCommentOverlay = ({
  comments,
  onAddComment,
  onShowComments,
}: SelectionCommentOverlayProps) => {
  if (comments.length === 0) {
    return (
      <button
        onClick={onAddComment}
        className="absolute z-10 bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs flex items-center gap-1 shadow-lg transition-colors"
      >
        <MessageSquare size={12} />
        Add comment
      </button>
    );
  }

  return (
    <button
      onClick={onShowComments}
      className="absolute z-10 bg-blue-500/20 border border-blue-500/50 text-blue-400 px-2 py-1 rounded text-xs flex items-center gap-1 hover:bg-blue-500/30 transition-colors"
    >
      <MessageSquare size={12} />
      {comments.length} comment{comments.length !== 1 ? "s" : ""}
    </button>
  );
};
