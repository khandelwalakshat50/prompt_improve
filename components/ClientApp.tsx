"use client";

import dynamic from "next/dynamic";

// The app lives in localStorage, so render it on the client only to avoid hydration mismatches.
const App = dynamic(() => import("./App"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, color: "#9ca3af" }}>Loading Prompt Lab…</div>,
});

export default function ClientApp() {
  return <App />;
}
