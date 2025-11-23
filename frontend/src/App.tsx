import { AlertCircle, GitPullRequest, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { FileNode } from "./components/FileNode";
import type { FileData, Node } from "./types";

export default function App() {
  // Data State
  const [files, setFiles] = useState<FileData[]>([]);
  const [nodeHeights, setNodeHeights] = useState<Record<string, number>>({});

  // Layout Logic
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
        MIN_FILE_HEIGHT,
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
                MIN_REF_HEIGHT,
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
                },
              });

              refYOffset += refHeight + STACK_GAP; // stack with breathing room; expansion pushes next refs down
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repoInfo, setRepoInfo] = useState<{
    remote: string;
    branch: string;
    repoName: string;
  } | null>(null);

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

  // --- Canvas Logic ---

  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  const handleNodeSize = useCallback((id: string, height: number) => {
    setNodeHeights((prev) => {
      if (prev[id] === height) return prev;
      return { ...prev, [id]: height };
    });
  }, []);

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
      ".overflow-y-auto",
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
        Math.min(3, currentZoom - event.deltaY * ZOOM_SPEED),
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

        // If a specific file was analyzed, mark it as checked immediately.
        // This ensures that even if the backend returns no references (and thus no updates for this file),
        // the UI will update to show "No references found".
        if (filename) {
          const idx = nextFiles.findIndex((f) => f.filename === filename);
          if (idx !== -1) {
            nextFiles[idx] = {
              ...nextFiles[idx],
              referencesChecked: true,
            };
          }
        }

        updatedFiles.forEach((update) => {
          const idx = nextFiles.findIndex(
            (f) => f.filename === update.filename,
          );
          if (idx !== -1) {
            nextFiles[idx] = {
              ...nextFiles[idx],
              patch: update.patch,
              changedSpans: update.changedSpans ?? [],
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

  const fetchSession = useCallback(async (refresh = false) => {
    setIsLoading(true);
    setError(null);
    if (!refresh) {
      setFiles([]);
      setPan({ x: 100, y: 100 });
      setZoom(1);
    }

    try {
      const endpoint = refresh ? "/refresh" : "/session";
      const method = refresh ? "POST" : "GET";
      const response = await fetch(endpoint, { method });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch session: ${response.status} ${response.statusText}`,
        );
      }

      const session = await response.json();

      if (session.repo) {
        setRepoInfo({
          remote: session.repo.remote,
          branch: session.repo.branch,
          repoName: session.repo.repoName,
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
          referencesChecked: false,
        }),
      );

      setNodeHeights({});
      setFiles(files);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return (
    <div className="w-screen h-screen bg-[#09090b] flex flex-col overflow-hidden font-sans text-zinc-300 selection:bg-blue-500/30">
      {/* Header */}
      <div
        ref={headerRef}
        className="h-14 bg-[#09090b] border-b border-[#27272a] px-6 flex items-center justify-between z-20 relative"
      >
        <div className="flex items-center gap-2 text-zinc-100 font-medium text-lg tracking-tight">
          <GitPullRequest className="text-blue-500" size={20} />
          <span>CanvasReview</span>
        </div>

        <div className="flex items-center gap-3">
          {repoInfo && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="text-zinc-200 font-medium">
                <a
                  href={repoInfo.remote}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-400 transition-colors"
                >
                  {repoInfo.repoName}
                </a>
              </span>
              <span className="text-zinc-600">/</span>
              <span className="text-zinc-200">{repoInfo.branch}</span>
            </div>
          )}

          <div className="h-6 w-px bg-[#27272a] mx-1" />

          <button
            onClick={() => analyzeFile()}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-1.5 rounded text-xs font-medium flex items-center gap-2 transition-all border border-zinc-700"
          >
            <span>Analyze All</span>
          </button>

          <button
            onClick={() => fetchSession(true)}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-xs font-medium flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
        style={{
          touchAction: "none",
          overscrollBehavior: "contain",
          userSelect: "none",
        }}
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
            {files.map((_, index) => {
              const fileNode = nodes.find((n) => n.id === `file-${index}`);
              const refNodes = nodes.filter((n) =>
                n.id.startsWith(`ref-${index}-`),
              );

              if (!fileNode || refNodes.length === 0) return null;

              const startX = fileNode.x + 500; // Exact right edge of the card
              const startYBase = fileNode.y + 24; // near header center

              return refNodes.map((refNode, refIdx) => {
                const endX = refNode.x; // left edge of reference card
                const endY = refNode.y + 22; // center of related header

                const controlX1 = startX + 110;
                const controlX2 = endX - 90;
                const startY = startYBase + refIdx * 8; // tiny stagger to avoid overlap

                return (
                  <path
                    key={`edge-${refNode.id}`}
                    d={`M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`}
                    fill="none"
                    stroke="#3f3f46"
                    strokeWidth="2"
                    strokeDasharray="4"
                    strokeLinecap="round"
                  />
                );
              });
            })}
          </svg>

          {/* Nodes Layer */}
          <div className="pointer-events-auto">
            {nodes.map((node) => (
              <FileNode
                key={node.id}
                node={node}
                onAnalyze={analyzeFile}
                zoom={zoom}
                onSize={handleNodeSize}
                style={{
                  transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                  willChange: "transform",
                }}
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
