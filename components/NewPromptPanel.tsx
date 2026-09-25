"use client";

import { useMemo, useState } from "react";
import { useStore, useViewed } from "@/lib/store";
import { runImprover, runRows } from "@/lib/runner";
import { lineDiff } from "@/lib/diff";
import { jumpToRow } from "@/lib/ui";
import { approxTokens, fmtNum } from "@/lib/format";
import { IconCopy } from "./icons";

type Tab = "prompt" | "diff" | "diagnosis" | "changes" | "risks";

function RowRefs({ rows }: { rows: number[] }) {
  if (!rows.length) return null;
  return (
    <div className="rowrefs">
      {rows.map((r) => (
        <button key={r} className="rowref" onClick={() => jumpToRow(r)} title={`Jump to row ${r}`}>
          #{r}
        </button>
      ))}
    </div>
  );
}

export default function NewPromptPanel() {
  const { session, version, isLatest } = useViewed();
  const st = useStore.getState();
  const [tab, setTab] = useState<Tab>("prompt");
  const [copied, setCopied] = useState(false);
  const r = version.improver;
  const running = r?.status === "running";
  const nextN = session.versions.length + 1;

  const diff = useMemo(() => (r ? lineDiff(version.prompt, r.newPrompt) : []), [r, version.prompt]);
  const adds = diff.filter((d) => d.type === "add").length;
  const dels = diff.filter((d) => d.type === "del").length;

  const copy = async () => {
    if (!r) return;
    try {
      await navigator.clipboard.writeText(r.newPrompt);
    } catch {
      const t = document.createElement("textarea");
      t.value = r.newPrompt;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const promote = () => {
    if (!r?.newPrompt.trim()) return;
    const id = st.promote(r.newPrompt);
    if (id) void runRows(id);
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "prompt", label: "Prompt" },
    { key: "diff", label: "Diff" },
    { key: "diagnosis", label: "Diagnosis", count: r?.diagnosis.length },
    { key: "changes", label: "Changes", count: r?.changes.length },
    { key: "risks", label: "Risks & questions", count: r ? r.risks.length + r.questions.length : undefined },
  ];

  let body: React.ReactNode;
  if (!r) {
    body = (
      <div className="empty">
        Run your inputs, rate the outputs and describe what&apos;s wrong.
        <br />
        Then hit <b>Generate Better Prompt</b>.
      </div>
    );
  } else if (tab === "prompt") {
    body = (
      <div className="fill" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 200 }}>
        {r.parseFailed && (
          <div className="banner warn" style={{ marginBottom: 8 }}>
            The improver did not return valid JSON, even after a retry. Its raw reply is below.
          </div>
        )}
        <textarea
          style={{ flex: 1 }}
          value={r.newPrompt}
          readOnly={running}
          onChange={(e) => st.setImprover(version.id, { ...r, newPrompt: e.target.value })}
          spellCheck={false}
        />
        <div className="counts">
          <span>{r.newPrompt.length.toLocaleString()} chars</span>
          <span>~{fmtNum(approxTokens(r.newPrompt))} tokens</span>
        </div>
      </div>
    );
  } else if (tab === "diff") {
    body = (
      <>
        <div className="diffstat">
          vs v{version.n}: <span className="a">+{adds}</span> <span className="d">−{dels}</span> lines
        </div>
        <div className="diff">
          {diff.map((d, i) => (
            <div key={i} className={`dl ${d.type}`}>
              <span className="gut">{d.type === "add" ? "+" : d.type === "del" ? "−" : ""}</span>
              <span className="txt">{d.text}</span>
            </div>
          ))}
        </div>
      </>
    );
  } else if (tab === "diagnosis") {
    body = r.diagnosis.length ? (
      <div className="cards">
        {r.diagnosis.map((d, i) => (
          <div key={i} className="card">
            <h4>{d.pattern}</h4>
            <RowRefs rows={d.rows} />
            <div className="k">Root cause</div>
            <p>{d.root_cause}</p>
          </div>
        ))}
      </div>
    ) : (
      <div className="empty">No diagnosis returned.</div>
    );
  } else if (tab === "changes") {
    body = r.changes.length ? (
      <div className="cards">
        {r.changes.map((c, i) => (
          <div key={i} className="card">
            <h4>{c.change}</h4>
            <RowRefs rows={c.rows} />
            <div className="k">Why</div>
            <p>{c.reason}</p>
          </div>
        ))}
      </div>
    ) : (
      <div className="empty">No changes listed.</div>
    );
  } else {
    body = (
      <div className="cards">
        <div className="card">
          <div className="k">Risks: what might break</div>
          {r.risks.length ? (
            <ul className="list">
              {r.risks.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="faint">None listed.</p>
          )}
        </div>
        <div className="card">
          <div className="k">Questions: decisions needed from you</div>
          {r.questions.length ? (
            <ul className="list">
              {r.questions.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="faint">None.</p>
          )}
          {r.questions.length > 0 && <p className="faint" style={{ fontSize: 11.5 }}>Answer these in Overall context, then Regenerate.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? "on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.count ? <span className="count">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {running && <div className="banner warn">Improving with {r?.improverModel}… this can take a minute.</div>}
      {r?.status === "error" && <div className="banner err">Improver failed: {r.error}</div>}

      <div className="tabbody">{body}</div>

      <div className="actions">
        <button className="btn primary" style={{ justifyContent: "center" }} onClick={promote} disabled={!r?.newPrompt.trim() || running}>
          Use as v{nextN} &amp; re-run
        </button>
        <div className="row-flex">
          <button className="btn grow" style={{ justifyContent: "center" }} onClick={copy} disabled={!r?.newPrompt}>
            <IconCopy /> {copied ? "Copied" : "Copy"}
          </button>
          <button
            className="btn grow"
            style={{ justifyContent: "center" }}
            onClick={() => runImprover(version.id)}
            disabled={!r || running || !isLatest}
            title={isLatest ? "Run the improver again" : "Viewing an old version"}
          >
            Regenerate
          </button>
        </div>
        {r && !running && <div className="faint" style={{ fontSize: 11 }}>by {r.improverModel}</div>}
      </div>
    </div>
  );
}
