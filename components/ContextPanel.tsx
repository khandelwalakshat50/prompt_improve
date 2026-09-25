"use client";

import { useStore, useViewed } from "@/lib/store";
import { hasAnyOutput } from "@/lib/runner";
import { generate } from "@/lib/ui";
import ModelPicker from "./ModelPicker";
import { MOD } from "./TopBar";

export default function ContextPanel() {
  const { session, version, isLatest } = useViewed();
  const improver = useStore((s) => s.improver);
  const st = useStore.getState();
  const running = version.improver?.status === "running";
  const anyOutput = hasAnyOutput(version);

  const withOutput = session.rows.filter((r) => version.outputs[r.id]?.status === "done");
  const sent = withOutput.filter((r) => !r.holdout).length;
  const held = withOutput.length - sent;

  let hint = `Sends ${sent} row${sent === 1 ? "" : "s"}`;
  if (held) hint += `, excludes ${held} holdout`;
  hint += ` · ${MOD}+Shift+Enter`;
  if (!isLatest) hint = "Viewing an old version. Restore it to generate.";
  else if (!anyOutput) hint = "Run the inputs first. Needs at least one output.";

  return (
    <div className="panel">
      <div className="fill">
        <div className="section-label" style={{ marginBottom: 6 }}>
          Why it falls short
        </div>
        <textarea
          className="plain"
          value={version.overallContext}
          readOnly={!isLatest}
          onChange={(e) => st.updateVersion(version.id, { overallContext: e.target.value })}
          placeholder={
            "The big picture for the improver:\n\n• Why the current prompt falls short\n• What the prompt is for\n• Who reads the output\n• What great looks like\n• Hard constraints (length, format, must/never)"
          }
        />
      </div>

      <div className="subtle-box">
        <div className="section-label">Improver model</div>
        <ModelPicker provider={improver.provider} model={improver.model} onChange={(p, m) => st.setImproverChoice(p, m)} />
      </div>

      <div>
        <button className="btn primary big" onClick={generate} disabled={!isLatest || !anyOutput || running || !improver.model}>
          {running ? "Generating…" : "Generate Better Prompt"}
        </button>
        <div className="faint" style={{ fontSize: 11.5, marginTop: 6, textAlign: "center" }}>
          {hint}
        </div>
      </div>
    </div>
  );
}
