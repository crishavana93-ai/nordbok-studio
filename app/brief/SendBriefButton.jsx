"use client";
import { useState } from "react";

export default function SendBriefButton() {
  const [state, setState] = useState("idle");
  async function send() {
    setState("busy");
    const r = await fetch("/api/digest/run", { method: "POST" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setState(r?.ok && j.sent > 0 ? "sent" : "fail");
  }
  return (
    <button onClick={send} disabled={state === "busy"}
      className="rounded-[var(--radius-ctl)] border border-border-firm px-3.5 py-2 text-[13.5px] font-medium disabled:opacity-50">
      {state === "busy" ? "Skickar…" : state === "sent" ? "Skickat till din e-post" : state === "fail" ? "Kunde inte skicka — är veckosammanfattning på?" : "Skicka till min e-post"}
    </button>
  );
}
