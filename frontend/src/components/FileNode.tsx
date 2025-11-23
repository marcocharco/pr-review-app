import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { FileNodeProps } from "../types";
import { getFileIcon, getStatusColor } from "../utils/fileUtils";

export const FileNode = ({
  node,
  style,
  onAnalyze,
  onSize,
}: FileNodeProps) => {
  const { data } = node;
  // Start minimized if related, otherwise expanded
  const [expanded, setExpanded] = useState(data.status !== "related");
  const rootRef = useRef<HTMLDivElement>(null);

  const diffLines = useMemo(() => {
    if (data.status === "related" && data.context) {
      return data.context.split("\n");
    }
    if (!data.patch) return ["Binary file or no changes shown."];
    return data.patch.split("\n");
  }, [data.patch, data.context, data.status]);

  // Report node height so the canvas can reflow around expand/collapse
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !onSize) return;

    const updateSize = () => {
      const height = Math.round(el.getBoundingClientRect().height);
      onSize(node.id, height);
    };

    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [node.id, onSize]);

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
      {expanded && data.status !== "related" && onAnalyze && !data.changedSpans && (
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

      {expanded && (
        <>
          {/* Diff Content */}
          <div className="bg-[#09090b] min-h-[150px] max-h-[400px] overflow-y-auto custom-scrollbar relative font-mono text-xs">
            <div className="py-2">
              {diffLines.map((line: string, i: number) => {
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

                let bgClass = "bg-transparent";
                let textClass = "text-zinc-400";

                if (line.startsWith("+")) {
                  bgClass = "bg-emerald-900/20";
                  textClass = "text-emerald-400";
                } else if (line.startsWith("-")) {
                  bgClass = "bg-rose-900/20";
                  textClass = "text-rose-400";
                } else if (line.startsWith("@@")) {
                  textClass = "text-blue-400";
                }

                return (
                  <div
                    key={i}
                    className={`${bgClass} px-4 py-0.5 whitespace-pre w-full border-l-2 ${
                      line.startsWith("+")
                        ? "border-emerald-500"
                        : line.startsWith("-")
                          ? "border-rose-500"
                          : "border-transparent"
                    }`}
                  >
                    <span className={`${textClass} inline-block w-full`}>
                      {line}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
