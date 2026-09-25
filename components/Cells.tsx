"use client";

import type { CSSProperties } from "react";
import { useStore, useViewed } from "@/lib/store";
import { runRows } from "@/lib/runner";
import { splitPaste } from "@/lib/paste";
import { useUI } from "@/lib/ui";
import { fmtMs, fmtNum } from "@/lib/format";
import type { Rating, Row, RowOutput } from "@/lib/types";
import { IconExpand, IconHistory, IconRerun, IconX } from "./icons";

type CellProps = { row: Row; index: number; style: CSSProperties };

function useFlash(rowId: string) {
  return useUI((s) => s.flashRow === rowId);
}

const openDrawer = (rowId: string) => useUI.setState({ drawerRowId: rowId });

export function InputCell({ row, index, style }: CellProps) {
  const st = useStore.getState();
  const flash = useFlash(row.id);
  const canRemove = useStore((s) => (s.sessions[s.currentId]?.rows.length ?? 0) > 1);
  return (
    <div className={`cell rcell ${row.holdout ? "holdout" : ""} ${flash ? "focus-flash" : ""}`} style={style} data-row-id={row.id}>
      <div className="rhead">
        <span className="rnum">{index + 1}</span>
        <label className="check" title="Holdout rows run but are never sent to the improver">
          <input type="checkbox" checked={row.holdout} onChange={() => st.toggleHoldout(row.id)} />
          Holdout
        </label>
        <span className="spacer" />
        <button className="icon-btn" onClick={() => openDrawer(row.id)} title="Open row" aria-label="Open row">
          <IconExpand />
        </button>
        <button className="icon-btn" onClick={() => st.removeRow(row.id)} disabled={!canRemove} title="Remove this row" aria-label="Remove row">
          <IconX />
        </button>
      </div>
      <div className="rbody">
        <textarea
          value={row.input}
          placeholder={index === 0 ? "Type an input, or paste many lines to fill rows" : `Input ${index + 1}`}
          onChange={(e) => st.setInput(row.id, e.target.value)}
          onPaste={(e) => {
            const items = splitPaste(e.clipboardData.getData("text/plain"));
            if (!items) return; // single-line paste: behave normally
            e.preventDefault();
            st.fillFrom(index, items);
          }}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

export function StatusBadge({ o }: { o: RowOutput | undefined }) {
  const status = o?.status ?? "idle";
  return (
    <span className={`status ${status}`}>
      <span className="dot" />
      {status}
    </span>
  );
}

export function OutputMeta({ o }: { o: RowOutput | undefined }) {
  if (!o || o.status === "idle" || o.status === "running") return null;
  const parts = [fmtMs(o.latencyMs)];
  if (o.inputTokens != null || o.outputTokens != null) parts.push(`${fmtNum(o.inputTokens ?? 0)}→${fmtNum(o.outputTokens ?? 0)} tok`);
  return <span className="faint" title="Latency · input→output tokens">{parts.filter(Boolean).join(" · ")}</span>;
}

export function OutputCell({ row, index, style }: CellProps) {
  const { version, isLatest, prev } = useViewed();
  const st = useStore.getState();
  const o = version.outputs[row.id];
  const prevOut = prev?.outputs[row.id];
  const showPrev = useUI((s) => !!s.showPrev[row.id]) && !!prev;
  const flash = useFlash(row.id);
  const stale = o?.status === "done" && o.inputSnapshot !== row.input;
  const edited = o?.original != null;
  const rerun = () => void runRows(version.id, [row.id]);

  return (
    <div className={`cell rcell ${row.holdout ? "holdout" : ""} ${flash ? "focus-flash" : ""}`} style={style}>
      <div className="rhead">
        <span className="rnum">{index + 1}</span>
        <StatusBadge o={o} />
        <OutputMeta o={o} />
        {edited && (
          <span className="tag accent" title="You edited this output. The improver sees the original and your edit as the ideal.">
            Edited = ideal
          </span>
        )}
        {stale && <span className="tag stale" title="The input changed since this output was produced">stale</span>}
        {row.holdout && <span className="tag holdout">Holdout</span>}
        <span className="spacer" />
        {prev && (
          <button
            className="icon-btn"
            style={showPrev ? { color: "var(--accent)", background: "var(--accent-soft)" } : undefined}
            onClick={() => useUI.setState((s) => ({ showPrev: { ...s.showPrev, [row.id]: !s.showPrev[row.id] } }))}
            title={`Show previous version (v${prev.n}) output`}
            aria-label="Show previous version"
          >
            <IconHistory />
          </button>
        )}
        <button className="icon-btn" onClick={rerun} disabled={!isLatest || !row.input.trim() || o?.status === "running"} title="Re-run this row" aria-label="Re-run row">
          <IconRerun />
        </button>
        <button className="icon-btn" onClick={() => openDrawer(row.id)} title="Open row" aria-label="Open row">
          <IconExpand />
        </button>
      </div>
      <div className="rbody">
        {o?.status === "error" ? (
          <div className="errbox">
            {o.error}
            <div style={{ marginTop: 6 }}>
              <button className="btn sm" onClick={rerun} disabled={!isLatest}>
                Retry
              </button>
            </div>
          </div>
        ) : (
          <textarea
            value={o?.text ?? ""}
            readOnly={!isLatest || o?.status !== "done"}
            placeholder={o?.status === "running" ? "Running…" : row.input.trim() ? "Not run yet" : ""}
            onChange={(e) => st.editOutput(version.id, row.id, e.target.value)}
            spellCheck={false}
          />
        )}
        {showPrev && (
          <div className="prevbox">
            <div className="prevlabel">v{prev!.n} output</div>
            <textarea readOnly value={prevOut ? prevOut.text || prevOut.error || "" : ""} placeholder="No output in the previous version" style={{ flex: 1 }} />
          </div>
        )}
      </div>
    </div>
  );
}

export function RatingChips({ value, onChange, disabled }: { value: Rating; onChange: (r: Rating) => void; disabled?: boolean }) {
  const chip = (r: Exclude<Rating, null>, label: string) => (
    <button className={`chip ${r} ${value === r ? "on" : ""}`} disabled={disabled} onClick={() => onChange(value === r ? null : r)} aria-pressed={value === r}>
      {label}
    </button>
  );
  return (
    <span className="chips">
      {chip("good", "Good")}
      {chip("ok", "OK")}
      {chip("bad", "Bad")}
    </span>
  );
}

export function FeedbackCell({ row, index, style }: CellProps) {
  const { version, isLatest } = useViewed();
  const st = useStore.getState();
  const fb = version.feedback[row.id];
  const flash = useFlash(row.id);
  return (
    <div className={`cell rcell ${row.holdout ? "holdout" : ""} ${flash ? "focus-flash" : ""}`} style={style}>
      <div className="rhead">
        <span className="rnum">{index + 1}</span>
        <RatingChips value={fb?.rating ?? null} disabled={!isLatest} onChange={(rating) => st.setFeedback(version.id, row.id, { rating })} />
      </div>
      <div className="rbody">
        <textarea
          className="plain"
          value={fb?.comment ?? ""}
          readOnly={!isLatest}
          placeholder={row.holdout ? "Holdout: feedback is not sent to the improver" : "What's wrong or right about this output?"}
          onChange={(e) => st.setFeedback(version.id, row.id, { comment: e.target.value })}
        />
      </div>
    </div>
  );
}
