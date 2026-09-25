"use client";

import { create } from "zustand";
import { useStore } from "./store";
import { hasAnyOutput, runImprover, runRows } from "./runner";

/* Transient UI state, not persisted. */
interface UIState {
  drawerRowId: string | null;
  settingsOpen: boolean;
  showPrev: Record<string, boolean>;
  flashRow: string | null;
}

export const useUI = create<UIState>(() => ({ drawerRowId: null, settingsOpen: false, showPrev: {}, flashRow: null }));

function current() {
  const st = useStore.getState();
  const s = st.sessions[st.currentId];
  const i = Math.min(s.viewIndex, s.versions.length - 1);
  return { session: s, version: s.versions[i], isLatest: i === s.versions.length - 1 };
}

export function runAll() {
  const { version, isLatest } = current();
  if (!isLatest) return;
  void runRows(version.id);
}

export function canGenerate(): boolean {
  const { version, isLatest } = current();
  return isLatest && hasAnyOutput(version) && version.improver?.status !== "running";
}

export function generate() {
  const { version } = current();
  if (!canGenerate()) return;
  void runImprover(version.id);
}

/** Scroll a test row into view and flash it. `row` is 1-based, as shown in the UI. */
export function jumpToRow(row: number) {
  const { session } = current();
  const r = session.rows[row - 1];
  if (!r) return;
  document.querySelector(`[data-row-id="${r.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  useUI.setState({ flashRow: r.id });
  setTimeout(() => useUI.setState({ flashRow: null }), 1300);
}
