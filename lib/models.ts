"use client";

import { create } from "zustand";
import type { ProviderId } from "./types";

/* Live provider/model lists, cached in memory for this browser session. */

interface ModelEntry {
  status: "loading" | "ready" | "error";
  models: string[];
  error: string | null;
}

interface ModelsState {
  providers: ProviderId[] | null;
  providersError: string | null;
  models: Partial<Record<ProviderId, ModelEntry>>;
}

export const useModels = create<ModelsState>(() => ({ providers: null, providersError: null, models: {} }));

let providersPromise: Promise<void> | null = null;

export function loadProviders(): Promise<void> {
  if (!providersPromise) {
    providersPromise = fetch("/api/providers")
      .then((r) => r.json())
      .then((j) => useModels.setState({ providers: j.providers ?? [], providersError: null }))
      .catch((e) => {
        providersPromise = null;
        useModels.setState({ providers: [], providersError: String(e) });
      });
  }
  return providersPromise;
}

export async function loadModels(provider: ProviderId, force = false): Promise<void> {
  const cur = useModels.getState().models[provider];
  if (!force && cur && cur.status !== "error") return;
  useModels.setState((s) => ({ models: { ...s.models, [provider]: { status: "loading", models: cur?.models ?? [], error: null } } }));
  try {
    const res = await fetch(`/api/models?provider=${provider}`);
    const j = await res.json();
    if (!res.ok || j.error) throw new Error(j.error || `${res.status}`);
    useModels.setState((s) => ({ models: { ...s.models, [provider]: { status: "ready", models: j.models ?? [], error: null } } }));
  } catch (e) {
    useModels.setState((s) => ({ models: { ...s.models, [provider]: { status: "error", models: [], error: (e as Error).message } } }));
  }
}
