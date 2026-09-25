"use client";

import { useEffect, useRef, useState } from "react";
import { useStore, useViewed } from "@/lib/store";
import { runAll, useUI } from "@/lib/ui";
import type { Session } from "@/lib/types";
import { IconGear, IconMore, IconPlay } from "./icons";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? "⌘" : "Ctrl";

export default function TopBar() {
  const { session, version, isLatest } = useViewed();
  const order = useStore((s) => s.order);
  const sessions = useStore((s) => s.sessions);
  const concurrency = useStore((s) => s.concurrency);
  const st = useStore.getState();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const nonEmpty = session.rows.filter((r) => r.input.trim()).length;
  const running = Object.values(version.outputs).filter((o) => o.status === "running").length;

  const act = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };

  const exportSession = () => {
    const blob = new Blob([JSON.stringify({ type: "prompt-lab-session", schema: 1, exportedAt: new Date().toISOString(), session }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `prompt-lab-${session.name.replace(/[^\w-]+/g, "-").toLowerCase() || "session"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      const s: Session = j?.session ?? j;
      if (!s || !Array.isArray(s.rows) || !Array.isArray(s.versions) || !s.versions.length) throw new Error("Not a Prompt Lab session file.");
      st.importSession({ ...s, name: String(s.name || f.name.replace(/\.json$/, "")) });
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-dot" />
        Prompt Lab
      </div>

      <select className="session" value={session.id} onChange={(e) => st.selectSession(e.target.value)} title="Session">
        {order.map((id) => (
          <option key={id} value={id}>
            {sessions[id]?.name}
          </option>
        ))}
      </select>
      <div className="menu" ref={menuRef}>
        <button className="icon-btn" onClick={() => setMenu((m) => !m)} title="Session actions" aria-label="Session actions">
          <IconMore />
        </button>
        {menu && (
          <div className="menu-pop">
            <button
              onClick={act(() => {
                const name = prompt("Name for the new session:", "");
                if (name !== null) st.createSession(name);
              })}
            >
              New session…
            </button>
            <button
              onClick={act(() => {
                const name = prompt("Rename session:", session.name);
                if (name?.trim()) st.renameSession(session.id, name.trim());
              })}
            >
              Rename…
            </button>
            <button onClick={act(() => st.duplicateSession(session.id))}>Duplicate</button>
            <hr />
            <button className="danger" style={{ color: "var(--red)" }} onClick={act(() => confirm(`Delete "${session.name}"? This cannot be undone.`) && st.deleteSession(session.id))}>
              Delete…
            </button>
          </div>
        )}
      </div>

      <span className="sep" />

      <button
        className="btn primary"
        onClick={runAll}
        disabled={!isLatest || nonEmpty === 0}
        title={isLatest ? `Run all non-empty inputs (${MOD}+Enter)` : "Viewing an old version. Restore it to run."}
      >
        <IconPlay /> {running ? `Running ${running}…` : `Run All (${nonEmpty})`} <span className="kbd">{MOD}↵</span>
      </button>
      <label className="conc" title="Maximum parallel requests">
        Concurrency
        <input type="number" min={1} max={50} value={concurrency} onChange={(e) => st.setConcurrency(Number(e.target.value))} />
      </label>

      <span className="spacer" />

      <button className="btn ghost" onClick={exportSession} title="Download this session as JSON">
        Export
      </button>
      <button className="btn ghost" onClick={() => fileRef.current?.click()} title="Import a session JSON file">
        Import
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = "";
        }}
      />
      <button className="btn" onClick={() => useUI.setState({ settingsOpen: true })}>
        <IconGear /> Settings
      </button>
    </header>
  );
}
