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
  avatar_url: string;
  html_url: string;
  name?: string;
}

export type CommentType = "line" | "selection" | "file";

export interface Comment {
  id: number;
  path: string;
  line?: number;
  startLine?: number;
  side: "LEFT" | "RIGHT";
  body: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  commit_id: string;
  in_reply_to_id?: number;

  // Frontend derived
  type: CommentType;
  replies: Comment[];
}
