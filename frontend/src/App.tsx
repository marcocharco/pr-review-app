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
import { FileNode } from "./components/FileNode";
import type { FileData, Node, Comment, CommentType } from "./types";

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

  // Canvas State
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const gestureTypeRef = useRef<"pan" | "scroll" | null>(null);
  const gestureTimeoutRef = useRef<number | null>(null);
  const activeScrollableElementRef = useRef<HTMLElement | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

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

  const handleAddComment = async (
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
        !(error instanceof Error && error.message.includes("Permission denied"))
      ) {
        alert(
          "Failed to post comment: " +
            (error instanceof Error ? error.message : String(error))
        );
      }
    } finally {
      setIsPosting(false);
    }
  };

  const handleReplyComment = async (inReplyToId: number, body: string) => {
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
  };

  // Edit/Delete not implemented in backend yet, so we leave them empty or basic.
  const handleEditComment = async (commentId: number, body: string) => {
    console.warn("Edit not implemented in backend yet", commentId, body);
  };

  const handleDeleteComment = async (commentId: number) => {
    console.warn("Delete not implemented in backend yet", commentId);
  };

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

  // --- Canvas Logic ---

  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      e.target === containerRef.current ||
      (target.classList && target.classList.contains("canvas-bg"))
    ) {
      setIsDragging(true);
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      e.preventDefault(); // Prevent text selection during drag
    }
  };

  // Document-level mouse move handler for continuous panning
  useEffect(() => {
    if (!isDragging) return;

    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (lastMousePosRef.current) {
        e.preventDefault(); // Prevent text selection and other default behaviors
        const deltaX = e.clientX - lastMousePosRef.current.x;
        const deltaY = e.clientY - lastMousePosRef.current.y;

        setPan((prev) => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY,
        }));

        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleDocumentMouseUp = () => {
      setIsDragging(false);
      lastMousePosRef.current = null;
    };

    document.addEventListener("mousemove", handleDocumentMouseMove);
    document.addEventListener("mouseup", handleDocumentMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleDocumentMouseMove);
      document.removeEventListener("mouseup", handleDocumentMouseUp);
    };
  }, [isDragging]);

  const handleWheel = useCallback((event: WheelEvent) => {
    // Check if the event target is within the header
    const target = event.target as HTMLElement;
    if (headerRef.current && headerRef.current.contains(target)) {
      // Allow default behavior on header
      return;
    }

    // Check if the cursor is over the header by checking clientY position
    if (headerRef.current) {
      const headerRect = headerRef.current.getBoundingClientRect();
      if (event.clientY <= headerRect.bottom) {
        // Cursor is on or above the header, allow default behavior
        return;
      }
    }

    // Prevent default wheel behavior (including trackpad pinch) on canvas
    event.preventDefault();

    if (!containerRef.current) return;

    // Clear any existing gesture timeout
    if (gestureTimeoutRef.current) {
      clearTimeout(gestureTimeoutRef.current);
      gestureTimeoutRef.current = null;
    }

    // Check if the event is over a scrollable element
    const targetElement = event.target as HTMLElement;
    const scrollableElement = targetElement.closest?.(
      ".overflow-y-auto"
    ) as HTMLElement;

    // Determine gesture type on first event or if gesture state is reset
    if (gestureTypeRef.current === null) {
      // New gesture - determine type based on where cursor is
      if (scrollableElement) {
        const canScrollUp = scrollableElement.scrollTop > 0;
        const canScrollDown =
          scrollableElement.scrollTop <
          scrollableElement.scrollHeight - scrollableElement.clientHeight;

        const scrollingUp = event.deltaY < 0;
        const scrollingDown = event.deltaY > 0;
        const isPrimarilyVertical =
          Math.abs(event.deltaY) > Math.abs(event.deltaX) * 2;

        // If cursor starts in scrollable area and can scroll, lock to scroll gesture
        if (
          isPrimarilyVertical &&
          ((scrollingUp && canScrollUp) || (scrollingDown && canScrollDown))
        ) {
          gestureTypeRef.current = "scroll";
          activeScrollableElementRef.current = scrollableElement;
        } else {
          // Otherwise, lock to pan gesture
          gestureTypeRef.current = "pan";
        }
      } else {
        // Cursor not over scrollable element, lock to pan gesture
        gestureTypeRef.current = "pan";
      }
    }

    // Handle based on locked gesture type
    if (
      gestureTypeRef.current === "scroll" &&
      activeScrollableElementRef.current
    ) {
      // Locked to scroll gesture - only scroll the element, no canvas panning
      const element = activeScrollableElementRef.current;
      const canScrollUp = element.scrollTop > 0;
      const canScrollDown =
        element.scrollTop < element.scrollHeight - element.clientHeight;

      const scrollingUp = event.deltaY < 0;
      const scrollingDown = event.deltaY > 0;

      if ((scrollingUp && canScrollUp) || (scrollingDown && canScrollDown)) {
        element.scrollTop += event.deltaY;
      }

      // Reset gesture after a delay (when user stops scrolling)
      gestureTimeoutRef.current = window.setTimeout(() => {
        gestureTypeRef.current = null;
        activeScrollableElementRef.current = null;
      }, 150);

      return;
    }

    // Locked to pan gesture - continue panning regardless of cursor position
    // Reset gesture after a delay (when user stops panning)
    gestureTimeoutRef.current = window.setTimeout(() => {
      gestureTypeRef.current = null;
      activeScrollableElementRef.current = null;
    }, 150);

    // Trackpad pinch usually has ctrlKey set, or we can heuristically detect it
    const isPinch = event.ctrlKey || event.metaKey;

    // Use refs to get current values without causing callback recreation
    const currentPan = panRef.current;
    const currentZoom = zoomRef.current;

    if (isPinch) {
      // Zoom logic
      const ZOOM_SPEED = 0.01;
      const rect = containerRef.current.getBoundingClientRect();

      // Cursor position relative to the canvas container
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // Current point in the scene (untransformed)
      // screen = scene * zoom + pan
      // scene = (screen - pan) / zoom
      const sceneX = (mouseX - currentPan.x) / currentZoom;
      const sceneY = (mouseY - currentPan.y) / currentZoom;

      // Calculate new zoom
      const newZoom = Math.max(
        0.1,
        Math.min(3, currentZoom - event.deltaY * ZOOM_SPEED)
      );

      // Calculate new pan to keep the point under cursor fixed
      // newPan = screen - scene * newZoom
      const newPanX = mouseX - sceneX * newZoom;
      const newPanY = mouseY - sceneY * newZoom;

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    } else {
      // Pan logic (trackpad two-finger swipe or mouse wheel)
      setPan((prev) => ({
        x: prev.x - event.deltaX,
        y: prev.y - event.deltaY,
      }));
    }
  }, []);

  // Set up native wheel event listener with passive: false
  useEffect(() => {
    const node = containerRef.current;
    if (node) {
      node.addEventListener("wheel", handleWheel, { passive: false });
      return () => {
        node.removeEventListener("wheel", handleWheel);
        // Clean up any pending gesture timeout
        if (gestureTimeoutRef.current) {
          clearTimeout(gestureTimeoutRef.current);
          gestureTimeoutRef.current = null;
        }
      };
    }
  }, [handleWheel]);

  // --- Layout Logic ---

  const FILE_WIDTH = 520;

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
        setPan({ x: 100, y: 100 });
        setZoom(1);
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
        className="fixed top-4 left-4 right-4 z-50 h-16 rounded-2xl bg-zinc-900/10 backdrop-blur-md backdrop-saturate-200 shadow-[inset_2px_2px_0px_-2px_rgba(255,255,255,0.2),inset_0_0_2px_1px_rgba(255,255,255,0.15)] px-6 flex items-center justify-between transition-all duration-300"
      >
        <div className="flex items-center gap-2 text-zinc-100 font-medium text-lg tracking-tight">
          <GitPullRequest className="text-blue-500" size={20} />
          <span>CanvasReview</span>
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

      {/* Infinite Canvas Container */}
      <div
        ref={containerRef}
        className={`flex-1 relative overflow-hidden bg-[#09090b] canvas-bg ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={
          {
            touchAction: "none",
            overscrollBehavior: "contain",
            userSelect: "none",
          } as React.CSSProperties
        }
        onMouseDown={handleMouseDown}
      >
        {/* Dot Grid Pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
            backgroundImage: `radial-gradient(#52525b 1px, transparent 1px)`,
          }}
        />

        {/* Transform Layer */}
        <div
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
          className="absolute top-0 left-0 w-0 h-0 pointer-events-none"
        >
          {/* Edges Layer */}
          <svg
            className="absolute top-0 left-0 overflow-visible pointer-events-none"
            style={{ width: 1, height: 1 }}
          >
            {nodes.map((node) => {
              if (node.data.status !== "related") return null;
              // Find parent node
              // ID format: ref-{fileIndex}-{spanIndex}-{refIndex}
              const parts = node.id.split("-");
              if (parts.length !== 4) return null;
              const fileIndex = parts[1];
              const parentId = `file-${fileIndex}`;
              const parentNode = nodes.find((n) => n.id === parentId);

              if (!parentNode) return null;

              // Draw curve from right side of parent to left side of child
              const startX = parentNode.x + FILE_WIDTH - 6;
              const startYBase = parentNode.y + 24; // Middle of header approx
              const endX = node.x;
              const endY = node.y + 22;

              const controlX1 = startX + 110;
              const controlX2 = endX - 90;
              const startY = startYBase; // small stagger unnecessary for single set per file

              return (
                <path
                  key={`edge-${node.id}`}
                  d={`M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`}
                  fill="none"
                  stroke="#3f3f46"
                  strokeWidth="2"
                  strokeDasharray="4"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {/* Nodes Layer */}
          <div className="pointer-events-auto">
            {nodes.map((node) => (
              <FileNode
                key={node.id}
                node={node}
                zoom={zoom}
                onAnalyze={analyzeFile}
                style={{
                  transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                  willChange: "transform",
                }}
                comments={comments.filter((c) => c.path === node.data.filename)}
                onAddComment={handleAddComment}
                onEditComment={handleEditComment}
                onDeleteComment={handleDeleteComment}
                onReplyComment={handleReplyComment}
                isSubmitting={isPosting}
                currentUser="user" // Placeholder
                onSize={handleNodeSize}
              />
            ))}
          </div>
        </div>

        {/* Empty State */}
        {nodes.length === 0 && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
            <div className="w-20 h-20 bg-[#18181b] rounded-2xl border border-[#27272a] flex items-center justify-center mb-6 shadow-2xl shadow-black">
              <GitPullRequest size={40} className="text-zinc-500" />
            </div>
            <h2 className="text-zinc-200 text-lg font-medium mb-2">
              Ready to Review
            </h2>
            <p className="text-zinc-500 text-sm max-w-xs text-center leading-relaxed">
              Run the CLI with a PR number to load data.
            </p>
            {error && (
              <div className="mt-6 flex items-center gap-2 text-rose-400 bg-rose-400/10 px-4 py-2 rounded border border-rose-400/20 shadow-sm pointer-events-auto">
                <AlertCircle size={16} />
                <span className="text-xs font-medium">{error}</span>
              </div>
            )}
          </div>
        )}

        {/* Controls Container */}
        <div className="absolute bottom-6 right-6 flex items-end gap-4 pointer-events-auto z-40">
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
                        The 1 commit from this branch will be rebased and added
                        to the base branch.
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
          <div className="flex flex-col gap-2">
            <div className="bg-[#18181b] border border-[#27272a] p-1 rounded-lg shadow-xl flex flex-col gap-1">
              <button
                className="p-2 hover:bg-[#27272a] rounded text-zinc-400 hover:text-zinc-100 transition-colors"
                onClick={() => setZoom((z) => z + 0.1)}
              >
                +
              </button>
              <div className="h-px bg-[#27272a] mx-2" />
              <button
                className="p-2 hover:bg-[#27272a] rounded text-zinc-400 hover:text-zinc-100 transition-colors"
                onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))}
              >
                -
              </button>
            </div>
            <div className="bg-[#18181b] border border-[#27272a] px-2 py-1 rounded-md shadow-xl text-[10px] text-center font-mono text-zinc-500">
              {Math.round(zoom * 100)}%
            </div>
          </div>
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
                  onClick={() =>
                    setMergeModal({ isOpen: false, strategy: null })
                  }
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
                  <h4 className="text-white font-medium">
                    Pull Request Merged!
                  </h4>
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
    </div>
  );
}
