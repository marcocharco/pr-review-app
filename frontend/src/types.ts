export type FileStatus = "added" | "removed" | "modified" | "renamed";

export interface FileData {
  filename: string;
  status: FileStatus;
  patch?: string;
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
}

export interface GitHubUser {
  login: string;
  name?: string;
  avatar_url: string;
  html_url: string;
}
