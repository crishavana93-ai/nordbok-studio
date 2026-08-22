"use client";

/* components/dashboard/MomsSheet.jsx
 *
 * Vaul drawer holding the box-by-box momsdeklaration for the current period.
 * Vaul gives us drag-to-dismiss, focus trapping and scroll locking for free.
 *
 * This is the drill-down behind the hero number: tap the number, see how it was made.
 * A tax figure the user cannot take apart is a figure they cannot defend.
 */

import { Drawer } from "vaul";

const kr = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });

const ROWS = [
  ["05", "Momspliktig försäljning"],
  ["06", "Momspliktiga uttag"],
  ["07", "Vinstmarginalbeskattning"],
  ["08", "Hyresinkomster"],
  ["10", "Utgående moms 25 %"],
  ["11", "Utgående moms 12 %"],
  ["12", "Utgående moms 6 %"],
  ["20", "Varor från annat EU-land"],
  ["21", "Tjänster från annat EU-land"],
  ["22", "Tjänster från land utanför EU"],
  ["23", "Varor i Sverige, köparen betalar"],
  ["24", "Övriga tjänster, köparen betalar"],
  ["30", "Utgående moms på ruta 20–24"],
  ["39", "Tjänster till EU enligt huvudregeln"],
  ["40", "Övrig försäljning av tjänster utomlands"],
  ["48", "Ingående moms att dra av"],
];

export default function MomsSheet({ open, onOpenChange, moms, quarter, children }) {
  const r = moms.rutor;
  const refund = r.r49 < 0;
  const shown = ROWS.filter(([n]) => Number(r[`r${n}`] || 0) !== 0 || ["05", "10", "48"].includes(n));

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Trigger asChild>{children}</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-20 bg-black/45 backdrop-blur-[2px]" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-h-[88vh] flex-col rounded-t-[16px]
                     border-t border-border bg-surface shadow-[var(--shadow-sheet)] sm:max-w-[520px]"
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border-firm" />

          <div className="overflow-y-auto px-5 pb-[calc(26px+env(safe-area-inset-bottom))] pt-3">
            <Drawer.Title className="text-[17px] font-semibold tracking-[-0.01em]">
              Momsberäkning
            </Drawer.Title>
            <Drawer.Description className="mb-4 font-mono text-[12.5px] text-ink-3">
              {quarter.label} · {quarter.start} – {quarter.end} · senast {quarter.deadline}
            </Drawer.Description>

            <div>
              {shown.map(([n, text]) => (
                <div key={n} className="grid grid-cols-[36px_1fr_auto] items-center gap-2.5 border-b border-border py-2.5">
                  <span className="rounded bg-raised py-0.5 text-center font-mono text-[11px] font-semibold text-ink-3">
                    {n}
                  </span>
                  <span className="text-[13px] text-ink-2">{text}</span>
                  <span className="tnum font-mono text-[13.5px] font-medium">{kr.format(r[`r${n}`] || 0)}</span>
                </div>
              ))}

              <div className="mt-1.5 grid grid-cols-[36px_1fr_auto] items-center gap-2.5 border-t-2 border-ink pt-3">
                <span className="rounded bg-raised py-0.5 text-center font-mono text-[11px] font-semibold text-ink-3">
                  49
                </span>
                <span className="text-[13px] font-semibold text-ink">
                  {refund ? "Moms att få tillbaka" : "Moms att betala"}
                </span>
                <span className={`tnum font-mono text-base font-medium ${refund ? "text-good" : "text-ink"}`}>
                  {kr.format(Math.abs(r.r49))} kr
                </span>
              </div>
            </div>

            {moms.warnings.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2 rounded-lg bg-warn-bg px-3.5 py-3">
                {moms.warnings.map((w, i) => (
                  <li key={i} className="text-[12.5px] leading-relaxed text-ink-2">{w}</li>
                ))}
              </ul>
            )}

            {!moms.fileReady && (
              <p className="mt-3 rounded-lg bg-crit-bg px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-2">
                <strong className="text-crit">Inte klar att lämna in.</strong>{" "}
                {moms.unconverted.length} post{moms.unconverted.length > 1 ? "er" : ""} i utländsk valuta
                saknar SEK-omräkning. Siffrorna ovan är därför för låga.
              </p>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
