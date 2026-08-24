"use client";

/* app/error.js — the route-segment boundary.
 *
 * Next needs one of these or a thrown render error takes the whole screen to a blank
 * page. There was none, anywhere, so every render bug in this app has been an
 * unexplained white screen with the real message only in a console the user never opens.
 */

import { useEffect } from "react";
import { reportErrorAsync } from "@/lib/report-error";

export default function Error({ error, reset }) {
  useEffect(() => {
    reportErrorAsync(error, {
      scope: "ui/render",
      context: { digest: error?.digest },
    });
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 py-14">
      <span className="micro-label">Något gick fel</span>
      <h1 className="text-[21px] font-medium tracking-[-0.015em]">
        Den här sidan kunde inte visas
      </h1>
      <p className="text-[14px] leading-relaxed text-ink-2">
        Felet är registrerat. <strong className="font-medium text-ink">Ingenting har sparats
        eller skickats</strong> — dina uppgifter är orörda. Prova att ladda om; går det inte,
        gå tillbaka till översikten.
      </p>
      {error?.digest && (
        <p className="font-mono text-[11.5px] text-ink-3">
          Referens: {error.digest}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2.5">
        <button
          onClick={reset}
          className="rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink"
        >
          Försök igen
        </button>
        <a
          href="/dashboard"
          className="rounded-[var(--radius-ctl)] border border-border-firm px-4 py-2.5 text-[14px] font-medium text-ink-2"
        >
          Till översikten
        </a>
      </div>
    </div>
  );
}
