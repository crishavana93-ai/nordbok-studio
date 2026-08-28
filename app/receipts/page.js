"use client";

/* app/receipts/page.js — DIRECTION A · KONTOR
 *
 * The four questions this screen answers, in order of how much they cost:
 *   1. What still needs my attention?      → the queue, at the top, or nothing at all
 *   2. What did I spend, and can I reclaim the moms?  → treatment on every row
 *   3. Is anything about to under-report a period?     → missing FX, called out
 *   4. Where is the evidence?               → the paperclip, and the hash behind it
 *
 * LAW 08 — sparse on the surface, dense one tap down. The list is scannable; the
 * detail lives in the row you open. LAW 07 — a payment-terminal string is not a
 * vendor name, so `resolveVendor` cleans it before it ever reaches the screen.
 */

import { useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase";
import ReceiptCapture from "@/components/receipts/ReceiptCapture";
import KvittoRattelse from "@/components/receipts/KvittoRattelse";
import { money, num, dateISO, dateProse } from "@/lib/format";
import { readActiveOwnerId } from "@/lib/owner-client";

const TREATMENT = {
  domestic:    { label: "Svensk moms",        tone: "good" },
  rc_eu:       { label: "Omvänd — EU",         tone: "good" },
  rc_non_eu:   { label: "Omvänd — utanför EU", tone: "good" },
  oss_non_ded: { label: "OSS — ej avdragsgill", tone: "warn" },
  exempt:      { label: "Undantagen",          tone: "muted" },
};

const TONE = {
  good:  "bg-good-bg text-good",
  warn:  "bg-warn-bg text-warn",
  crit:  "bg-crit-bg text-crit",
  muted: "bg-raised text-ink-3",
};

/* Law 07 — resolve the name before it reaches the screen.
 * "SUMUP *CIGARR", "PAYPAL *ANTHROPIC", "WWW.KLARNA.COM/AB" are not vendors; they are
 * acquirer strings. N26 rebuilt its whole transaction list around this one problem,
 * and it does more for perceived quality than any animation. */
const ACQUIRERS = /^(sumup|izettle|zettle|paypal|klarna|swish|stripe|square|adyen|nets|worldpay|wpy)\b[\s*\-.:]*/i;
function resolveVendor(raw) {
  if (!raw) return { name: "Okänd leverantör", via: null };
  let s = String(raw).trim();
  const m = s.match(ACQUIRERS);
  const via = m ? m[1].toLowerCase() : null;
  if (m) s = s.slice(m[0].length).trim();
  s = s.replace(/^(www\.)?/i, "").replace(/[.\-_*]+$/, "").trim();
  if (!s) return { name: raw, via: null };
  // ALL-CAPS terminal strings read as shouting; title-case them.
  if (s === s.toUpperCase() && s.length > 2) {
    s = s.toLowerCase().replace(/(^|[\s\-/])([a-zåäö])/g, (_, a, b) => a + b.toUpperCase());
  }
  return { name: s, via: via ? via[0].toUpperCase() + via.slice(1) : null };
}

function Chip({ tone = "muted", children }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 font-mono text-[10.5px] font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

export default function ReceiptsPage() {
  const sb = useMemo(() => browserClient(), []);

  /* Sedan 1 juli 2024 ÄR kvittobilden verifikationen. Filen laddades upp till
     Storage och visades sedan aldrig igen — det gick alltså inte att titta på
     sina egna verifikationer. Hinken är privat, så länken måste signeras.
     Den är giltig i en minut och skapas först när någon ber om den. */
  const [oppnar, setOppnar] = useState(null);
  const [filFel, setFilFel] = useState(null);

  async function oppnaKvitto(rad) {
    if (!rad?.storage_path) return;
    setOppnar(rad.id); setFilFel(null);
    try {
      const { data, error } = await sb.storage
        .from("studio-receipts")
        .createSignedUrl(rad.storage_path, 60);
      if (error || !data?.signedUrl) throw error || new Error("Ingen länk kom tillbaka.");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setFilFel(`Kunde inte öppna filen: ${e.message || "okänt fel"}`);
    } finally {
      setOppnar(null);
    }
  }
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  /* Vilket kvitto som rättas just nu. Ett i taget — två öppna formulär mot samma
     tabell är ett sätt att skriva över sin egen ändring utan att märka det. */
  const [rattar, setRattar] = useState(null);
  const [loadError, setLoadError] = useState(null);

  async function load() {
    setLoading(true);
    /* Whose books. Without the filter, an accountant with access to a second set would
       see both merged into one list and one total — see lib/access.js. */
    const { data: { user } } = await sb.auth.getUser();
    const ownerId = readActiveOwnerId(user?.id);
    const { data, error } = await sb
      .from("studio_receipts")
      .select("*")
      .eq("user_id", ownerId)
      .order("receipt_date", { ascending: false })
      .limit(200);
    // Never swallow a Supabase {data, error} — this is the trap that cost a whole
    // session once. Log it and show it.
    if (error) {
      console.error("[receipts]", error.message);
      setLoadError(error.message);
    }
    setList(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const needsFx = list.filter((r) => r.currency !== "SEK" && r.total_sek == null);
  const untreated = list.filter((r) => !r.vat_treatment);
  const year = new Date().getFullYear();
  const spentThisYear = list
    .filter((r) => String(r.receipt_date || "").startsWith(String(year)))
    .reduce((sum, r) => sum + (Number(r.total_sek ?? (r.currency === "SEK" ? r.total : 0)) || 0), 0);
  const spent = money(spentThisYear, { decimals: 0 });

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">
      <h1 className="sr-only">Kvitton</h1>

      {/* Hero — what these receipts are worth, and the one action */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="micro-label">Kostnader {year}</span>
            <div className="mt-1.5 flex flex-wrap items-baseline">
              <span className="hero-figure" lang="sv-SE" aria-label={spent.spoken}>
                {spent.text.replace(/ kr$/, "")}
              </span>
              <span className="hero-unit">kr</span>
            </div>
            <p className="mt-2 text-[14.5px] text-ink-2">
              {num(list.length)} kvitton sparade · bilden är verifikationen
            </p>
          </div>
          <button
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink"
          >
            {open ? "Avbryt" : "Nytt kvitto"}
          </button>
        </div>
      </section>

      {open && (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <ReceiptCapture onSaved={() => { setOpen(false); load(); }} />
        </section>
      )}

      {/* Law 05 — the queue, with verbs. Absent entirely when there is nothing to do. */}
      {needsFx.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-crit/35 bg-crit-bg p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-crit">Åtgärda</span>
            <h2 className="text-[13.5px] font-medium text-crit">Saknar SEK-kurs</h2>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-2">
            {num(needsFx.length)} {needsFx.length === 1 ? "kvitto" : "kvitton"} i utländsk valuta är
            inte omräknade. De räknas inte med i momsdeklarationen förrän de är det, så perioden
            blir för låg.
          </p>
          <p className="mt-2 font-mono text-[11.5px] text-ink-3">node scripts/backfill-fx.mjs --write</p>
        </section>
      )}

      {untreated.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-warn/35 bg-warn-bg p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-warn">Granska</span>
            <h2 className="text-[13.5px] font-medium text-warn">Momsbehandling saknas</h2>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-2">
            {num(untreated.length)} {untreated.length === 1 ? "kvitto" : "kvitton"} saknar
            behandling. Utan den vet vi inte om momsen får dras av i ruta 48.
          </p>
        </section>
      )}

      {loadError && (
        <section className="rounded-[var(--radius-card)] border border-crit/35 bg-crit-bg p-4">
          <p className="text-[13px] text-ink-2">
            <span className="font-medium text-crit">Kunde inte hämta kvittona.</span>{" "}
            {loadError}
          </p>
        </section>
      )}

      {filFel && (
        <section className="rounded-[var(--radius-card)] border border-crit/35 bg-crit-bg p-4">
          <p className="text-[13px] text-ink-2">{filFel}</p>
        </section>
      )}

      {/* The ledger */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="mb-3 text-[15.5px] font-medium tracking-[-0.01em]">Kvitton</h2>

        {loading ? (
          <p className="py-10 text-center text-[13.5px] text-ink-3" role="status">Hämtar…</p>
        ) : list.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[14px] text-ink-2">Inga kvitton än.</p>
            <p className="mx-auto mt-1.5 max-w-[38ch] text-[13px] leading-relaxed text-ink-3">
              Fotografera det första — vi sparar bilden och en kontrollsumma, så att den
              går att bevisa oförändrad.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {list.map((r) => {
              const t = TREATMENT[r.vat_treatment];
              const missingFx = r.currency !== "SEK" && r.total_sek == null;
              const v = resolveVendor(r.vendor);
              const amount = money(r.total, { decimals: 2, currency: r.currency || "SEK" });
              const isOpen = expanded === r.id;
              return (
                <div key={r.id} className="border-b border-border last:border-b-0">
                  <button
                    onClick={() => { setExpanded(isOpen ? null : r.id); setRattar(null); }}
                    aria-expanded={isOpen}
                    className="grid w-full grid-cols-[1fr_auto] items-start gap-3 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-ink">
                        {v.name}
                        {r.file_hash && <span className="ml-1.5 text-ink-3" title="Bilden finns sparad">·</span>}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11.5px] text-ink-3">
                        {dateISO(r.receipt_date)}
                        {v.via && <> · via {v.via}</>}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {t ? <Chip tone={t.tone}>{t.label}</Chip> : <Chip tone="warn">behandling saknas</Chip>}
                        {missingFx && <Chip tone="crit">ingen SEK-kurs</Chip>}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tnum block font-mono text-[14px] font-medium" lang="sv-SE" aria-label={amount.spoken}>
                        {amount.text}
                      </span>
                      {r.currency !== "SEK" && !missingFx && (
                        <span className="tnum mt-0.5 block font-mono text-[11px] text-ink-3">
                          {money(r.total_sek, { decimals: 0 }).text}
                        </span>
                      )}
                    </span>
                  </button>

                  {isOpen && rattar === r.id && (
                    <KvittoRattelse
                      kvitto={r}
                      onAvbryt={() => setRattar(null)}
                      onSparad={() => { setRattar(null); load(); }}
                    />
                  )}

                  {/* Law 08 — density one tap down. Law 04 — the evidence is here. */}
                  {isOpen && (
                    <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[var(--radius-ctl)] bg-raised p-3.5 text-[12.5px]">
                      <dt className="micro-label pt-0.5">Verifikation</dt>
                      <dd className="text-ink-2">
                        {r.storage_path ? (
                          <button
                            type="button"
                            onClick={() => oppnaKvitto(r)}
                            disabled={oppnar === r.id}
                            className="underline underline-offset-2 hover:text-ink disabled:opacity-60"
                          >
                            {oppnar === r.id ? "Öppnar…" : `Visa ${r.file_mime === "application/pdf" ? "PDF" : "kvitto"}`}
                          </button>
                        ) : (
                          <span className="text-crit">Ingen fil — kvittot saknar underlag</span>
                        )}
                      </dd>

                      <dt className="micro-label pt-0.5">Moms</dt>
                      <dd className="tnum font-mono text-ink-2">{money(r.vat_amount, { decimals: 2 }).text}</dd>

                      <dt className="micro-label pt-0.5">Konto</dt>
                      <dd className="font-mono text-ink-2">{r.bas_account || "–"}{r.ne_row ? ` · NE ${r.ne_row}` : ""}</dd>

                      <dt className="micro-label pt-0.5">Verksamhet</dt>
                      <dd className="text-ink-2">{r.venture || "–"}</dd>

                      <dt className="micro-label pt-0.5">Andel affär</dt>
                      <dd className="tnum font-mono text-ink-2">{r.business_share == null ? "–" : num(Number(r.business_share) * 100) + " %"}</dd>

                      {r.description && (<>
                        <dt className="micro-label pt-0.5">Vad</dt>
                        <dd className="text-ink-2">{r.description}</dd>
                      </>)}

                      <dt className="micro-label pt-0.5">Kontrollsumma</dt>
                      <dd className="break-all font-mono text-[11px] text-ink-3">
                        {r.file_hash ? `sha256 ${r.file_hash.slice(0, 16)}…` : "ingen fil sparad"}
                      </dd>

                      {r.uploaded_at && (<>
                        <dt className="micro-label pt-0.5">Sparad</dt>
                        <dd className="text-ink-2">{dateProse(r.uploaded_at)}</dd>
                      </>)}

                      <dt className="micro-label pt-0.5">Rätta</dt>
                      <dd>
                        <button
                          type="button"
                          onClick={() => setRattar(rattar === r.id ? null : r.id)}
                          className="underline underline-offset-2 text-ink-2 hover:text-ink"
                        >
                          {rattar === r.id ? "Stäng formuläret" : "Ändra uppgifterna"}
                        </button>
                      </dd>
                    </dl>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="px-1 pb-2 text-[12px] leading-relaxed text-ink-3">
        Belopp visas i kvittots egen valuta, med SEK-motvärdet under när det finns. Kurserna
        hämtas från ECB på betalningsdagen. Kvitton utan kurs räknas inte med i någon period.
      </p>
    </div>
  );
}
