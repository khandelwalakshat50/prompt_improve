"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useStore, useViewed, type ColKey } from "@/lib/store";
import { fmtNum } from "@/lib/format";
import { IconChevLeft, IconChevRight } from "./icons";
import { FeedbackCell, InputCell, OutputCell } from "./Cells";
import PromptPanel from "./PromptPanel";
import ContextPanel from "./ContextPanel";
import NewPromptPanel from "./NewPromptPanel";

const COLS: { key: ColKey; label: string; kind: "row" | "panel" }[] = [
  { key: "inputs", label: "Inputs", kind: "row" },
  { key: "prompt", label: "System prompt", kind: "panel" },
  { key: "outputs", label: "Outputs", kind: "row" },
  { key: "feedback", label: "Feedback", kind: "row" },
  { key: "context", label: "Overall context", kind: "panel" },
  { key: "newprompt", label: "New prompt", kind: "panel" },
];
const MIN_PX = 150;
const COLLAPSED_PX = 28;

export default function Grid() {
  const { session, version } = useViewed();
  const layout = useStore((s) => s.layout);
  const setLayout = useStore((s) => s.setLayout);
  const mainRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1400);
  const [dragging, setDragging] = useState<ColKey | null>(null);

  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = session.rows.length;
  const visible = COLS.filter((c) => !layout.collapsed[c.key]);
  const lastVisible = visible[visible.length - 1]?.key;
  const px = (k: ColKey) => Math.max(MIN_PX, Math.round((layout.widths[k] ?? 0.15) * width));

  const template = COLS.map((c) => {
    if (layout.collapsed[c.key]) return `${COLLAPSED_PX}px`;
    // The last open column soaks up any spare width so the page is always full-width.
    return c.key === lastVisible ? `minmax(${px(c.key)}px, 1fr)` : `${px(c.key)}px`;
  }).join(" ");

  const startResize = (key: ColKey) => (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startPx = px(key);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    setDragging(key);
    const move = (ev: PointerEvent) => {
      const next = Math.max(MIN_PX, startPx + ev.clientX - startX);
      setLayout({ widths: { ...useStore.getState().layout.widths, [key]: next / width } });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      setDragging(null);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const toggle = (key: ColKey) => setLayout({ collapsed: { ...layout.collapsed, [key]: !layout.collapsed[key] } });

  // Header stats
  const outs = session.rows.map((r) => version.outputs[r.id]).filter(Boolean);
  const done = outs.filter((o) => o.status === "done").length;
  const errors = outs.filter((o) => o.status === "error").length;
  const tokens = outs.reduce((a, o) => a + (o.inputTokens ?? 0) + (o.outputTokens ?? 0), 0);
  const nonEmpty = session.rows.filter((r) => r.input.trim()).length;
  const ratings = session.rows.map((r) => version.feedback[r.id]?.rating).filter(Boolean);
  const count = (x: string) => ratings.filter((r) => r === x).length;

  const extras: Partial<Record<ColKey, ReactNode>> = {
    inputs: <InputsHeaderTools />,
    prompt: <span className="hextra">v{version.n}</span>,
    outputs: (
      <span className="hextra" title="Completed / non-empty inputs · total tokens">
        {done}/{nonEmpty} done{errors ? ` · ${errors} err` : ""} · {fmtNum(tokens)} tok
      </span>
    ),
    feedback: ratings.length ? (
      <span className="hextra">
        {count("good")} good · {count("ok")} ok · {count("bad")} bad
      </span>
    ) : null,
  };

  const lastCol = COLS.length;
  const bodyRows = `2 / span ${n + 1}`;

  return (
    <div className="main" ref={mainRef}>
      <div
        className="grid"
        style={{ gridTemplateColumns: template, gridTemplateRows: `var(--hdr) repeat(${n}, var(--row)) minmax(56px, 1fr)` }}
      >
        {/* header row */}
        {COLS.map((c, i) => {
          const collapsed = layout.collapsed[c.key];
          const style: CSSProperties = { gridColumn: i + 1, gridRow: 1 };
          if (collapsed) {
            return (
              <div key={c.key} className={`cell hcell collapsed ${i + 1 === lastCol ? "last-col" : ""}`} style={style}>
                <button className="icon-btn" onClick={() => toggle(c.key)} title={`Expand ${c.label}`} aria-label={`Expand ${c.label}`}>
                  <IconChevRight />
                </button>
              </div>
            );
          }
          return (
            <div key={c.key} className={`cell hcell ${i + 1 === lastCol ? "last-col" : ""}`} style={style}>
              <span className="htitle" title={c.label}>
                {c.label}
              </span>
              {extras[c.key]}
              <span className="spacer" />
              <button className="icon-btn" onClick={() => toggle(c.key)} title={`Collapse ${c.label}`} aria-label={`Collapse ${c.label}`}>
                <IconChevLeft />
              </button>
              {c.key !== lastVisible && (
                <div className={`resizer ${dragging === c.key ? "active" : ""}`} onPointerDown={startResize(c.key)} title="Drag to resize" />
              )}
            </div>
          );
        })}

        {/* body */}
        {COLS.map((c, i) => {
          const colStyle: CSSProperties = { gridColumn: i + 1, gridRow: bodyRows };
          const edge = i + 1 === lastCol ? "last-col" : "";
          if (layout.collapsed[c.key]) {
            return (
              <div key={c.key} className={`cell collapsed-strip ${edge}`} style={colStyle} onClick={() => toggle(c.key)} title={`Expand ${c.label}`}>
                <span className="vlabel">{c.label}</span>
              </div>
            );
          }
          if (c.kind === "panel") {
            return (
              <div key={c.key} className={`cell pcell ${edge}`} style={colStyle}>
                {c.key === "prompt" && <PromptPanel />}
                {c.key === "context" && <ContextPanel />}
                {c.key === "newprompt" && <NewPromptPanel />}
              </div>
            );
          }
          return (
            <RowColumn key={c.key} col={c.key} colIndex={i + 1} rows={n} />
          );
        })}
      </div>
    </div>
  );
}

function RowColumn({ col, colIndex, rows }: { col: ColKey; colIndex: number; rows: number }) {
  const { session } = useViewed();
  const addRow = useStore((s) => s.addRow);
  return (
    <>
      {session.rows.map((r, i) => {
        const style: CSSProperties = { gridColumn: colIndex, gridRow: i + 2 };
        if (col === "inputs") return <InputCell key={r.id} row={r} index={i} style={style} />;
        if (col === "outputs") return <OutputCell key={r.id} row={r} index={i} style={style} />;
        return <FeedbackCell key={r.id} row={r} index={i} style={style} />;
      })}
      <div className="cell filler" style={{ gridColumn: colIndex, gridRow: rows + 2 }}>
        {col === "inputs" && (
          <button className="btn sm" onClick={addRow}>
            + Add row
          </button>
        )}
      </div>
    </>
  );
}

function InputsHeaderTools() {
  const st = useStore.getState();
  const { session } = useViewed();
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 2500);
    return () => clearTimeout(t);
  }, [confirming]);
  return (
    <>
      <span className="spacer" />
      <button className="btn sm" onClick={st.addRow} title="Add row">
        +
      </button>
      <button className="btn sm" onClick={() => st.removeRow()} disabled={session.rows.length <= 1} title="Remove last row">
        −
      </button>
      <button
        className="btn sm"
        onClick={() => {
          if (confirming) {
            st.clearInputs();
            setConfirming(false);
          } else setConfirming(true);
        }}
        title="Clear every input"
        style={confirming ? { color: "var(--red)", borderColor: "var(--red)" } : undefined}
      >
        {confirming ? "Sure?" : "Clear"}
      </button>
    </>
  );
}
