export type ProviderId = "openai" | "anthropic" | "gemini" | "deepseek" | "groq";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  deepseek: "DeepSeek",
  groq: "Groq",
};

export interface GenSettings {
  /** null = omit and use the provider default */
  temperature: number | null;
  /** null = omit where the provider allows it */
  maxTokens: number | null;
}

export interface GenerateRequest {
  provider: ProviderId;
  model: string;
  system: string;
  user: string;
  settings: GenSettings;
}

export interface GenerateResult {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  finishReason: string | null;
}

export type Rating = "good" | "ok" | "bad" | null;
export type RunStatus = "idle" | "running" | "done" | "error";

export interface RowOutput {
  status: RunStatus;
  /** What is shown. If the user edited it, this is their ideal. */
  text: string;
  /** The model's original output, set only once the user edits `text`. */
  original: string | null;
  error: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** The input the output was produced from. */
  inputSnapshot: string;
}

export interface Feedback {
  rating: Rating;
  comment: string;
}

export interface DiagnosisItem {
  pattern: string;
  rows: number[];
  root_cause: string;
}

export interface ChangeItem {
  change: string;
  reason: string;
  rows: number[];
}

export interface ImproverResult {
  status: "running" | "done" | "error";
  newPrompt: string;
  diagnosis: DiagnosisItem[];
  changes: ChangeItem[];
  risks: string[];
  questions: string[];
  raw: string;
  parseFailed: boolean;
  error: string | null;
  improverModel: string;
  createdAt: number;
}

export interface Version {
  id: string;
  n: number;
  prompt: string;
  provider: ProviderId | "";
  model: string;
  settings: GenSettings;
  outputs: Record<string, RowOutput>;
  feedback: Record<string, Feedback>;
  overallContext: string;
  improver: ImproverResult | null;
  createdAt: number;
}

export interface Row {
  id: string;
  input: string;
  holdout: boolean;
}

export interface Session {
  id: string;
  name: string;
  rows: Row[];
  versions: Version[];
  /** Index into versions currently shown. The last version is the editable one. */
  viewIndex: number;
  createdAt: number;
  updatedAt: number;
}

/* ---------- Improver API payload ---------- */

export interface ImproverTestCase {
  row: number;
  input: string;
  output: string;
  ideal: string | null;
  rating: Rating;
  comment: string;
  holdout: boolean;
}

export interface ImproverHistoryEntry {
  version: number;
  prompt: string;
  model: string;
  counts: { good: number; ok: number; bad: number; unrated: number };
  comments: { row: number; rating: Rating; comment: string; holdout: boolean }[];
  diagnosis: string[];
}

export interface ImproveRequest {
  provider: ProviderId;
  model: string;
  maxTokens: number | null;
  metaPrompt: string;
  currentPrompt: string;
  targetModel: string;
  testCases: ImproverTestCase[];
  overallContext: string;
  versionHistory: ImproverHistoryEntry[];
}

export interface ImproveParsed {
  diagnosis: DiagnosisItem[];
  new_prompt: string;
  changes: ChangeItem[];
  risks: string[];
  questions: string[];
}

export interface ImproveResponse {
  parsed: ImproveParsed | null;
  raw: string;
  error: string | null;
}
