"use client";

import { useStore, useViewed } from "@/lib/store";
import { runRows } from "@/lib/runner";
import { useUI } from "@/lib/ui";
import { OutputMeta, RatingChips, StatusBadge } from "./Cells";
import { IconRerun, IconX } from "./icons";

/** Full view of one row: input, output, previous output and feedback. */
export default function Drawer({ rowId }: { rowId: string }) {
  const { session, version, isLatest, prev } = useViewed();
  const st = useStore.getState();
  const index = session.rows.findIndex((r) => r.id === rowId);
  const row = session.rows[index];
  const close = () => useUI.setState({ drawerRowId: null });
  if (!row) return null;
  const o = version.outputs[row.id];
  const fb = version.feedback[row.id];
  const prevOut = prev?.outputs[row.id];
  const go = (d: number) => {
    const next = session.rows[index + d];
    if (next) useUI.setState({ drawerRowId: next.id });
  };

  return (
    <>
      <div className="scrim" onClick={close} />
      <aside className="drawer" role="dialog" aria-label={`Row ${index + 1}`}>
        <div className="drawer-head">
          <h3>Row {index + 1}</h3>
          <span className="faint">v{version.n}</span>
          <span className="spacer" />
          <button className="btn sm" onClick={() => go(-1)} disabled={index === 0}>
            ↑ Prev
          </button>
          <button className="btn sm" onClick={() => go(1)} disabled={index === session.rows.length - 1}>
            ↓ Next
          </button>
          <button className="icon-btn" onClick={close} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="drawer-body">
          <section>
            <div className="row-flex" style={{ marginBottom: 6 }}>
              <span className="section-label">Input</span>
              <span className="spacer" />
              <label className="check">
                <input type="checkbox" checked={row.holdout} onChange={() => st.toggleHoldout(row.id)} /> Holdout
              </label>
            </div>
            <textarea value={row.input} onChange={(e) => st.setInput(row.id, e.target.value)} rows={8} spellCheck={false} />
          </section>

          <section>
            <div className="row-flex" style={{ marginBottom: 6 }}>
              <span className="section-label">Output</span>
              <StatusBadge o={o} />
              <OutputMeta o={o} />
              {o?.original != null && <span className="tag accent">Edited = ideal</span>}
              <span className="spacer" />
              {o?.original != null && isLatest && (
                <button className="btn sm ghost" onClick={() => st.revertOutput(version.id, row.id)}>
                  Revert to model output
                </button>
              )}
              <button className="btn sm" onClick={() => runRows(version.id, [row.id])} disabled={!isLatest || !row.input.trim() || o?.status === "running"}>
                <IconRerun /> {o?.status === "error" ? "Retry" : "Re-run"}
              </button>
            </div>
            {o?.status === "error" ? (
              <div className="errbox">{o.error}</div>
            ) : (
              <textarea
                value={o?.text ?? ""}
                readOnly={!isLatest || o?.status !== "done"}
                onChange={(e) => st.editOutput(version.id, row.id, e.target.value)}
                rows={14}
                placeholder={o?.status === "running" ? "Running…" : "Not run yet"}
                spellCheck={false}
              />
            )}
            {o?.original != null && (
              <details style={{ marginTop: 6 }}>
                <summary className="muted" style={{ cursor: "pointer", fontSize: 12 }}>
                  Original model output
                </summary>
                <textarea readOnly value={o.original} rows={10} style={{ marginTop: 6 }} />
              </details>
            )}
          </section>

          {prev && (
            <section>
              <div className="section-label" style={{ marginBottom: 6 }}>
                v{prev.n} output (previous version)
              </div>
              <textarea readOnly value={prevOut ? prevOut.text || prevOut.error || "" : ""} rows={8} placeholder="No output in the previous version" />
            </section>
          )}

          <section>
            <div className="row-flex" style={{ marginBottom: 6 }}>
              <span className="section-label">Feedback</span>
              <span className="spacer" />
              <RatingChips value={fb?.rating ?? null} disabled={!isLatest} onChange={(rating) => st.setFeedback(version.id, row.id, { rating })} />
            </div>
            <textarea
              className="plain"
              value={fb?.comment ?? ""}
              readOnly={!isLatest}
              onChange={(e) => st.setFeedback(version.id, row.id, { comment: e.target.value })}
              rows={5}
              placeholder="What's wrong or right about this output?"
            />
          </section>
        </div>
      </aside>
    </>
  );
}
