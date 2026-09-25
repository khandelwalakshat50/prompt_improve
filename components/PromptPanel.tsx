"use client";

import { useStore, useViewed } from "@/lib/store";
import { approxTokens, fmtNum } from "@/lib/format";
import ModelPicker from "./ModelPicker";

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function PromptPanel() {
  const { session, version, isLatest } = useViewed();
  const st = useStore.getState();
  const ro = !isLatest;

  return (
    <div className="panel">
      <ModelPicker
        provider={version.provider}
        model={version.model}
        disabled={ro}
        onChange={(provider, model) => st.updateVersion(version.id, { provider, model })}
      />

      <div className="panel-row">
        <label className="field" title="Leave blank to use the provider default">
          Temperature
          <input
            type="number"
            step={0.1}
            min={0}
            max={2}
            placeholder="default"
            readOnly={ro}
            value={version.settings.temperature ?? ""}
            onChange={(e) => st.updateVersion(version.id, { settings: { ...version.settings, temperature: numOrNull(e.target.value) } })}
          />
        </label>
        <label className="field" title="Leave blank to use the provider default (Anthropic requires a value; 4096 is used)">
          Max tokens
          <input
            type="number"
            step={256}
            min={1}
            placeholder="default"
            readOnly={ro}
            value={version.settings.maxTokens ?? ""}
            onChange={(e) => st.updateVersion(version.id, { settings: { ...version.settings, maxTokens: numOrNull(e.target.value) } })}
          />
        </label>
        <label className="field" style={{ flex: "0 0 auto" }}>
          Version
          <select value={session.viewIndex} onChange={(e) => st.setViewIndex(Number(e.target.value))}>
            {session.versions.map((v, i) => (
              <option key={v.id} value={i}>
                v{v.n}
                {i === session.versions.length - 1 ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {ro && (
        <div className="banner">
          <span className="grow">Viewing v{version.n}, read-only.</span>
          <button className="btn sm" onClick={() => st.restoreVersion(session.viewIndex)} title="Copy this version to a new current version">
            Restore as current
          </button>
          <button className="btn sm ghost" onClick={() => st.setViewIndex(session.versions.length - 1)}>
            Back to v{session.versions[session.versions.length - 1].n}
          </button>
        </div>
      )}

      <div className="fill">
        <textarea
          value={version.prompt}
          readOnly={ro}
          placeholder="Write the system prompt here. Each input is sent as the user message."
          onChange={(e) => st.updateVersion(version.id, { prompt: e.target.value })}
          spellCheck={false}
        />
        <div className="counts">
          <span>{version.prompt.length.toLocaleString()} chars</span>
          <span>~{fmtNum(approxTokens(version.prompt))} tokens</span>
        </div>
      </div>
    </div>
  );
}
