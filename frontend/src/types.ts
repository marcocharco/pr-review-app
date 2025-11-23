export type FileStatus =
  | "added"
  | "removed"
  | "modified"
  | "renamed"
  | "related";

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
  referencesChecked?: boolean;
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

export interface FileNodeProps {
  node: Node;
  style: React.CSSProperties;
  zoom: number;
  onAnalyze?: (filename: string) => void;
  onSize?: (nodeId: string, height: number) => void;
  comments?: Comment[];
  onAddComment?: (
    filePath: string,
    body: string,
    lineNumber?: number,
    startLine?: number,
  ) => Promise<void>;
  onEditComment?: (commentId: number, body: string) => Promise<void>;
  onDeleteComment?: (commentId: number) => Promise<void>;
  onReplyComment?: (inReplyToId: number, body: string) => Promise<void>;
  isSubmitting?: boolean;
  currentUser?: string;
}
