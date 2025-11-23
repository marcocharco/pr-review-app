import { useState } from "react";

interface CommentInputProps {
  onSubmit: (body: string) => void | Promise<void>;
  onCancel: () => void;
  placeholder?: string;
  initialValue?: string;
  isSubmitting?: boolean;
  autoFocus?: boolean;
}

export const CommentInput = ({
  onSubmit,
  onCancel,
  placeholder = "Add a comment...",
  initialValue = "",
  isSubmitting = false,
  autoFocus = false,
}: CommentInputProps) => {
  const [body, setBody] = useState(initialValue);

  const handleSubmit = async () => {
    if (body.trim()) {
      await onSubmit(body.trim());
      setBody("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-3 space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 resize-none font-sans"
        rows={3}
        disabled={isSubmitting}
        autoFocus={autoFocus}
      />
      <div className="flex items-center justify-between font-sans">
        <span className="text-[10px] text-zinc-500">
          Press Cmd/Ctrl+Enter to submit, Esc to cancel
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-xs text-zinc-300 hover:text-white border border-[#27272a] hover:border-zinc-600 rounded transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !body.trim()}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white border border-transparent rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isSubmitting ? "Submitting..." : "Comment"}
          </button>
        </div>
      </div>
    </div>
  );
};
