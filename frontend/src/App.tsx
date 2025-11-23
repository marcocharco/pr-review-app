import {
  AlertCircle,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  GitCommit,
  GitBranch,
  ChevronUp,
  ChevronDown,
  X,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileData, Node, Comment, CommentType } from "./types";
import { Canvas, type CanvasRef } from "./components/Canvas";
import { ZoomControls, type ZoomControlsRef } from "./components/ZoomControls";

// Define payload interface to replace 'any'
interface CommentPayload {
  body: string;
  path?: string;
  side?: string;
  commit_id: string;
  line?: number;
  start_line?: number;
  in_reply_to_id?: number;
}

// Helper to get HTTP URL from remote
const getRepoHttpUrl = (remote: string) => {
  if (remote.startsWith("http")) {
    return remote.replace(/\.git$/, "");
  }
  if (remote.startsWith("git@")) {
    const match = remote.match(/git@github\.com:([^/]+)\/(.+?)(\.git)?$/);
    if (match) {
      return `https://github.com/${match[1]}/${match[2]}`;
    }
  }
  return remote;
};

export default function App() {
  // Data State
  const [files, setFiles] = useState<FileData[]>([]);
  const [nodeHeights, setNodeHeights] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repoInfo, setRepoInfo] = useState<{
    remote: string;
    branch: string;
    repoName: string;
    head: string;
    prTitle?: string;
    prNumber?: number;
    prLink?: string;
    prStatus?: "open" | "closed" | "merged" | "draft";
    repoLink?: string;
  } | null>(null);

  // Comment State
  const [comments, setComments] = useState<Comment[]>([]);
  const [isPosting, setIsPosting] = useState(false);

  // Merge State
  const [showMergeMenu, setShowMergeMenu] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<
    "merge" | "squash" | "rebase"
  >("merge");
  const [mergeModal, setMergeModal] = useState<{
    isOpen: boolean;
    strategy: string | null;
  }>({ isOpen: false, strategy: null });
  const [commitTitle, setCommitTitle] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [isMerging, setIsMerging] = useState(false);
  const [mergeStatus, setMergeStatus] = useState<"success" | "error" | null>(
    null
  );
  const [mergeErrorMsg, setMergeErrorMsg] = useState("");

  // UI State for zoom label
  // const [currentZoom, setCurrentZoom] = useState(1); // Removed to prevent re-renders
  const canvasRef = useRef<CanvasRef>(null);
  const zoomControlsRef = useRef<ZoomControlsRef>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const handleZoomChange = useCallback((zoom: number) => {
    zoomControlsRef.current?.setZoom(zoom);
  }, []);

  // --- Comment Processing ---

  const processComments = useCallback((rawComments: Comment[]): Comment[] => {
    const commentMap = new Map<number, Comment>();
    const rootComments: Comment[] = [];

    // First pass: Init map and derive type
    rawComments.forEach((c) => {
      let type: CommentType = "file";
      // Ensure line is a valid number before setting type to line/selection
      if (typeof c.line === "number" && c.line > 0) {
        if (c.startLine) type = "selection";
        else type = "line";
      }

      const commentWithDerived: Comment = {
        ...c,
        type,
        replies: [],
      };
      commentMap.set(c.id, commentWithDerived);
    });

    // Second pass: Build tree
    rawComments.forEach((c) => {
      const comment = commentMap.get(c.id)!;
      if (c.in_reply_to_id) {
        const parent = commentMap.get(c.in_reply_to_id);
        if (parent) {
          parent.replies.push(comment);
        } else {
          // Orphan reply, treat as root if parent not found
          rootComments.push(comment);
        }
      } else {
        rootComments.push(comment);
      }
    });

    return rootComments;
  }, []);

  // --- Comment Handlers ---

  const handleAddComment = useCallback(
    async (
      filePath: string,
      body: string,
      lineNumber?: number,
      startLine?: number
    ) => {
      if (!repoInfo?.head) {
        console.error("No HEAD SHA available");
        return;
      }

      setIsPosting(true);
      try {
        const payload: CommentPayload = {
          body,
          path: filePath,
          side: "RIGHT",
          commit_id: repoInfo.head,
        };

        if (lineNumber) {
          payload.line = lineNumber;
        }

        if (startLine) {
          payload.start_line = startLine;
        }

        const response = await fetch("/comments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errText = await response.text();
          // Check for 403 from backend status or error message
          if (
            response.status === 403 ||
            errText.includes("Resource not accessible by integration")
          ) {
            alert(
              "Permission Error: The GitHub App or Token used does not have permission to comment on this repository.\n\n" +
                "If using a GitHub App, ensure it is installed on this repository.\n" +
                "If using a Token, ensure it has 'repo' or 'pull_requests:write' scope.\n\n" +
                "You can manually configure a Personal Access Token in ~/.config/pr-review/apps.json"
            );
            throw new Error(
              "Permission denied: App not installed or token invalid"
            );
          }
          throw new Error(errText || "Failed to post comment");
        }

        const newComment = await response.json();

        const processedNewComment: Comment = {
          ...newComment,
          type: lineNumber ? (startLine ? "selection" : "line") : "file",
          replies: [],
        };

        setComments((prev) => [...prev, processedNewComment]);
      } catch (error) {
        console.error("Failed to post comment:", error);
        // Alert is already shown for specific errors
        if (
          !(
            error instanceof Error &&
            error.message.includes("Permission denied")
          )
        ) {
          alert(
            "Failed to post comment: " +
              (error instanceof Error ? error.message : String(error))
          );
        }
      } finally {
        setIsPosting(false);
      }
    },
    [repoInfo?.head]
  );

  const handleReplyComment = useCallback(
    async (inReplyToId: number, body: string) => {
      if (!repoInfo?.head) return;

      setIsPosting(true);
      try {
        const replyPayload: CommentPayload = {
          body,
          commit_id: repoInfo.head,
          in_reply_to_id: inReplyToId,
        };

        const response = await fetch("/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(replyPayload),
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const newComment = await response.json();
        const processedNewComment: Comment = {
          ...newComment,
          type: "line", // Replies inherit type context from parent usually, default to line
          replies: [],
        };

        // Update state to nest this reply
        setComments((prev) => {
          const addReply = (nodes: Comment[]): Comment[] => {
            return nodes.map((node) => {
              if (node.id === inReplyToId) {
                return {
                  ...node,
                  replies: [...node.replies, processedNewComment],
                };
              }
              if (node.replies.length > 0) {
                return { ...node, replies: addReply(node.replies) };
              }
              return node;
            });
          };

          return addReply(prev);
        });
      } catch (e) {
        console.error(e);
        alert("Failed to reply");
      } finally {
        setIsPosting(false);
      }
    },
    [repoInfo?.head]
  );

  // Edit/Delete not implemented in backend yet, so we leave them empty or basic.
  const handleEditComment = useCallback(
    async (commentId: number, body: string) => {
      console.warn("Edit not implemented in backend yet", commentId, body);
    },
    []
  );

  const handleDeleteComment = useCallback(async (commentId: number) => {
    console.warn("Delete not implemented in backend yet", commentId);
  }, []);

  // --- Merge Logic ---

  const initiateMerge = (strategy: string) => {
    setMergeModal({ isOpen: true, strategy });
    setShowMergeMenu(false);
    // Pre-fill title with PR title from repoInfo
    setCommitTitle(
      repoInfo?.prTitle ||
        (repoInfo?.prNumber ? `Merge pull request #${repoInfo.prNumber}` : "")
    );
    setCommitMessage("");
    setMergeStatus(null);
  };

  const confirmMerge = async () => {
    if (!repoInfo || !mergeModal.strategy) return;
    setIsMerging(true);
    setMergeStatus(null);

    try {
      // Call LOCAL endpoint /merge instead of GitHub API
      const response = await fetch("/merge", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          commit_title: commitTitle,
          commit_message: commitMessage,
          merge_method: mergeModal.strategy,
          sha: repoInfo.head, // Send head SHA for safety
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Merge failed");
      }

      setMergeStatus("success");
      setTimeout(() => {
        setMergeModal({ isOpen: false, strategy: null });
        // Refresh session to show updated "merged" status
        fetchSession(true);
      }, 2000);
    } catch (err) {
      console.error(err);
      setMergeStatus("error");
      setMergeErrorMsg(
        err instanceof Error ? err.message : "Unknown error occurred"
      );
    } finally {
      setIsMerging(false);
    }
  };

  // --- Layout Logic ---

  const nodes = useMemo(() => {
    const COLUMNS = 2;
    const X_SPACING = 1450;
    const REF_OFFSET_X = 760;
    const DEFAULT_FILE_HEIGHT = 600;
    const MIN_FILE_HEIGHT = 360;
    const DEFAULT_REF_HEIGHT = 88; // generous default to avoid initial overlap
    const MIN_REF_HEIGHT = 72;
    const STACK_GAP = 32;
    const GAP_Y = 260;

    const columnY = new Array(COLUMNS).fill(0);
    const newNodes: Node[] = [];

    files.forEach((file, index) => {
      const col = index % COLUMNS;
      const x = col * X_SPACING;
      const startY = columnY[col];

      // Main file node
      const fileNodeId = `file-${index}`;
      const measuredFileHeight = nodeHeights[fileNodeId];
      const fileHeight = Math.max(
        measuredFileHeight ?? DEFAULT_FILE_HEIGHT,
        MIN_FILE_HEIGHT
      );
      newNodes.push({
        id: fileNodeId,
        x,
        y: startY,
        data: file,
      });

      let refYOffset = 0;
      let maxRefY = startY;

      // Process references
      if (file.changedSpans) {
        file.changedSpans.forEach((span, spanIndex) => {
          if (span.references && span.references.length > 0) {
            span.references.forEach((ref, refIndex) => {
              const refNodeId = `ref-${index}-${spanIndex}-${refIndex}`;
              const measuredRefHeight = nodeHeights[refNodeId];
              const refHeight = Math.max(
                measuredRefHeight ?? DEFAULT_REF_HEIGHT,
                MIN_REF_HEIGHT
              );
              const refY = startY + refYOffset;

              newNodes.push({
                id: refNodeId,
                x: x + REF_OFFSET_X,
                y: refY,
                data: {
                  filename: ref.path,
                  status: "related",
                  context: ref.context,
                  referenceLine: ref.line,
                  referenceStart: ref.start,
                  referenceEnd: ref.end,
                  contextStartLine: ref.contextStartLine,
                  changedSpans: [],
                  referencesChecked: true,
                },
              });

              refYOffset += refHeight + STACK_GAP; // stack with breathing room
              maxRefY = Math.max(maxRefY, refY + refHeight);
            });
          }
        });
      }

      const totalHeight = Math.max(fileHeight, maxRefY - startY);
      columnY[col] += totalHeight + GAP_Y;
    });

    return newNodes;
  }, [files, nodeHeights]);

  const handleNodeSize = useCallback((id: string, height: number) => {
    setNodeHeights((prev) => {
      if (prev[id] === height) return prev;
      return { ...prev, [id]: height };
    });
  }, []);

  // --- Session Fetch ---

  const analyzeFile = async (filename?: string) => {
    try {
      const response = await fetch("/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });

      if (!response.ok) return;

      const rawFiles = await response.json();
      const updatedFiles: FileData[] = rawFiles.map((f: any) => ({
        filename: f.path,
        status: f.status,
        patch: f.patch,
        changedSpans: f.changedSpans ?? [],
        referencesChecked: true,
      }));

      // Merge updated files into existing files
      setFiles((prevFiles) => {
        const nextFiles = [...prevFiles];
        updatedFiles.forEach((update) => {
          const idx = nextFiles.findIndex(
            (f) => f.filename === update.filename
          );
          if (idx !== -1) {
            nextFiles[idx] = {
              ...nextFiles[idx],
              patch: update.patch,
              changedSpans: update.changedSpans,
              referencesChecked: true,
            };
          }
        });
        return nextFiles;
      });
    } catch (err) {
      console.error("Analysis failed:", err);
    }
  };

  const fetchSession = useCallback(
    async (refresh = false) => {
      setIsLoading(true);
      setError(null);
      if (!refresh) {
        setFiles([]);
        setNodeHeights({});
        if (canvasRef.current) canvasRef.current.resetZoom();
      }

      try {
        const endpoint = refresh ? "/refresh" : "/session";
        const method = refresh ? "POST" : "GET";
        const response = await fetch(endpoint, { method });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch session: ${response.status} ${response.statusText}`
          );
        }

        const session = await response.json();

        if (session.repo) {
          setRepoInfo({
            remote: session.repo.remote,
            branch: session.repo.branch,
            repoName: session.repo.repoName,
            head: session.repo.head,
            prTitle: session.repo.prTitle,
            prNumber: session.repo.prNumber,
            prLink: session.repo.prLink,
            prStatus: session.repo.prStatus,
            repoLink: session.repo.repoLink,
          });
        }

        // Map session files to FileData
        const files: FileData[] = session.files.map(
          (f: {
            path: string;
            status: any;
            patch: string;
            changedSpans?: any[];
          }) => ({
            filename: f.path,
            status: f.status,
            patch: f.patch,
            changedSpans: f.changedSpans,
            referencesChecked: Array.isArray(f.changedSpans),
          })
        );

        // Process comments
        if (session.comments) {
          setComments(processComments(session.comments));
        } else {
          setComments([]);
        }

        setNodeHeights({});
        setFiles(files);
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error ? err.message : "An unknown error occurred"
        );
      } finally {
        setIsLoading(false);
      }
    },
    [processComments]
  );

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const repoUrl = repoInfo
    ? repoInfo.repoLink || getRepoHttpUrl(repoInfo.remote)
    : undefined;
  const prUrl = repoInfo
    ? repoInfo.prLink ||
      (repoUrl && repoInfo.prNumber
        ? `${repoUrl}/pull/${repoInfo.prNumber}`
        : undefined)
    : undefined;

  return (
    <div className="w-screen h-screen bg-[#09090b] flex flex-col overflow-hidden font-sans text-zinc-300 selection:bg-blue-500/30">
      {/* Header */}
      <div
        ref={headerRef}
        className="fixed top-4 left-4 right-4 z-50 h-16 rounded-2xl bg-zinc-900/10 backdrop-blur-md backdrop-saturate-200 shadow-[inset_2px_2px_0px_-2px_rgba(255,255,255,0.2),inset_0_0_2px_1px_rgba(255,255,255,0.15)] px-6 flex items-center justify-between transition-all duration-300 pointer-events-auto"
      >
        <div className="flex items-center gap-2 text-zinc-100 font-medium text-lg tracking-tight">
          <GitPullRequest className="text-blue-500" size={20} />
          <span>Contify</span>
        </div>

        <div className="flex items-center gap-4">
          {repoInfo && (
            <div className="flex items-center gap-4 text-sm text-zinc-400">
              {repoInfo.prTitle && (
                <>
                  {repoInfo.prStatus && (
                    // Badge
                    <div
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium capitalize mr-1 ${
                        repoInfo.prStatus === "merged"
                          ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                          : repoInfo.prStatus === "closed"
                          ? "bg-red-500/10 text-red-400 border-red-500/20"
                          : repoInfo.prStatus === "draft"
                          ? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                          : "bg-green-500/10 text-green-400 border-green-500/20"
                      }`}
                    >
                      {repoInfo.prStatus === "merged" ? (
                        <GitMerge size={12} />
                      ) : repoInfo.prStatus === "closed" ? (
                        <GitPullRequestClosed size={12} />
                      ) : repoInfo.prStatus === "draft" ? (
                        <GitPullRequestDraft size={12} />
                      ) : (
                        <GitPullRequest size={12} />
                      )}
                      <span>{repoInfo.prStatus}</span>
                    </div>
                  )}
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors group flex items-center gap-2 hover:text-blue-400"
                  >
                    {/* PR Info */}
                    <span className="text-zinc-200 font-medium group-hover:text-blue-400">
                      {repoInfo.prTitle}
                    </span>
                    <span className="text-zinc-500 group-hover:text-blue-400">
                      #{repoInfo.prNumber}
                    </span>
                  </a>
                  {/* Spacer */}
                  <div className="w-px h-4 bg-zinc-700" />
                </>
              )}
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors group flex items-center gap-2"
              >
                {/* Repo Info */}
                <span className="text-zinc-200 font-medium group-hover:text-blue-400">
                  {repoInfo.repoName}
                </span>
                <span className="text-zinc-600">/</span>
                <span className="text-zinc-200 group-hover:text-blue-400">
                  {repoInfo.branch}
                </span>
              </a>
            </div>
          )}

          <button
            onClick={() => analyzeFile()}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-1.5 rounded text-xs font-medium flex items-center gap-2 transition-all border border-zinc-700"
          >
            <span>Analyze All</span>
          </button>

          <button
            onClick={() => fetchSession(true)}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-500 cursor-pointer text-white px-4 py-1.5 rounded text-xs font-medium flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ width: 80, justifyContent: "center" }}
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <span>Refresh</span>
            )}
          </button>
        </div>
      </div>

      <Canvas
        ref={canvasRef}
        nodes={nodes}
        comments={comments}
        repoInfo={repoInfo}
        onNodeSize={handleNodeSize}
        onAnalyze={analyzeFile}
        onAddComment={handleAddComment}
        onEditComment={handleEditComment}
        onDeleteComment={handleDeleteComment}
        onReplyComment={handleReplyComment}
        isPosting={isPosting}
        error={error}
        isLoading={isLoading}
        onZoomChange={handleZoomChange}
      />

      {/* Controls Container (Overlay) */}
      <div className="absolute bottom-6 right-6 flex items-end gap-4 pointer-events-auto z-50">
        {/* MERGE BUTTONS */}
        {repoInfo?.prStatus === "open" && (
          <div className="relative flex flex-col items-end">
            {showMergeMenu && (
              <div className="absolute bottom-full right-0 mb-2 w-64 bg-[#18181b] border border-[#27272a] rounded-md shadow-xl overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-200 flex flex-col">
                <div className="px-3 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-[#27272a] bg-[#1f1f23]">
                  Select merge strategy
                </div>
                <button
                  onClick={() => {
                    setSelectedStrategy("merge");
                    setShowMergeMenu(false);
                  }}
                  className="text-left px-3 py-3 text-zinc-300 hover:bg-zinc-800 hover:text-white text-xs font-medium flex items-start gap-3 transition-colors border-b border-[#27272a] last:border-0"
                >
                  <GitMerge
                    size={16}
                    className="text-green-500 mt-0.5 shrink-0"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-zinc-200">
                      Create a merge commit
                    </span>
                    <span className="text-[10px] text-zinc-500 leading-tight">
                      All commits from this branch will be added to the base
                      branch via a merge commit.
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setSelectedStrategy("squash");
                    setShowMergeMenu(false);
                  }}
                  className="text-left px-3 py-3 text-zinc-300 hover:bg-zinc-800 hover:text-white text-xs font-medium flex items-start gap-3 transition-colors border-b border-[#27272a] last:border-0"
                >
                  <GitCommit
                    size={16}
                    className="text-blue-500 mt-0.5 shrink-0"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-zinc-200">
                      Squash and merge
                    </span>
                    <span className="text-[10px] text-zinc-500 leading-tight">
                      The 1 commit from this branch will be added to the base
                      branch.
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setSelectedStrategy("rebase");
                    setShowMergeMenu(false);
                  }}
                  className="text-left px-3 py-3 text-zinc-300 hover:bg-zinc-800 hover:text-white text-xs font-medium flex items-start gap-3 transition-colors"
                >
                  <GitBranch
                    size={16}
                    className="text-purple-500 mt-0.5 shrink-0"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-zinc-200">
                      Rebase and merge
                    </span>
                    <span className="text-[10px] text-zinc-500 leading-tight">
                      The 1 commit from this branch will be rebased and added to
                      the base branch.
                    </span>
                  </div>
                </button>
              </div>
            )}

            <div className="flex items-stretch shadow-xl rounded-md overflow-hidden">
              <button
                onClick={() => initiateMerge(selectedStrategy)}
                className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-medium transition-colors ${
                  selectedStrategy === "merge"
                    ? "bg-[#238636] hover:bg-[#2ea043]"
                    : selectedStrategy === "squash"
                    ? "bg-[#1f6feb] hover:bg-[#388bfd]"
                    : "bg-[#8957e5] hover:bg-[#a371f7]"
                }`}
              >
                {selectedStrategy === "merge" && <GitMerge size={16} />}
                {selectedStrategy === "squash" && <GitCommit size={16} />}
                {selectedStrategy === "rebase" && <GitBranch size={16} />}
                <span>
                  {selectedStrategy === "merge"
                    ? "Merge pull request"
                    : selectedStrategy === "squash"
                    ? "Squash and merge"
                    : "Rebase and merge"}
                </span>
              </button>
              <div className="w-px bg-black/20" />
              <button
                onClick={() => setShowMergeMenu(!showMergeMenu)}
                className={`px-2 flex items-center justify-center text-white transition-colors ${
                  selectedStrategy === "merge"
                    ? "bg-[#238636] hover:bg-[#2ea043]"
                    : selectedStrategy === "squash"
                    ? "bg-[#1f6feb] hover:bg-[#388bfd]"
                    : "bg-[#8957e5] hover:bg-[#a371f7]"
                }`}
              >
                {showMergeMenu ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Zoom Controls */}
        <ZoomControls ref={zoomControlsRef} canvasRef={canvasRef} />
      </div>

      {/* MERGE MODAL */}
      {mergeModal.isOpen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200">
          <div className="bg-[#18181b] border border-[#27272a] rounded-lg shadow-2xl w-full max-w-lg overflow-hidden pointer-events-auto">
            <div className="p-4 border-b border-[#27272a] flex items-center justify-between">
              <h3 className="font-medium text-white flex items-center gap-2">
                {mergeModal.strategy === "merge" && (
                  <GitMerge size={16} className="text-green-500" />
                )}
                {mergeModal.strategy === "squash" && (
                  <GitCommit size={16} className="text-blue-500" />
                )}
                {mergeModal.strategy === "rebase" && (
                  <GitBranch size={16} className="text-purple-500" />
                )}
                Confirm{" "}
                {mergeModal.strategy &&
                  mergeModal.strategy.charAt(0).toUpperCase() +
                    mergeModal.strategy.slice(1)}
              </h3>
              <button
                onClick={() => setMergeModal({ isOpen: false, strategy: null })}
                className="text-zinc-500 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            {mergeStatus === "success" ? (
              <div className="p-8 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 mb-2">
                  <CheckCircle2 size={32} />
                </div>
                <h4 className="text-white font-medium">Pull Request Merged!</h4>
                <p className="text-zinc-400 text-sm">Refreshing session...</p>
              </div>
            ) : (
              <>
                <div className="p-6 flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-zinc-500 uppercase">
                      Commit Title
                    </label>
                    <input
                      className="bg-[#09090b] border border-[#27272a] rounded p-2 text-zinc-300 text-sm focus:border-blue-500 outline-none"
                      value={commitTitle}
                      onChange={(e) => setCommitTitle(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-zinc-500 uppercase">
                      Commit Message
                    </label>
                    <textarea
                      rows={4}
                      className="bg-[#09090b] border border-[#27272a] rounded p-2 text-zinc-300 text-sm focus:border-blue-500 outline-none resize-none"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Add description..."
                    />
                  </div>
                  {mergeStatus === "error" && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded text-xs text-rose-400 flex items-center gap-2">
                      <AlertCircle size={14} />
                      <span>{mergeErrorMsg}</span>
                    </div>
                  )}
                </div>
                <div className="p-4 bg-[#1f1f23] border-t border-[#27272a] flex justify-end gap-3">
                  <button
                    onClick={() =>
                      setMergeModal({ isOpen: false, strategy: null })
                    }
                    className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmMerge}
                    disabled={isMerging}
                    className={`px-4 py-2 rounded text-xs font-medium text-white flex items-center gap-2 transition-opacity ${
                      mergeModal.strategy === "merge"
                        ? "bg-[#238636] hover:bg-[#2ea043]"
                        : mergeModal.strategy === "squash"
                        ? "bg-[#1f6feb] hover:bg-[#388bfd]"
                        : "bg-[#8957e5] hover:bg-[#a371f7]"
                    }`}
                  >
                    {isMerging && (
                      <Loader2 size={12} className="animate-spin" />
                    )}
                    Confirm Merge
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
