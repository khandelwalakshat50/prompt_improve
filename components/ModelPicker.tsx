"use client";

import { useEffect, useState } from "react";
import { loadModels, useModels } from "@/lib/models";
import { PROVIDER_LABELS, type ProviderId } from "@/lib/types";
import { IconRerun } from "./icons";

const CUSTOM = "__custom__";

export default function ModelPicker({
  provider,
  model,
  onChange,
  disabled,
}: {
  provider: ProviderId | "";
  model: string;
  onChange: (provider: ProviderId | "", model: string) => void;
  disabled?: boolean;
}) {
  const providers = useModels((s) => s.providers);
  const entry = useModels((s) => (provider ? s.models[provider] : undefined));
  const [custom, setCustom] = useState(false);

  // Default to the first configured provider.
  useEffect(() => {
    if (disabled || !providers?.length) return;
    if (!provider || !providers.includes(provider)) onChange(providers[0], provider && providers.includes(provider) ? model : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, provider, disabled]);

  // Fetch the live model list when the provider changes (cached for the session).
  useEffect(() => {
    if (provider) void loadModels(provider);
  }, [provider]);

  // Pick the first model when none is set.
  useEffect(() => {
    if (disabled || custom || model || entry?.status !== "ready" || !entry.models.length) return;
    onChange(provider, entry.models[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, model, disabled, custom]);

  const inList = !!entry?.models.includes(model);
  const showCustom = custom || (entry?.status === "ready" && !!model && !inList);

  if (providers && providers.length === 0) {
    return <div className="banner err">No API keys found. Add at least one key to .env and restart the server.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div className="panel-row picker-row">
        <label className="field">
          Provider
          <select
            value={provider}
            disabled={disabled}
            onChange={(e) => {
              setCustom(false);
              onChange(e.target.value as ProviderId, "");
            }}
          >
            {!providers && <option value={provider}>{provider ? PROVIDER_LABELS[provider] : "Loading…"}</option>}
            {providers?.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="row-flex">
            Model
            {entry?.status === "loading" && <span className="faint">loading…</span>}
            <span className="spacer" />
          </span>
          <span className="row-flex">
            <select
              className="grow"
              value={showCustom ? CUSTOM : model}
              disabled={disabled || !provider}
              onChange={(e) => {
                if (e.target.value === CUSTOM) {
                  setCustom(true);
                } else {
                  setCustom(false);
                  onChange(provider, e.target.value);
                }
              }}
            >
              {!inList && !showCustom && <option value={model}>{model || (entry?.status === "loading" ? "Loading…" : "Select a model")}</option>}
              {entry?.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={CUSTOM}>Custom model ID…</option>
            </select>
            <button
              className="icon-btn"
              disabled={!provider}
              onClick={() => provider && loadModels(provider, true)}
              title="Refresh model list from the provider"
              aria-label="Refresh models"
            >
              <IconRerun />
            </button>
          </span>
        </label>
      </div>
      {showCustom && (
        <input
          type="text"
          className="mono"
          value={model}
          disabled={disabled}
          placeholder="Custom model ID, e.g. my-fine-tune"
          onChange={(e) => onChange(provider, e.target.value.trim())}
          autoFocus={custom && !model}
        />
      )}
      {entry?.status === "error" && <div className="banner err">Could not list models: {entry.error}</div>}
    </div>
  );
}
