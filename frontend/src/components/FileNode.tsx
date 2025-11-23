import { useState, useMemo, useRef, useEffect } from "react";
import { Maximize2, Minimize2, MessageSquare, Plus } from "lucide-react";
import type { FileNodeProps, Comment } from "../types";
import { getFileIcon, getStatusColor } from "../utils/fileUtils";
import { CommentThread } from "./CommentThread";
import { CommentInput } from "./CommentInput";

export const FileNode = ({
  node,
  style,
  zoom,
  comments = [],
  onAddComment,
  onEditComment,
  onDeleteComment,
  onReplyComment,
  isSubmitting = false,
  currentUser,
  onAnalyze,
  onSize,
}: FileNodeProps) => {
  const { data } = node;
  // Start minimized if related, otherwise expanded
  const [expanded, setExpanded] = useState(data.status !== "related");
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentingLine, setCommentingLine] = useState<number | null>(null);
  const [expandedCommentLines, setExpandedCommentLines] = useState<Set<number>>(
    new Set(),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const hasAnyReferences = useMemo(
    () =>
      data.changedSpans?.some(
        (span) => span.references && span.references.length > 0,
      ) ?? false,
    [data.changedSpans],
  );

  useEffect(() => {
    if (comments.length > 0) {
      const linesWithComments = new Set<number>();
      comments.forEach((c) => {
        if (c.type === "line" && typeof c.line === "number") {
          linesWithComments.add(c.line);
        } else if (c.type === "selection" && typeof c.startLine === "number") {
          linesWithComments.add(c.startLine);
        }
      });
      setExpandedCommentLines(linesWithComments);
    }
  }, [comments]);
  const [textSelection, setTextSelection] = useState<{
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;
  } | null>(null);
  const diffContentRef = useRef<HTMLDivElement>(null);

  // Parse diff to extract line numbers and hunk information
  const parsedDiff = useMemo(() => {
    if (data.status === "related" && data.context) {
      return { lines: data.context.split("\n"), lineNumbers: new Map() };
    }
    if (!data.patch)
      return { lines: [], lineNumbers: new Map<number, number>() };

    const lines = data.patch.split("\n");
    const lineNumbers = new Map<number, number>();
    let currentLineNumber = 0;
    let addedLines = 0;

    lines.forEach((line, index) => {
      if (line.startsWith("@@")) {
        // Parse hunk header: @@ -start,count +start,count @@
        const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (match) {
          const newStart = parseInt(match[3], 10);
          currentLineNumber = newStart;
          addedLines = 0;
        }
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        lineNumbers.set(index, currentLineNumber + addedLines);
        addedLines++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        // removed line
      } else if (!line.startsWith("\\")) {
        // Context line
        lineNumbers.set(index, currentLineNumber + addedLines);
        addedLines++;
      }
    });

    return { lines, lineNumbers };
  }, [data.patch, data.context, data.status]);

  // Group comments by line number
  const commentsByLine = useMemo(() => {
    const map = new Map<number, Comment[]>();
    comments.forEach((comment) => {
      if (comment.type === "line" && comment.line !== undefined) {
        const line = comment.line;
        if (!map.has(line)) {
          map.set(line, []);
        }
        map.get(line)!.push(comment);
      } else if (
        comment.type === "selection" &&
        comment.startLine !== undefined
      ) {
        const line = comment.startLine;
        if (!map.has(line)) {
          map.set(line, []);
        }
        map.get(line)!.push(comment);
      }
    });
    return map;
  }, [comments]);

  // Get file-level comments
  const fileComments = useMemo(() => {
    return comments.filter((c) => c.type === "file");
  }, [comments]);

  // Handle line click for commenting
  const handleLineClick = (lineNumber: number | null) => {
    if (lineNumber === null) return;
    setCommentingLine(lineNumber);
    setShowCommentInput(true);
  };

  // Handle text selection
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setTextSelection(null);
        return;
      }

      const range = selection.getRangeAt(0);
      if (!diffContentRef.current?.contains(range.commonAncestorContainer)) {
        setTextSelection(null);
        return;
      }

      // This is a simplified version - in a real implementation,
      // you'd need to track line elements more precisely
      setTextSelection(null); // Simplified for now
    };

    document.addEventListener("selectionchange", handleSelection);
    return () =>
      document.removeEventListener("selectionchange", handleSelection);
  }, []);

  // Handle comment submission
  const handleAddComment = async (body: string) => {
    if (!onAddComment) return;

    if (commentingLine !== null) {
      await onAddComment(data.filename, body, commentingLine);
      // Ensure the new comment is visible
      setExpandedCommentLines((prev) => new Set(prev).add(commentingLine));
    } else if (textSelection) {
      await onAddComment(
        data.filename,
        body,
        textSelection.endLine,
        textSelection.startLine,
      );
      // For text selection, we might want to expand the end line or start line
      setExpandedCommentLines((prev) =>
        new Set(prev).add(textSelection.endLine),
      );
    } else {
      // File-level comment
      await onAddComment(data.filename, body);
    }

    setShowCommentInput(false);
    setCommentingLine(null);
    setTextSelection(null);
  };

  const handleEdit = async (commentId: number, body: string) => {
    if (!onEditComment) return;
    await onEditComment(commentId, body);
  };

  const handleDelete = async (commentId: number) => {
    if (!onDeleteComment) return;
    await onDeleteComment(commentId);
  };

  // Report node height so the canvas can reflow around expand/collapse
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !onSize) return;

    const sendHeight = () => {
      const height = Math.round(el.getBoundingClientRect().height / zoom);
      onSize(node.id, height);
    };

    sendHeight();
    requestAnimationFrame(sendHeight);

    const observer = new ResizeObserver(() => sendHeight());
    observer.observe(el);

    return () => observer.disconnect();
  }, [node.id, onSize, expanded, zoom]);

  const getCommentCountForLine = (lineNumber: number | null): number => {
    if (lineNumber === null) return 0;
    const lineComments = commentsByLine.get(lineNumber) || [];
    return lineComments.reduce((count, comment) => {
      return count + 1 + comment.replies.length;
    }, 0);
  };

  return (
    <div
      ref={rootRef}
      style={style}
      className={`absolute rounded-md border border-[#27272a] bg-[#18181b] w-[500px] shadow-2xl shadow-black/50 flex flex-col transition-all duration-200 ${
        expanded ? "h-auto" : "h-12 overflow-hidden"
      } ${data.status === "removed" ? "opacity-60" : ""} ${
        data.status === "related" ? "border-zinc-700 border-dashed" : ""
      }`}
    >
      {/* Header */}
      <div
        className="h-12 px-4 border-b border-[#27272a] flex items-center justify-between cursor-pointer hover:bg-[#27272a] transition-colors group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div
            className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold font-mono tracking-tighter ${getStatusColor(
              data.status,
            )}`}
          >
            {getFileIcon(data.filename)}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span
              className="font-mono text-sm text-zinc-300 group-hover:text-white transition-colors truncate"
              title={data.filename}
            >
              {data.filename}
            </span>
            {data.status === "related" && data.referenceLine && (
              <span className="text-[10px] text-zinc-500 font-mono">
                Line {data.referenceLine}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {comments.length > 0 && (
            <div className="flex items-center gap-1 text-zinc-500">
              <MessageSquare size={12} />
              <span className="text-[10px]">{comments.length}</span>
            </div>
          )}
          <span
            className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider ${getStatusColor(
              data.status,
            )}`}
          >
            {data.status}
          </span>
          {expanded ? (
            <Minimize2 size={14} className="text-zinc-500" />
          ) : (
            <Maximize2 size={14} className="text-zinc-500" />
          )}
        </div>
      </div>

      {/* Analyze Button for main files */}
      {expanded &&
        data.status !== "related" &&
        onAnalyze &&
        !data.referencesChecked && (
          <div className="px-4 py-2 border-b border-[#27272a] bg-[#18181b]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAnalyze(data.filename);
              }}
              className="text-[10px] bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 px-2 py-1 rounded border border-blue-900/50 transition-colors w-full"
            >
              Find References
            </button>
          </div>
        )}

      {expanded &&
        data.status !== "related" &&
        data.referencesChecked &&
        !hasAnyReferences && (
          <div className="px-4 py-2 border-b border-[#27272a] bg-[#18181b] text-[11px] text-zinc-400">
            No references found for this file.
          </div>
        )}

      {expanded && (
        <>
          {/* File-level comments */}
          {fileComments.length > 0 && (
            <div className="border-b border-[#27272a] p-3 space-y-2 bg-[#18181b]">
              {fileComments.map((comment) => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  onReply={(body) => onReplyComment?.(comment.id, body)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  isSubmitting={isSubmitting}
                  currentUser={currentUser}
                />
              ))}
            </div>
          )}

          {/* Diff Content */}
          <div
            ref={diffContentRef}
            className="bg-[#09090b] min-h-[150px] max-h-[400px] overflow-y-auto custom-scrollbar relative font-mono text-xs"
            style={{ userSelect: "text" }}
          >
            <div className="py-2">
              {parsedDiff.lines.map((line: string, i: number) => {
                if (data.status === "related") {
                  return (
                    <div
                      key={i}
                      className="px-4 py-0.5 whitespace-pre w-full border-l-2 border-transparent hover:bg-zinc-800/30"
                    >
                      <span className="text-zinc-400 inline-block w-full">
                        {line}
                      </span>
                    </div>
                  );
                }

                const lineNumber = parsedDiff.lineNumbers.get(i) || null;
                const commentCount = getCommentCountForLine(lineNumber);
                const hasComments = commentCount > 0;
                const isExpanded =
                  lineNumber !== null && expandedCommentLines.has(lineNumber);
                const isInputVisible =
                  showCommentInput &&
                  commentingLine === lineNumber &&
                  lineNumber !== null;

                let bgClass = "bg-transparent";
                let textClass = "text-zinc-400";
                let borderClass = "border-transparent";

                if (line.startsWith("+")) {
                  bgClass = "bg-emerald-900/20";
                  textClass = "text-emerald-400";
                  borderClass = "border-emerald-500";
                } else if (line.startsWith("-")) {
                  bgClass = "bg-rose-900/20";
                  textClass = "text-rose-400";
                  borderClass = "border-rose-500";
                } else if (line.startsWith("@@")) {
                  textClass = "text-blue-400";
                }

                return (
                  <div key={i} className="flex flex-col group">
                    {/* Line Row */}
                    <div
                      className={`${bgClass} flex items-start gap-2 py-0.5 w-full border-l-2 ${borderClass} hover:bg-opacity-40 transition-colors relative`}
                    >
                      {/* Line number / Add Comment Button */}
                      <div className="shrink-0 w-12 flex items-center justify-end pr-3 relative border-r border-[#27272a]/50">
                        {lineNumber !== null ? (
                          <>
                            {/* Line Number / Marker */}
                            <span className="text-[10px] text-zinc-600 font-mono">
                              {lineNumber}
                            </span>
                            {/* Add Comment Plus Button */}
                            <button
                              onClick={() => handleLineClick(lineNumber)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 bg-blue-600 text-white rounded-md flex items-center justify-center shadow-lg transform translate-x-1/2 hover:bg-blue-500 absolute right-0 top-1/2 -translate-y-1/2 z-10"
                              title="Add comment"
                            >
                              <Plus size={12} strokeWidth={3} />
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] text-zinc-600">·</span>
                        )}
                      </div>

                      {/* Line content */}
                      <div className="flex-1 min-w-0">
                        <span
                          className={`${textClass} whitespace-pre break-all`}
                        >
                          {line}
                        </span>
                      </div>
                    </div>

                    {/* Comment Thread & Input Row */}
                    {((isExpanded && hasComments) || isInputVisible) &&
                      lineNumber !== null && (
                        <div className="w-full bg-[#09090b] border-t border-b border-[#27272a] animate-in fade-in slide-in-from-top-1 duration-200 font-sans">
                          {/* Thread */}
                          {isExpanded &&
                            hasComments &&
                            commentsByLine.get(lineNumber)!.map((comment) => (
                              <div
                                key={comment.id}
                                className="p-3 border-b border-[#27272a] last:border-0"
                              >
                                <CommentThread
                                  comment={comment}
                                  onReply={(body) =>
                                    onReplyComment?.(comment.id, body)
                                  }
                                  onEdit={handleEdit}
                                  onDelete={handleDelete}
                                  isSubmitting={isSubmitting}
                                  currentUser={currentUser}
                                />
                              </div>
                            ))}

                          {/* Input */}
                          {isInputVisible && (
                            <div className="p-3">
                              <CommentInput
                                onSubmit={handleAddComment}
                                onCancel={() => {
                                  setShowCommentInput(false);
                                  setCommentingLine(null);
                                }}
                                placeholder="Leave a comment"
                                isSubmitting={isSubmitting}
                              />
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                );
              })}
            </div>

            {/* File-level comment input */}
            {showCommentInput && commentingLine === null && !textSelection && (
              <div className="p-3 border-t border-[#27272a] font-sans">
                <CommentInput
                  onSubmit={handleAddComment}
                  onCancel={() => {
                    setShowCommentInput(false);
                    setCommentingLine(null);
                  }}
                  placeholder="Add a general comment on this file..."
                  isSubmitting={isSubmitting}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
