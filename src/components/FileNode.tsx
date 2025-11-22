import { useState, useMemo } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { FileNodeProps } from "../types";
import { getFileIcon, getStatusColor } from "../utils/fileUtils";

export const FileNode = ({ node, style }: FileNodeProps) => {
  const [expanded, setExpanded] = useState(true);

  const { data } = node;

  const diffLines = useMemo(() => {
    if (!data.patch) return ["Binary file or no changes shown."];
    return data.patch.split("\n");
  }, [data.patch]);

  return (
    <div
      style={style}
      className={`absolute rounded-md border border-[#27272a] bg-[#18181b] w-[500px] shadow-2xl shadow-black/50 flex flex-col transition-all duration-200 ${
        expanded ? "h-auto" : "h-12 overflow-hidden"
      } ${data.status === "removed" ? "opacity-60" : ""}`}
    >
      {/* Header */}
      <div
        className="h-12 px-4 border-b border-[#27272a] flex items-center justify-between cursor-pointer hover:bg-[#27272a] transition-colors group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div
            className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold font-mono tracking-tighter ${getStatusColor(
              data.status
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
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider ${getStatusColor(
              data.status
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

      {expanded && (
        <>
          {/* Diff Content */}
          <div className="bg-[#09090b] min-h-[150px] max-h-[400px] overflow-y-auto custom-scrollbar relative font-mono text-xs">
            <div className="py-2">
              {diffLines.map((line: string, i: number) => {
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

