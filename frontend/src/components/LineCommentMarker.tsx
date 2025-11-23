import { MessageSquare } from "lucide-react";

interface LineCommentMarkerProps {
  lineNumber: number;
  commentCount: number;
  onClick: () => void;
  hasActiveComments?: boolean;
}

export const LineCommentMarker = ({
  lineNumber,
  commentCount,
  onClick,
  hasActiveComments = false,
}: LineCommentMarkerProps) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
        hasActiveComments
          ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-[#27272a]"
      }`}
      title={`${commentCount} comment${commentCount !== 1 ? "s" : ""}`}
    >
      {commentCount > 0 ? (
        <div className="flex items-center gap-0.5">
          <MessageSquare size={12} />
          <span className="text-[10px] font-medium">{commentCount}</span>
        </div>
      ) : (
        <span className="text-xs font-mono">{lineNumber}</span>
      )}
    </button>
  );
};
