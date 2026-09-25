"use client";

import { useEffect } from "react";
import TopBar from "./TopBar";
import Grid from "./Grid";
import Drawer from "./Drawer";
import SettingsModal from "./SettingsModal";
import { generate, runAll, useUI } from "@/lib/ui";
import { loadProviders } from "@/lib/models";

export default function App() {
  const drawerRowId = useUI((s) => s.drawerRowId);
  const settingsOpen = useUI((s) => s.settingsOpen);

  useEffect(() => {
    loadProviders();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        useUI.setState({ drawerRowId: null, settingsOpen: false });
        return;
      }
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      if (e.shiftKey) generate();
      else runAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <TopBar />
      <Grid />
      {drawerRowId && <Drawer rowId={drawerRowId} />}
      {settingsOpen && <SettingsModal />}
    </>
  );
}
