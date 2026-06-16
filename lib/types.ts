// lib/types.ts

export type Branch = "dev" | "staging" | "main";

export interface GitFile {
  id: number;
  name: string;
  content: string;
  current_branch: Branch;
  locked_by: string | null;
  sha: string | null;
  created_at: string;
  updated_at: string;
}

export interface GitPushRequestBody {
  fileId: number;
  fileName: string;
  content: string;
  actor: string;
  branch: Branch;
  githubRepo: string; // "owner/repo"
}

export interface GitPushResponse {
  success: boolean;
  message: string;
  steps: StepResult[];
  payload?: {
    prismaUpdated: boolean;
    githubSha: string | null;
    branch: string;
  };
  error?: string;
}

export interface StepResult {
  step: number;
  label: string;
  status: "ok" | "error";
  detail?: string;
  durationMs: number;
}
