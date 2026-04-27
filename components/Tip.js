"use client";
import { useState } from "react";

/** Inline help icon with hover/tap tooltip. Use inside labels:
 *  <label>Personnummer <Tip text="Skatteid som enskild firma. YYYYMMDDXXXX." /></label>  */
export default function Tip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="Hjälp"
        style={{
          width: 18, height: 18, borderRadius: "50%",
          background: "var(--bg-soft)", color: "var(--text-muted)",
          border: "1px solid var(--line)",
          fontSize: 11, fontWeight: 700, lineHeight: 1,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          cursor: "help", padding: 0, marginLeft: 4, verticalAlign: "middle",
        }}
      >?</button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
            transform: "translateX(-50%)",
            background: "var(--text)", color: "var(--bg-card)",
            padding: "8px 10px", borderRadius: 8, fontSize: 12, lineHeight: 1.4,
            width: 240, maxWidth: "70vw", textAlign: "left",
            boxShadow: "0 8px 22px rgba(0,0,0,.18)",
            zIndex: 70, fontWeight: 500,
            whiteSpace: "normal",
          }}
        >{text}</span>
      )}
    </span>
  );
}
