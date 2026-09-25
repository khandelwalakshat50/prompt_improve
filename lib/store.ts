"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_CONCURRENCY, DEFAULT_IMPROVER_MAX_TOKENS, DEFAULT_META_PROMPT, DEFAULT_ROWS, DEFAULT_TEST_MAX_TOKENS } from "./defaults";
import { uid } from "./format";
import type { Feedback, ImproverResult, ProviderId, Row, RowOutput, Session, Version } from "./types";

export type ColKey = "inputs" | "prompt" | "outputs" | "feedback" | "context" | "newprompt";

export interface Layout {
  /** Fractions of the grid width. */
  widths: Record<ColKey, number>;
  collapsed: Record<ColKey, boolean>;
}

export const DEFAULT_LAYOUT: Layout = {
  widths: { inputs: 0.17, prompt: 0.19, outputs: 0.22, feedback: 0.13, context: 0.13, newprompt: 0.16 },
  collapsed: { inputs: false, prompt: false, outputs: false, feedback: false, context: false, newprompt: false },
};

interface State {
  sessions: Record<string, Session>;
  order: string[];
  currentId: string;
  concurrency: number;
  metaPrompt: string;
  improverMaxTokens: number;
  improver: { provider: ProviderId | ""; model: string };
  lastTest: { provider: ProviderId | ""; model: string };
  layout: Layout;
}

interface Actions {
  // sessions
  createSession: (name?: string) => void;
  renameSession: (id: string, name: string) => void;
  duplicateSession: (id: string) => void;
  deleteSession: (id: string) => void;
  selectSession: (id: string) => void;
  importSession: (s: Session) => void;
  // rows
  setInput: (rowId: string, input: string) => void;
  toggleHoldout: (rowId: string) => void;
  addRow: () => void;
  removeRow: (rowId?: string) => void;
  clearInputs: () => void;
  fillFrom: (rowIndex: number, items: string[]) => void;
  // versions
  updateVersion: (versionId: string, patch: Partial<Version>) => void;
  setOutput: (versionId: string, rowId: string, patch: Partial<RowOutput>) => void;
  editOutput: (versionId: string, rowId: string, text: string) => void;
  revertOutput: (versionId: string, rowId: string) => void;
  setFeedback: (versionId: string, rowId: string, patch: Partial<Feedback>) => void;
  setImprover: (versionId: string, r: ImproverResult | null) => void;
  setViewIndex: (i: number) => void;
  restoreVersion: (index: number) => void;
  promote: (prompt: string) => string;
  // global
  setConcurrency: (n: number) => void;
  setMetaPrompt: (p: string) => void;
  setImproverMaxTokens: (n: number) => void;
  setImproverChoice: (provider: ProviderId | "", model: string) => void;
  setLayout: (l: Partial<Layout>) => void;
}

function newVersion(n: number, from?: Partial<Version>): Version {
  return {
    id: uid(),
    n,
    prompt: from?.prompt ?? "",
    provider: from?.provider ?? "",
    model: from?.model ?? "",
    settings: from?.settings ?? { temperature: null, maxTokens: DEFAULT_TEST_MAX_TOKENS },
    outputs: from?.outputs ?? {},
    feedback: from?.feedback ?? {},
    overallContext: from?.overallContext ?? "",
    improver: from?.improver ?? null,
    createdAt: Date.now(),
  };
}

function newRows(n: number): Row[] {
  return Array.from({ length: n }, () => ({ id: uid(), input: "", holdout: false }));
}

function newSession(name: string, test?: State["lastTest"]): Session {
  const now = Date.now();
  return {
    id: uid(),
    name,
    rows: newRows(DEFAULT_ROWS),
    versions: [newVersion(1, { provider: test?.provider ?? "", model: test?.model ?? "" })],
    viewIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
}

const first = newSession("Untitled prompt");

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => {
      /** Update the current session immutably. */
      const mutSession = (fn: (s: Session) => Session) =>
        set((st) => {
          const s = st.sessions[st.currentId];
          if (!s) return st;
          return { sessions: { ...st.sessions, [s.id]: { ...fn(s), updatedAt: Date.now() } } };
        });

      /** Update a version by id, searching every session (runs can finish after a session switch). */
      const mutVersion = (versionId: string, fn: (v: Version) => Version) =>
        set((st) => {
          for (const s of Object.values(st.sessions)) {
            const i = s.versions.findIndex((v) => v.id === versionId);
            if (i === -1) continue;
            const versions = s.versions.slice();
            versions[i] = fn(versions[i]);
            return { sessions: { ...st.sessions, [s.id]: { ...s, versions, updatedAt: Date.now() } } };
          }
          return st;
        });

      return {
        sessions: { [first.id]: first },
        order: [first.id],
        currentId: first.id,
        concurrency: DEFAULT_CONCURRENCY,
        metaPrompt: DEFAULT_META_PROMPT,
        improverMaxTokens: DEFAULT_IMPROVER_MAX_TOKENS,
        improver: { provider: "", model: "" },
        lastTest: { provider: "", model: "" },
        layout: DEFAULT_LAYOUT,

        createSession: (name) =>
          set((st) => {
            const s = newSession(name?.trim() || `Prompt ${st.order.length + 1}`, st.lastTest);
            return { sessions: { ...st.sessions, [s.id]: s }, order: [...st.order, s.id], currentId: s.id };
          }),
        renameSession: (id, name) =>
          set((st) => (st.sessions[id] ? { sessions: { ...st.sessions, [id]: { ...st.sessions[id], name } } } : st)),
        duplicateSession: (id) =>
          set((st) => {
            const src = st.sessions[id];
            if (!src) return st;
            const copy: Session = JSON.parse(JSON.stringify(src));
            copy.id = uid();
            copy.name = `${src.name} (copy)`;
            copy.versions = copy.versions.map((v) => ({ ...v, id: uid() }));
            copy.createdAt = copy.updatedAt = Date.now();
            const order = st.order.slice();
            order.splice(order.indexOf(id) + 1, 0, copy.id);
            return { sessions: { ...st.sessions, [copy.id]: copy }, order, currentId: copy.id };
          }),
        deleteSession: (id) =>
          set((st) => {
            const sessions = { ...st.sessions };
            delete sessions[id];
            let order = st.order.filter((x) => x !== id);
            if (!order.length) {
              const s = newSession("Untitled prompt", st.lastTest);
              sessions[s.id] = s;
              order = [s.id];
            }
            const currentId = st.currentId === id ? order[Math.max(0, st.order.indexOf(id) - 1)] ?? order[0] : st.currentId;
            return { sessions, order, currentId: sessions[currentId] ? currentId : order[0] };
          }),
        selectSession: (id) => set((st) => (st.sessions[id] ? { currentId: id } : st)),
        importSession: (s) =>
          set((st) => {
            const copy: Session = { ...s, id: uid(), updatedAt: Date.now() };
            copy.versions = copy.versions.map((v) => ({ ...v, id: uid(), outputs: settleOutputs(v.outputs), improver: settleImprover(v.improver) }));
            copy.viewIndex = Math.min(Math.max(0, copy.viewIndex ?? copy.versions.length - 1), copy.versions.length - 1);
            if (st.sessions[s.id] || st.order.some((id) => st.sessions[id]?.name === s.name)) copy.name = `${s.name} (imported)`;
            return { sessions: { ...st.sessions, [copy.id]: copy }, order: [...st.order, copy.id], currentId: copy.id };
          }),

        setInput: (rowId, input) =>
          mutSession((s) => ({ ...s, rows: s.rows.map((r) => (r.id === rowId ? { ...r, input } : r)) })),
        toggleHoldout: (rowId) =>
          mutSession((s) => ({ ...s, rows: s.rows.map((r) => (r.id === rowId ? { ...r, holdout: !r.holdout } : r)) })),
        addRow: () => mutSession((s) => ({ ...s, rows: [...s.rows, ...newRows(1)] })),
        removeRow: (rowId) =>
          mutSession((s) => {
            if (s.rows.length <= 1) return s;
            return { ...s, rows: rowId ? s.rows.filter((r) => r.id !== rowId) : s.rows.slice(0, -1) };
          }),
        clearInputs: () => mutSession((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r, input: "" })) })),
        fillFrom: (rowIndex, items) =>
          mutSession((s) => {
            const rows = s.rows.slice();
            const need = rowIndex + items.length - rows.length;
            if (need > 0) rows.push(...newRows(need));
            items.forEach((text, k) => {
              rows[rowIndex + k] = { ...rows[rowIndex + k], input: text };
            });
            return { ...s, rows };
          }),

        updateVersion: (versionId, patch) => {
          mutVersion(versionId, (v) => ({ ...v, ...patch }));
          if (patch.provider !== undefined || patch.model !== undefined) {
            const s = get().sessions[get().currentId];
            const v = s?.versions.find((x) => x.id === versionId);
            if (v) set({ lastTest: { provider: v.provider, model: v.model } });
          }
        },
        setOutput: (versionId, rowId, patch) =>
          mutVersion(versionId, (v) => ({
            ...v,
            outputs: { ...v.outputs, [rowId]: { ...(v.outputs[rowId] ?? emptyOutput()), ...patch } },
          })),
        editOutput: (versionId, rowId, text) =>
          mutVersion(versionId, (v) => {
            const cur = v.outputs[rowId] ?? emptyOutput();
            const original = cur.original ?? cur.text;
            // Editing back to exactly the model's output clears the "ideal" tag.
            const next: RowOutput = text === original ? { ...cur, text, original: null } : { ...cur, text, original };
            return { ...v, outputs: { ...v.outputs, [rowId]: next } };
          }),
        revertOutput: (versionId, rowId) =>
          mutVersion(versionId, (v) => {
            const cur = v.outputs[rowId];
            if (!cur || cur.original == null) return v;
            return { ...v, outputs: { ...v.outputs, [rowId]: { ...cur, text: cur.original, original: null } } };
          }),
        setFeedback: (versionId, rowId, patch) =>
          mutVersion(versionId, (v) => ({
            ...v,
            feedback: { ...v.feedback, [rowId]: { ...(v.feedback[rowId] ?? { rating: null, comment: "" }), ...patch } },
          })),
        setImprover: (versionId, r) => mutVersion(versionId, (v) => ({ ...v, improver: r })),
        setViewIndex: (i) => mutSession((s) => ({ ...s, viewIndex: Math.min(Math.max(0, i), s.versions.length - 1) })),
        restoreVersion: (index) =>
          mutSession((s) => {
            const src = s.versions[index];
            if (!src) return s;
            const copy = JSON.parse(JSON.stringify(src)) as Version;
            const v = newVersion(s.versions.length + 1, { ...copy, outputs: settleOutputs(copy.outputs), improver: settleImprover(copy.improver) });
            return { ...s, versions: [...s.versions, v], viewIndex: s.versions.length };
          }),
        promote: (prompt) => {
          let id = "";
          mutSession((s) => {
            const cur = s.versions[s.versions.length - 1];
            const v = newVersion(s.versions.length + 1, {
              prompt,
              provider: cur.provider,
              model: cur.model,
              settings: { ...cur.settings },
              overallContext: cur.overallContext,
            });
            id = v.id;
            return { ...s, versions: [...s.versions, v], viewIndex: s.versions.length };
          });
          return id;
        },

        setConcurrency: (n) => set({ concurrency: Math.min(50, Math.max(1, Math.round(n) || 1)) }),
        setMetaPrompt: (p) => set({ metaPrompt: p }),
        setImproverMaxTokens: (n) => set({ improverMaxTokens: Math.max(256, Math.round(n) || DEFAULT_IMPROVER_MAX_TOKENS) }),
        setImproverChoice: (provider, model) => set({ improver: { provider, model } }),
        setLayout: (l) => set((st) => ({ layout: { ...st.layout, ...l } })),
      };
    },
    {
      name: "prompt-lab:v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      onRehydrateStorage: () => (state) => {
        // A reload kills in-flight requests. Mark them so the row offers a Retry instead of spinning forever.
        if (!state) return;
        const sessions: Record<string, Session> = {};
        for (const [id, s] of Object.entries(state.sessions)) {
          sessions[id] = { ...s, versions: s.versions.map((v) => ({ ...v, outputs: settleOutputs(v.outputs), improver: settleImprover(v.improver) })) };
        }
        useStore.setState({ sessions, layout: { ...DEFAULT_LAYOUT, ...state.layout } });
        if (!sessions[state.currentId]) useStore.setState({ currentId: state.order[0] });
      },
    },
  ),
);

export function emptyOutput(): RowOutput {
  return { status: "idle", text: "", original: null, error: null, latencyMs: null, inputTokens: null, outputTokens: null, inputSnapshot: "" };
}

function settleOutputs(outputs: Record<string, RowOutput>): Record<string, RowOutput> {
  const out: Record<string, RowOutput> = {};
  for (const [k, o] of Object.entries(outputs ?? {})) {
    out[k] = o.status === "running" ? { ...o, status: "error", error: "Interrupted (page reloaded). Retry to run again." } : o;
  }
  return out;
}

function settleImprover(r: ImproverResult | null): ImproverResult | null {
  return r && r.status === "running" ? { ...r, status: "error", error: "Interrupted (page reloaded). Regenerate to try again." } : r;
}

/* ---------- selectors ---------- */

export function useSession(): Session {
  return useStore((st) => st.sessions[st.currentId] ?? st.sessions[st.order[0]]);
}

export function useViewed(): { session: Session; version: Version; isLatest: boolean; prev: Version | null } {
  const session = useSession();
  const i = Math.min(session.viewIndex, session.versions.length - 1);
  return {
    session,
    version: session.versions[i],
    isLatest: i === session.versions.length - 1,
    prev: i > 0 ? session.versions[i - 1] : null,
  };
}
