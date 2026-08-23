"use client";

/* components/nav/OwnerSwitcher.jsx
 *
 * Renders NOTHING when there is only one set of books, which is the normal case. A
 * control that exists to disambiguate should not appear when there is nothing to
 * disambiguate.
 *
 * When it does appear it is deliberately loud: looking at someone else's accounts and
 * not realising it is the failure mode worth designing against, so the banner states
 * whose books these are and that the session is read-only.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OwnerSwitcher({ owners, activeId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  if (!owners || owners.length < 2) return null;

  const active = owners.find((o) => o.id === activeId);
  const viewingOther = active && !active.isSelf;

  async function pick(id) {
    if (id === activeId) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_id: id }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error || "Kunde inte byta."); return; }
      router.refresh();
    } catch (e) {
      setErr(e.message || "Nätverksfel.");
    } finally { setBusy(false); }
  }

  return (
    <div
      className={`mb-3 rounded-[var(--radius-card)] border p-3 sm:p-3.5 ${
        viewingOther ? "border-warn/40 bg-warn-bg" : "border-border bg-surface"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="micro-label">{viewingOther ? "Du läser andras böcker" : "Böcker"}</span>
        <div className="flex flex-wrap gap-0.5 rounded-[var(--radius-ctl)] border border-border bg-raised p-[3px]">
          {owners.map((o) => (
            <button
              key={o.id}
              onClick={() => pick(o.id)}
              disabled={busy}
              aria-pressed={o.id === activeId}
              className={`whitespace-nowrap rounded-[5px] px-2.5 py-1 text-[12.5px] font-medium transition-colors disabled:opacity-50 ${
                o.id === activeId ? "bg-surface text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {o.isSelf ? "Mina" : o.label}
            </button>
          ))}
        </div>
        {viewingOther && (
          <span className="font-mono text-[11.5px] text-warn">
            endast läsning · inget du gör här sparas
          </span>
        )}
      </div>
      {err && <p className="mt-2 text-[12.5px] text-crit">{err}</p>}
    </div>
  );
}
