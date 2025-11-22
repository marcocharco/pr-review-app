import type { FileStatus } from "../types";

export const getFileIcon = (filename: string): string => {
  if (filename.endsWith(".tsx") || filename.endsWith(".ts")) return "TS";
  if (filename.endsWith(".jsx") || filename.endsWith(".js")) return "JS";
  if (filename.endsWith(".py")) return "PY";
  if (filename.endsWith(".css")) return "#";
  if (filename.endsWith(".html")) return "<>";
  if (filename.endsWith(".json")) return "{}";
  return "FX";
};

export const getStatusColor = (status: FileStatus): string => {
  switch (status) {
    case "added":
      return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
    case "removed":
      return "text-rose-400 bg-rose-400/10 border-rose-400/20";
    case "modified":
      return "text-blue-400 bg-blue-400/10 border-blue-400/20";
    case "renamed":
      return "text-amber-400 bg-amber-400/10 border-amber-400/20";
    default:
      return "text-zinc-400 bg-zinc-800 border-zinc-700";
  }
};

