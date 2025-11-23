import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  memo,
} from "react";
import { GitPullRequest, AlertCircle } from "lucide-react";
import { FileNode } from "./FileNode";
import type { Node, Comment } from "../types";

const FILE_WIDTH = 520;

export interface CanvasRef {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  center: () => void;
}

interface CanvasProps {
  nodes: Node[];
  comments: Comment[];
  repoInfo?: {
    prStatus?: string;
  } | null;
  onNodeSize: (id: string, height: number) => void;
  onAnalyze: (filename: string) => void;
  onAddComment: (
    filePath: string,
    body: string,
    lineNumber?: number,
    startLine?: number
  ) => Promise<void>;
  onEditComment: (commentId: number, body: string) => Promise<void>;
  onDeleteComment: (commentId: number) => Promise<void>;
  onReplyComment: (inReplyToId: number, body: string) => Promise<void>;
  isPosting: boolean;
  error?: string | null;
  isLoading: boolean;
  onZoomChange?: (zoom: number) => void;
}

export const Canvas = memo(
  forwardRef<CanvasRef, CanvasProps>(
    (
      {
        nodes,
        comments,
        onNodeSize,
        onAnalyze,
        onAddComment,
        onEditComment,
        onDeleteComment,
        onReplyComment,
        isPosting,
        error,
        isLoading,
        onZoomChange,
      },
      ref
    ) => {
      const containerRef = useRef<HTMLDivElement>(null);
      const transformLayerRef = useRef<HTMLDivElement>(null);

      // Use refs for animation state to avoid re-renders
      const pan = useRef({ x: 100, y: 100 });
      const zoom = useRef(1);
      const isDragging = useRef(false);
      const lastMousePos = useRef({ x: 0, y: 0 });

      // Gesture state
      const gestureType = useRef<"pan" | "scroll" | null>(null);
      const gestureTimeout = useRef<number | null>(null);
      const activeScrollableElement = useRef<HTMLElement | null>(null);
      const lastZoomReportTime = useRef(0);

      // Force a re-render only when necessary (e.g. for cursor style)
      const [isGrabbing, setIsGrabbing] = useState(false);

      // Update transform directly on the DOM element
      const updateTransform = useCallback(() => {
        if (transformLayerRef.current) {
          transformLayerRef.current.style.transform = `translate3d(${pan.current.x}px, ${pan.current.y}px, 0) scale(${zoom.current})`;
        }
        // Update grid background if needed
        const grid = containerRef.current?.querySelector(
          ".grid-pattern"
        ) as HTMLElement;
        if (grid) {
          grid.style.backgroundSize = `${24 * zoom.current}px ${
            24 * zoom.current
          }px`;
          grid.style.backgroundPosition = `${pan.current.x}px ${pan.current.y}px`;
        }
      }, []);

      useImperativeHandle(ref, () => ({
        zoomIn: () => {
          zoom.current = Math.min(3, zoom.current + 0.1);
          updateTransform();
          if (onZoomChange) {
            onZoomChange(zoom.current);
          }
        },
        zoomOut: () => {
          zoom.current = Math.max(0.1, zoom.current - 0.1);
          updateTransform();
          if (onZoomChange) {
            onZoomChange(zoom.current);
          }
        },
        resetZoom: () => {
          zoom.current = 1;
          updateTransform();
          if (onZoomChange) {
            onZoomChange(zoom.current);
          }
        },
        center: () => {
          pan.current = { x: 100, y: 100 };
          updateTransform();
        },
      }));

      // Initial render
      useLayoutEffect(() => {
        updateTransform();
      }, [updateTransform]);

      // Mouse Down - Start Dragging
      const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        // Allow dragging if clicking on background or specific drag handles
        if (
          e.target === containerRef.current ||
          target.classList.contains("canvas-bg") ||
          target.classList.contains("grid-pattern")
        ) {
          isDragging.current = true;
          lastMousePos.current = { x: e.clientX, y: e.clientY };
          setIsGrabbing(true);
          e.preventDefault();
        }
      };

      // Global Mouse Move / Up for dragging
      useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
          if (!isDragging.current) return;

          e.preventDefault();
          const deltaX = e.clientX - lastMousePos.current.x;
          const deltaY = e.clientY - lastMousePos.current.y;

          pan.current = {
            x: pan.current.x + deltaX,
            y: pan.current.y + deltaY,
          };
          lastMousePos.current = { x: e.clientX, y: e.clientY };
          updateTransform();
        };

        const handleMouseUp = () => {
          if (isDragging.current) {
            isDragging.current = false;
            setIsGrabbing(false);
          }
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        return () => {
          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);
        };
      }, [updateTransform]);

      // Wheel Handler
      useEffect(() => {
        const node = containerRef.current;
        if (!node) return;

        const handleWheel = (event: WheelEvent) => {
          // Clear gesture timeout on every event
          if (gestureTimeout.current) {
            clearTimeout(gestureTimeout.current);
            gestureTimeout.current = null;
          }

          // 1. Determine Gesture Type if not locked
          if (gestureType.current === null) {
            // Check if starting over a scrollable element
            const targetElement = event.target as HTMLElement;
            const scrollableElement = targetElement.closest(
              ".overflow-y-auto"
            ) as HTMLElement;

            if (scrollableElement) {
              // Check if we can scroll in the requested direction
              const canScrollUp = scrollableElement.scrollTop > 0;
              const canScrollDown =
                scrollableElement.scrollTop <
                scrollableElement.scrollHeight - scrollableElement.clientHeight;

              const scrollingUp = event.deltaY < 0;
              const scrollingDown = event.deltaY > 0;

              // Heuristic: Is this mostly vertical scrolling?
              const isPrimarilyVertical =
                Math.abs(event.deltaY) > Math.abs(event.deltaX) * 2;

              if (
                isPrimarilyVertical &&
                ((scrollingUp && canScrollUp) ||
                  (scrollingDown && canScrollDown))
              ) {
                // It's a valid scroll on a scrollable element
                gestureType.current = "scroll";
                activeScrollableElement.current = scrollableElement;
              } else {
                // Boundary reached or horizontal -> Pan
                gestureType.current = "pan";
              }
            } else {
              // Not over scrollable -> Pan
              gestureType.current = "pan";
            }
          }

          // 2. Handle based on Gesture Type
          if (gestureType.current === "scroll") {
            // Allow default behavior (scrolling)
          } else {
            // gestureType === 'pan'
            // Prevent default scroll
            event.preventDefault();

            // Is it a pinch? (Ctrl/Meta key)
            const isPinch = event.ctrlKey || event.metaKey;

            if (isPinch) {
              // ZOOM
              const ZOOM_SPEED = 0.01;
              const rect = node.getBoundingClientRect();
              const mouseX = event.clientX - rect.left;
              const mouseY = event.clientY - rect.top;

              // scene = (screen - pan) / zoom
              const sceneX = (mouseX - pan.current.x) / zoom.current;
              const sceneY = (mouseY - pan.current.y) / zoom.current;

              const newZoom = Math.max(
                0.1,
                Math.min(3, zoom.current - event.deltaY * ZOOM_SPEED)
              );

              // newPan = screen - scene * newZoom
              const newPanX = mouseX - sceneX * newZoom;
              const newPanY = mouseY - sceneY * newZoom;

              zoom.current = newZoom;
              pan.current = { x: newPanX, y: newPanY };

              if (onZoomChange) {
                const now = Date.now();
                if (now - lastZoomReportTime.current > 50) {
                  onZoomChange(newZoom);
                  lastZoomReportTime.current = now;
                }
              }
            } else {
              // PAN
              pan.current = {
                x: pan.current.x - event.deltaX,
                y: pan.current.y - event.deltaY,
              };
            }

            updateTransform();
          }

          // 3. Set timeout to reset gesture
          gestureTimeout.current = window.setTimeout(() => {
            gestureType.current = null;
            activeScrollableElement.current = null;
            if (onZoomChange) onZoomChange(zoom.current);
          }, 150);
        };

        node.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
          node.removeEventListener("wheel", handleWheel);
          if (gestureTimeout.current) clearTimeout(gestureTimeout.current);
        };
      }, [updateTransform, onZoomChange]);

      return (
        <div
          ref={containerRef}
          className={`flex-1 relative overflow-hidden bg-[#09090b] canvas-bg ${
            isGrabbing ? "cursor-grabbing" : "cursor-grab"
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
            className="grid-pattern absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: `radial-gradient(#52525b 1px, transparent 1px)`,
              // Initial styles, will be updated by ref
              backgroundSize: `24px 24px`,
              backgroundPosition: `100px 100px`,
            }}
          />

          {/* Transform Layer */}
          <div
            ref={transformLayerRef}
            className="absolute top-0 left-0 w-0 h-0 pointer-events-none"
            style={{
              transform: `translate3d(100px, 100px, 0) scale(1)`,
              transformOrigin: "0 0",
              willChange: "transform",
            }}
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
                const startYBase = parentNode.y + 24;
                const endX = node.x;
                const endY = node.y + 22;

                const controlX1 = startX + 110;
                const controlX2 = endX - 90;
                const startY = startYBase;

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
                  style={{
                    transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                    willChange: "transform",
                  }}
                  comments={comments.filter(
                    (c) => c.path === node.data.filename
                  )}
                  onAnalyze={onAnalyze}
                  onAddComment={onAddComment}
                  onEditComment={onEditComment}
                  onDeleteComment={onDeleteComment}
                  onReplyComment={onReplyComment}
                  isSubmitting={isPosting}
                  currentUser="user"
                  onSize={onNodeSize}
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
        </div>
      );
    }
  )
);
