"use client";

import { useEffect, useState } from "react";

// Fixed status strip. Reports the sheet's own state — which table is open —
// alongside the running clock, so the top of the page reads as an instrument
// rather than a title bar.
export default function Header({ tableName }) {
  // Placeholder on the first render: the server has no clock, and rendering the
  // real time here would mismatch on hydration. The interval fills it in.
  const [clock, setClock] = useState("--:--:--");

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="hud">
      <span className="hud__mark">找數 Gay</span>
      <span className="hud__wire" />
      <span className="hud__meta">
        <span className="readout hud__table">{tableName || "no table"}</span>
        <span className="hud__status">online</span>
        <span className="hud__clock">{clock}</span>
      </span>
    </header>
  );
}
