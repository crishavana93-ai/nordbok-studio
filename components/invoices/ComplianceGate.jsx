"use client";

/* components/invoices/ComplianceGate.jsx
 *
 * Wraps the send button. Errors block; warnings show and require an explicit
 * acknowledgement. This is the component that makes the app trustworthy — everything
 * else is convenience.
 *
 * The server validates again on every send. This is the polite half; the route is the
 * enforcing half. A UI gate a determined user can click past is fine, precisely
 * because it isn't the only gate.
 */

import { useState } from "react";

export default function ComplianceGate({ invoiceId, disabled, label = "Skicka faktura", onSent }) {
  const [state, setState] = useState("idle");   // idle | checking | blocked | warned | sent
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [result, setResult] = useState(null);
  const [fatal, setFatal] = useState(null);

  async function send(acknowledge = false) {
    setState("checking"); setFatal(null);
    try {
      const res = await fetch("/api/invoices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId, acknowledge_warnings: acknowledge }),
      });
      const j = await res.json();

      if (res.status === 422) {              // defective — cannot send
        setErrors(j.errors || []); setWarnings(j.warnings || []); setState("blocked"); return;
      }
      if (res.status === 409) {              // legal, but worth a second look
        setWarnings(j.warnings || []); setState("warned"); return;
      }
      if (!res.ok) { setFatal(j.error || "Kunde inte skicka fakturan."); setState("idle"); return; }

      setResult(j); setWarnings(j.warnings || []); setState("sent");
      onSent?.(j);
    } catch (e) {
      setFatal(e.message || "Nätverksfel."); setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-[10px] bg-good-bg px-4 py-3.5">
        <p className="text-[13.5px] font-semibold text-good">
          {result?.replayed ? "Redan skickad" : `Faktura ${result?.invoice_number} skickad`}
        </p>
        {result?.replayed && <p className="mt-1 text-[12.5px] text-ink-2">{result.message}</p>}
        {!result?.replayed && (
          <p className="mt-1 text-[12.5px] text-ink-2">
            Fakturanumret tilldelades vid utskicket och kan inte ändras. Rätta med en
            kreditfaktura om något blev fel.
          </p>
        )}
        {warnings.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-[12.5px] text-ink-2">
            {warnings.map((w, i) => <li key={i}>· {w}</li>)}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {state === "blocked" && (
        <div className="rounded-[10px] border border-crit/30 bg-crit-bg px-4 py-3.5">
          <p className="mb-2 text-[13.5px] font-semibold text-crit">
            Fakturan uppfyller inte kraven och kan inte skickas
          </p>
          <ul className="flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-ink-2">
            {errors.map((e, i) => <li key={i}>· {e}</li>)}
          </ul>
          <p className="mt-2.5 text-[12px] text-ink-3">
            En faktura som saknar dessa uppgifter kan göra att din kund nekas avdrag för
            ingående moms — då kommer den tillbaka för rättelse.
          </p>
        </div>
      )}

      {state === "warned" && (
        <div className="rounded-[10px] border border-warn/30 bg-warn-bg px-4 py-3.5">
          <p className="mb-2 text-[13.5px] font-semibold text-warn">Kontrollera innan du skickar</p>
          <ul className="flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-ink-2">
            {warnings.map((w, i) => <li key={i}>· {w}</li>)}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => send(true)}
              className="rounded-[var(--radius-ctl)] bg-brand px-3.5 py-2 text-[13px] font-semibold text-brand-ink"
            >
              Jag har kontrollerat — skicka
            </button>
            <button
              onClick={() => setState("idle")}
              className="rounded-[var(--radius-ctl)] border border-border-firm px-3.5 py-2 text-[13px] font-medium text-ink-2"
            >
              Tillbaka
            </button>
          </div>
        </div>
      )}

      {fatal && <p className="rounded-[10px] bg-crit-bg px-4 py-3 text-[13px] text-ink-2">{fatal}</p>}

      {state !== "warned" && (
        <button
          onClick={() => send(false)}
          disabled={disabled || state === "checking"}
          className="rounded-[var(--radius-ctl)] bg-brand px-4 py-3 text-[14px] font-semibold text-brand-ink disabled:opacity-50"
        >
          {state === "checking" ? "Kontrollerar…" : state === "blocked" ? "Kontrollera igen" : label}
        </button>
      )}

      <p className="text-[12px] leading-relaxed text-ink-3">
        Fakturanumret tilldelas först när fakturan skickas, så serien aldrig får luckor.
      </p>
    </div>
  );
}
