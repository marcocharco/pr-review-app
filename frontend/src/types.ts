export type FileStatus = "added" | "removed" | "modified" | "renamed" | "related";

export interface Reference {
  path: string;
  line: number;
  start: number;
  end: number;
  context: string;
}

export interface ChangedSpan {
  name: string;
  kind: string;
  start: number;
  end: number;
  refLine: number;
  refCol: number;
  references?: Reference[];
}

export interface FileData {
  filename: string;
  status: FileStatus;
  patch?: string;
  changedSpans?: ChangedSpan[];
  // For related files
  context?: string;
  referenceLine?: number;
}

export interface Node {
  id: string;
  x: number;
  y: number;
  data: FileData;
}

export interface FileNodeProps {
  node: Node;
  style: React.CSSProperties;
  onAnalyze?: (filename: string) => void;
  onSize?: (nodeId: string, height: number) => void;
}

export interface GitHubUser {
  login: string;
  name?: string;
  avatar_url: string;
  html_url: string;
}
