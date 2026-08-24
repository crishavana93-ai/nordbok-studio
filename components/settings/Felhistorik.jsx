"use client";

/* components/settings/Felhistorik.jsx
 *
 * The point of logging errors is that someone reads them. On a single-operator app the
 * only person who will is the operator, so the log has to live where they already go —
 * not in a dashboard on another service they would have to remember to open.
 *
 * Renders nothing when there is nothing wrong, which is the normal case. A permanently
 * visible "0 errors" panel trains you to stop seeing the panel.
 */

import { useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { dateISO } from "@/lib/format";

const SCOPE_SV = {
  "ui/render": "Sidan kunde inte visas",
  "ui/root": "Appen kunde inte starta",
  "ui/invoice-send": "Fakturautskick",
  "ui/receipt-upload": "Kvittouppladdning",
  "ui/receipt-commit": "Spara kvitto",
  "ui/assistant": "Assistenten",
  "api/invoices/send": "Fakturautskick (server)",
  "api/receipts/commit": "Spara kvitto (server)",
  "api/cron/digest": "Veckorapport",
};

export default function Felhistorik() {
  const sb = useMemo(() => browserClient(), []);
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { data } = await sb
      .from("studio_error_log")
      .select("id, scope, message, level, url, seen_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25);
    setRows(data || []);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [sb]);

  async function markSeen() {
    setBusy(true);
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      await sb.from("studio_error_log")
        .update({ seen_at: new Date().toISOString() })
        .eq("user_id", user.id).is("seen_at", null);
    }
    await load();
    setBusy(false);
  }

  if (!rows || rows.length === 0) return null;   // nothing wrong: say nothing

  const unseen = rows.filter((r) => !r.seen_at).length;
  const shown = open ? rows : rows.slice(0, 3);

  return (
    <div className="card">
      <h2 className="h2" style={{ marginTop: 0 }}>
        Fel {unseen > 0 && <span className="muted" style={{ fontWeight: 400 }}>· {unseen} nya</span>}
      </h2>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 12 }}>
        Något gick fel de senaste dagarna. Bokföringen påverkas inte av att felet står
        här — men om samma sak återkommer är det värt att titta på.
      </div>

      {shown.map((r) => (
        <div key={r.id}
          style={{ borderTop: "1px solid var(--line)", padding: "9px 0",
                   display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>
              {SCOPE_SV[r.scope] || r.scope}
            </span>
            <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
              {dateISO(r.created_at)}
            </span>
          </div>
          <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>{r.message}</span>
          {r.url && <span className="muted" style={{ fontSize: 11.5, fontFamily: "ui-monospace,monospace" }}>{r.url}</span>}
        </div>
      ))}

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        {rows.length > 3 && (
          <button className="btn btn-ghost" type="button" onClick={() => setOpen((v) => !v)}>
            {open ? "Visa färre" : `Visa alla ${rows.length}`}
          </button>
        )}
        {unseen > 0 && (
          <button className="btn btn-ghost" type="button" onClick={markSeen} disabled={busy}>
            {busy ? "…" : "Markera som lästa"}
          </button>
        )}
      </div>
    </div>
  );
}
