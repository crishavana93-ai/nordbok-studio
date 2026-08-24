"use client";

/* app/global-error.js — the last boundary.
 *
 * This one catches errors in the root layout itself, which means it renders WITHOUT
 * the app's own <html>/<body> and without the stylesheet. Everything here is therefore
 * inline and self-contained, and the colours are chosen to be legible on either a
 * light or a dark browser default. Do not import the design tokens here — the failure
 * that brings you to this file may well be the one that stopped them loading.
 */

import { useEffect } from "react";
import { reportErrorAsync } from "@/lib/report-error";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    reportErrorAsync(error, { scope: "ui/root", context: { digest: error?.digest } });
  }, [error]);

  return (
    <html lang="sv">
      <body style={{ margin: 0, background: "#f6f7f4", color: "#101512",
                     fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "56px 22px",
                      display: "flex", flexDirection: "column", gap: 14 }}>
          <span style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase",
                         color: "rgba(16,21,18,.43)" }}>Nordbök Studio</span>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-.02em" }}>
            Appen kunde inte starta
          </h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "rgba(16,21,18,.64)" }}>
            Felet är registrerat. Ingen bokföringsdata har ändrats — det här är ett fel i
            gränssnittet, inte i dina uppgifter.
          </p>
          {error?.digest && (
            <p style={{ margin: 0, fontFamily: "ui-monospace, monospace", fontSize: 12,
                        color: "rgba(16,21,18,.43)" }}>Referens: {error.digest}</p>
          )}
          <button onClick={reset}
            style={{ alignSelf: "flex-start", marginTop: 8, border: 0, cursor: "pointer",
                     background: "#14392c", color: "#f4f7f2", borderRadius: 8,
                     padding: "11px 17px", fontSize: 14, fontWeight: 600 }}>
            Ladda om
          </button>
        </div>
      </body>
    </html>
  );
}
