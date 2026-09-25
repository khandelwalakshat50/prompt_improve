"use client";

import { useStore } from "./store";
import type { GenerateResult, ImproveRequest, ImproveResponse, ImproverHistoryEntry, ImproverTestCase, Session, Version } from "./types";

/* ---------- concurrency gate shared by every run ---------- */

let active = 0;
const waiting: (() => void)[] = [];
const limit = () => Math.max(1, useStore.getState().concurrency);

function pump() {
  while (waiting.length && active < limit()) {
    active++;
    waiting.shift()!();
  }
}
function acquire(): Promise<void> {
  if (active < limit()) {
    active++;
    return Promise.resolve();
  }
  return new Promise((r) => waiting.push(r));
}
function release() {
  active--;
  pump();
}
// Raising the cap mid-run should start queued rows right away.
useStore.subscribe((s, p) => {
  if (s.concurrency !== p.concurrency) pump();
});

function findVersion(versionId: string): { session: Session; version: Version } | null {
  for (const session of Object.values(useStore.getState().sessions)) {
    const version = session.versions.find((v) => v.id === versionId);
    if (version) return { session, version };
  }
  return null;
}

async function postJSON<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const text = await res.text();
    let data: (T & { error?: string | null }) | null = null;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, data: null, error: `${res.status}: ${text.slice(0, 500) || res.statusText}` };
    }
    if (!res.ok || data?.error) return { ok: false, data, error: data?.error || `${res.status} ${res.statusText}` };
    return { ok: true, data, error: null };
  } catch (e) {
    return { ok: false, data: null, error: `Network error: ${(e as Error).message}` };
  }
}

async function runOne(versionId: string, rowId: string) {
  const { setOutput } = useStore.getState();
  await acquire();
  try {
    const found = findVersion(versionId);
    const row = found?.session.rows.find((r) => r.id === rowId);
    if (!found || !row) return;
    const v = found.version;
    const input = row.input;
    setOutput(versionId, rowId, { status: "running", error: null, text: "", original: null, inputSnapshot: input, latencyMs: null, inputTokens: null, outputTokens: null });
    const started = performance.now();
    const res = await postJSON<GenerateResult>("/api/generate", {
      provider: v.provider,
      model: v.model,
      system: v.prompt,
      user: input,
      settings: v.settings,
    });
    if (res.ok && res.data) {
      setOutput(versionId, rowId, {
        status: "done",
        text: res.data.text,
        original: null,
        error: null,
        latencyMs: res.data.latencyMs,
        inputTokens: res.data.inputTokens,
        outputTokens: res.data.outputTokens,
      });
    } else {
      setOutput(versionId, rowId, { status: "error", error: res.error, latencyMs: Math.round(performance.now() - started) });
    }
  } finally {
    release();
  }
}

/** Run rows for a version. With no rowIds, runs every non-empty input. Rows settle independently. */
export async function runRows(versionId: string, rowIds?: string[]): Promise<void> {
  const found = findVersion(versionId);
  if (!found) return;
  const { version, session } = found;
  if (!version.provider || !version.model) {
    alert("Pick a provider and model first.");
    return;
  }
  const rows = session.rows.filter((r) => (rowIds ? rowIds.includes(r.id) : true) && r.input.trim() !== "");
  const { setOutput } = useStore.getState();
  // Show every row as queued at once, so it's obvious what is about to run.
  for (const r of rows) {
    setOutput(versionId, r.id, { status: "running", error: null, text: "", original: null, inputSnapshot: r.input, latencyMs: null, inputTokens: null, outputTokens: null });
  }
  await Promise.allSettled(rows.map((r) => runOne(versionId, r.id)));
}

/* ---------- improver ---------- */

export function hasAnyOutput(v: Version): boolean {
  return Object.values(v.outputs).some((o) => o.status === "done" && o.text.trim() !== "");
}

function testCases(session: Session, v: Version): ImproverTestCase[] {
  const cases: ImproverTestCase[] = [];
  session.rows.forEach((r, i) => {
    const o = v.outputs[r.id];
    if (!o || o.status !== "done" || !(o.text.trim() || o.original)) return;
    const fb = v.feedback[r.id];
    cases.push({
      row: i + 1,
      input: o.inputSnapshot || r.input,
      output: o.original ?? o.text,
      ideal: o.original != null ? o.text : null,
      rating: fb?.rating ?? null,
      comment: fb?.comment ?? "",
      holdout: r.holdout,
    });
  });
  return cases;
}

function history(session: Session, index: number): ImproverHistoryEntry[] {
  return session.versions.slice(Math.max(0, index - 3), index).map((v) => {
    const counts = { good: 0, ok: 0, bad: 0, unrated: 0 };
    const comments: ImproverHistoryEntry["comments"] = [];
    session.rows.forEach((r, i) => {
      if (!v.outputs[r.id] || r.holdout) return;
      const fb = v.feedback[r.id];
      counts[fb?.rating ?? "unrated"]++;
      if (fb && (fb.comment.trim() || fb.rating)) comments.push({ row: i + 1, rating: fb.rating, comment: fb.comment, holdout: r.holdout });
    });
    return {
      version: v.n,
      prompt: v.prompt,
      model: v.provider ? `${v.provider}/${v.model}` : v.model,
      counts,
      comments,
      diagnosis: (v.improver?.diagnosis ?? []).map((d) => d.pattern).filter(Boolean),
    };
  });
}

export async function runImprover(versionId: string): Promise<void> {
  const st = useStore.getState();
  const found = findVersion(versionId);
  if (!found) return;
  const { session, version } = found;
  const { provider, model } = st.improver;
  if (!provider || !model) {
    alert("Pick an improver provider and model.");
    return;
  }
  const improverModel = `${provider}/${model}`;
  const prevResult = version.improver;
  st.setImprover(versionId, {
    status: "running",
    newPrompt: prevResult?.newPrompt ?? "",
    diagnosis: prevResult?.diagnosis ?? [],
    changes: prevResult?.changes ?? [],
    risks: prevResult?.risks ?? [],
    questions: prevResult?.questions ?? [],
    raw: prevResult?.raw ?? "",
    parseFailed: false,
    error: null,
    improverModel,
    createdAt: Date.now(),
  });

  const req: ImproveRequest = {
    provider,
    model,
    maxTokens: st.improverMaxTokens,
    metaPrompt: st.metaPrompt,
    currentPrompt: version.prompt,
    targetModel: version.provider ? `${version.provider}/${version.model}` : version.model,
    testCases: testCases(session, version),
    overallContext: version.overallContext,
    versionHistory: history(session, session.versions.findIndex((v) => v.id === versionId)),
  };

  const res = await postJSON<ImproveResponse>("/api/improve", req);
  const data = res.data;
  if (res.ok && data?.parsed) {
    const p = data.parsed;
    st.setImprover(versionId, {
      status: "done",
      newPrompt: p.new_prompt,
      diagnosis: p.diagnosis,
      changes: p.changes,
      risks: p.risks,
      questions: p.questions,
      raw: data.raw,
      parseFailed: false,
      error: null,
      improverModel,
      createdAt: Date.now(),
    });
  } else if (res.ok && data) {
    // Parsing failed twice: show the raw reply in the Prompt tab so nothing is lost.
    st.setImprover(versionId, {
      status: "done",
      newPrompt: data.raw,
      diagnosis: [],
      changes: [],
      risks: [],
      questions: [],
      raw: data.raw,
      parseFailed: true,
      error: null,
      improverModel,
      createdAt: Date.now(),
    });
  } else {
    st.setImprover(versionId, {
      ...(prevResult ?? { newPrompt: "", diagnosis: [], changes: [], risks: [], questions: [], raw: "", parseFailed: false }),
      status: "error",
      error: res.error,
      improverModel,
      createdAt: Date.now(),
    });
  }
}
