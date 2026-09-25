"use client";

import { useStore } from "@/lib/store";
import { useModels } from "@/lib/models";
import { useUI } from "@/lib/ui";
import { DEFAULT_META_PROMPT } from "@/lib/defaults";
import { PROVIDER_LABELS } from "@/lib/types";
import { IconX } from "./icons";

export default function SettingsModal() {
  const metaPrompt = useStore((s) => s.metaPrompt);
  const maxTokens = useStore((s) => s.improverMaxTokens);
  const providers = useModels((s) => s.providers);
  const st = useStore.getState();
  const close = () => useUI.setState({ settingsOpen: false });
  const isDefault = metaPrompt === DEFAULT_META_PROMPT;

  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="modal" role="dialog" aria-label="Settings">
        <div className="drawer-head">
          <h3>Settings</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={close} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="drawer-body">
          <section>
            <div className="row-flex" style={{ marginBottom: 6 }}>
              <span className="section-label">Improver meta-prompt</span>
              {!isDefault && <span className="tag accent">Modified</span>}
              <span className="spacer" />
              <button className="btn sm" disabled={isDefault} onClick={() => confirm("Reset the meta-prompt to the default?") && st.setMetaPrompt(DEFAULT_META_PROMPT)}>
                Reset to default
              </button>
            </div>
            <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>
              The improver&apos;s system prompt. The user message is built from your session: current prompt, target model, test cases (holdout rows
              excluded), overall context and the last 3 versions.
            </p>
            <textarea value={metaPrompt} onChange={(e) => st.setMetaPrompt(e.target.value)} spellCheck={false} />
          </section>

          <section className="panel-row" style={{ alignItems: "flex-start", gap: 24 }}>
            <label className="field" style={{ width: 200 }}>
              Improver max output tokens
              <input type="number" min={256} step={1024} value={maxTokens} onChange={(e) => st.setImproverMaxTokens(Number(e.target.value))} />
            </label>
            <div className="field">
              Providers with a key in .env
              <div style={{ color: "var(--text)", fontSize: 12.5, paddingTop: 5 }}>
                {providers == null ? "Loading…" : providers.length ? providers.map((p) => PROVIDER_LABELS[p]).join(", ") : "None. Add keys to .env and restart."}
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
