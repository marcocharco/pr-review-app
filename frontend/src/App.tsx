import {
  AlertCircle,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [nodes, setNodes] = useState<Node[]>([]);
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

  const processFilesToLayout = (files: FileData[]) => {
    const COLUMNS = 3;
    const X_SPACING = 600;
    const Y_SPACING = 600;

    const newNodes: Node[] = [];

    files.forEach((file: FileData, index: number) => {
      const col = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const x = col * X_SPACING;
      const y = row * Y_SPACING;

      const node = {
        id: `file-${index}`,
        x,
        y,
        data: {
          filename: file.filename,
          status: file.status,
          patch: file.patch,
        },
      };

      newNodes.push(node);
    });

    setNodes(newNodes);
  };

  // --- Session Fetch ---

  const fetchSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNodes([]);
    setPan({ x: 100, y: 100 });
    setZoom(1);

    try {
      const response = await fetch("/session");

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (f: { path: string; status: any; patch: string }) => ({
          filename: f.path,
          status: f.status,
          patch: f.patch,
        })
      );

      // Process comments
      if (session.comments) {
        setComments(processComments(session.comments));
      } else {
        setComments([]);
      }

      processFilesToLayout(files);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
    } finally {
      setIsLoading(false);
    }
  }, [processComments]);

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
        className="fixed top-4 left-4 right-4 z-50 h-16 rounded-2xl bg-zinc-900/10 backdrop-blur-md backdrop-saturate-200 shadow-[0_8px_32px_0_rgba(0,0,0,0.36),inset_0_0_0_1px_rgba(255,255,255,0.08),inset_0_1px_0_0_rgba(255,255,255,0.3),inset_0_-1px_0_0_rgba(0,0,0,0.2)] px-6 flex items-center justify-between transition-all duration-300"
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
            onClick={fetchSession}
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
            onMouseDown: handleMouseDown,
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
          {/* Nodes Layer */}
          <div className="pointer-events-auto">
            {nodes.map((node) => (
              <FileNode
                key={node.id}
                node={node}
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

        {/* Controls Overlay */}
        <div className="absolute bottom-6 right-6 flex flex-col gap-2 pointer-events-auto">
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
    </div>
  );
}
