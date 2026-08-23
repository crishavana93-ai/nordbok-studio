/* app/invoices/[id]/page.js — DIRECTION A · KONTOR
 *
 * Two things stacked, and they are not the same kind of object:
 *
 *  1. THE CONTROLS — app chrome. Direction A: 400/500/600, hairlines, no shadows.
 *  2. THE DOCUMENT — a facsimile of what the customer receives. It obeys the
 *     invoice's own conventions rather than the app's, because that is the point of
 *     a facsimile. It still uses the app's tokens so it reads correctly in dark mode.
 *
 * ComplianceGate is mounted here, and this is the only place a draft can be sent.
 * It was written weeks ago and had never once rendered — the send button beside it
 * had its own code path that skipped the checks entirely.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { serverClient } from "@/lib/supabase-server";
import InvoiceActions from "./actions";
import ComplianceGate from "@/components/invoices/ComplianceGate";
import { money, num, pct, dateISO, daysPhrase } from "@/lib/format";
import { sellerIdentity } from "@/lib/seller";

export const dynamic = "force-dynamic";

const STATUS = {
  draft:          { label: "Utkast",     tone: "bg-raised text-ink-3" },
  sent:           { label: "Skickad",    tone: "bg-raised text-ink-2" },
  partially_paid: { label: "Delbetald",  tone: "bg-warn-bg text-warn" },
  paid:           { label: "Betald",     tone: "bg-good-bg text-good" },
  cancelled:      { label: "Makulerad",  tone: "bg-raised text-ink-3" },
};

function Kr({ value, decimals = 2, className = "" }) {
  const m = money(value, { decimals });
  return (
    <span className={`tnum ${className}`} lang="sv-SE" aria-label={m.spoken}>{m.text}</span>
  );
}

function Block({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="micro-label">{label}</span>
      <div className="text-[13px] leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

export default async function InvoiceView({ params }) {
  const { id } = await params;
  const sb = await serverClient();

  const { data: inv, error } = await sb
    .from("studio_invoices").select("*, studio_clients(*)").eq("id", id).maybeSingle();
  if (error) console.error("[invoice]", error.message);
  if (!inv) return notFound();

  const [{ data: items }, { data: settings }, { data: venture }] = await Promise.all([
    sb.from("studio_invoice_items").select("*").eq("invoice_id", id).order("position"),
    sb.from("studio_settings").select("*").eq("user_id", inv.user_id).maybeSingle(),
    inv.venture
      ? sb.from("studio_venture_identity").select("*")
          .eq("user_id", inv.user_id).eq("venture", inv.venture).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  /* One authority for the seller block, shared with the PDF and the email, so the
     three copies of this invoice can never disagree about who issued it. */
  const seller = sellerIdentity({ settings, venture, lang: inv.language === "en" ? "en" : "sv" });

  const c = inv.studio_clients;
  const s = STATUS[inv.status] || { label: inv.status, tone: "bg-raised text-ink-3" };
  const isDraft = inv.status === "draft";
  const termDays = inv.due_date && inv.issue_date
    ? Math.round((new Date(inv.due_date) - new Date(inv.issue_date)) / 86400000)
    : null;
  const daysToDue = inv.due_date
    ? Math.round((new Date(inv.due_date) - new Date(dateISO(new Date()))) / 86400000)
    : null;
  const unpaidAndDue = ["sent", "partially_paid"].includes(inv.status) && daysToDue != null;

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="micro-label">
            {inv.invoice_number ? `Faktura ${inv.invoice_number}` : "Utkast · inget nummer ännu"}
          </span>
          <h1 className="mt-1 truncate text-[21px] font-medium tracking-[-0.015em]">
            {c?.name || "Ingen kund vald"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`inline-block rounded px-2 py-0.5 font-mono text-[10.5px] font-medium ${s.tone}`}>
              {s.label}
            </span>
            {unpaidAndDue && (
              <span className={`font-mono text-[11.5px] ${daysToDue < 0 ? "text-crit" : "text-ink-3"}`}>
                {daysPhrase(daysToDue)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/invoices"
            className="rounded-[var(--radius-ctl)] border border-border-firm px-3 py-2 text-[13px] font-medium text-ink-2 hover:text-ink"
          >
            Tillbaka
          </Link>
          <InvoiceActions invoice={inv} />
        </div>
      </div>

      {/* ── The gate. The only route from draft to sent. ──────────────────── */}
      {isDraft && (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <h2 className="mb-1 text-[15.5px] font-medium tracking-[-0.01em]">Skicka fakturan</h2>
          <p className="mb-3.5 text-[12.5px] leading-relaxed text-ink-3">
            Vi kontrollerar mot kraven i mervärdesskattelagen 17 kap. innan något skickas.
          </p>
          <ComplianceGate invoiceId={inv.id} label="Kontrollera och skicka" />
        </section>
      )}

      {/* ── The document ─────────────────────────────────────────────────── */}
      <article className="rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-8">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="text-[19px] font-semibold tracking-[-0.015em]">{seller.headerName || "—"}</div>
            {seller.subLine && (
              <div className="mt-0.5 text-[12.5px] text-ink-2">{seller.subLine}</div>
            )}
            <div className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">
              {[
                settings?.address_street,
                [settings?.address_zip, settings?.address_city].filter(Boolean).join(" "),
                settings?.personnummer ? `Personnr: ${settings.personnummer}` : null,
                settings?.vat_number ? `Moms-nr: ${settings.vat_number}` : null,
                settings?.f_skatt_approved ? "Godkänd för F-skatt" : null,
              ].filter(Boolean).join("\n")}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[15px] font-semibold uppercase tracking-[0.14em]">Faktura</div>
            <dl className="mt-2.5 grid grid-cols-[auto_auto] justify-end gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-ink-3">Nr</dt>
              <dd className="font-mono text-ink">{inv.invoice_number || "—"}</dd>
              <dt className="text-ink-3">Datum</dt>
              <dd className="font-mono text-ink">{dateISO(inv.issue_date)}</dd>
              <dt className="text-ink-3">Förfaller</dt>
              <dd className="font-mono text-ink">{dateISO(inv.due_date)}</dd>
              <dt className="text-ink-3">OCR</dt>
              <dd className="tnum font-mono text-ink">{inv.ocr_number || "—"}</dd>
            </dl>
            {seller.brandLine && (
              <div className="mt-2 text-[12.5px] text-ink-2">{seller.brandLine}</div>
            )}
          </div>
        </header>

        <div className="mb-7 grid gap-6 sm:grid-cols-2">
          <Block label="Faktureras till">
            <div className="font-medium text-ink">{c?.name || "—"}</div>
            <div className="mt-0.5 whitespace-pre-line">
              {[
                c?.address_street,
                [c?.address_zip, c?.address_city].filter(Boolean).join(" "),
                c?.country_code && c.country_code !== "SE" ? c.country_code : null,
                c?.org_nr ? `Org-nr: ${c.org_nr}` : null,
                c?.vat_number ? `VAT: ${c.vat_number}` : null,
              ].filter(Boolean).join("\n")}
            </div>
          </Block>

          {inv.rot_rut_type && (
            <Block label={`${inv.rot_rut_type}-arbete`}>
              Fastighetsbeteckning:{" "}
              <span className="text-ink">{c?.fastighetsbeteckning || "—"}</span>
              <br />
              Personnr (kund): <span className="font-mono text-ink">{c?.org_nr || "—"}</span>
              <br />
              {inv.rot_rut_type}-avdrag:{" "}
              <Kr value={Number(inv.rot_amount) || Number(inv.rut_amount) || 0} className="text-ink" />
            </Block>
          )}
        </div>

        <div data-scroll-x className="mb-6">
          <table className="w-full min-w-[460px] border-collapse">
            <thead>
              <tr>
                <th className="micro-label border-b border-border px-2 py-2 text-left">Beskrivning</th>
                <th className="micro-label border-b border-border px-2 py-2 text-right">Antal</th>
                <th className="micro-label border-b border-border px-2 py-2 text-right">À-pris</th>
                <th className="micro-label border-b border-border px-2 py-2 text-right">Moms</th>
                <th className="micro-label border-b border-border px-2 py-2 text-right">Summa</th>
              </tr>
            </thead>
            <tbody>
              {(items || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-[13px] text-ink-3">
                    Inga rader på fakturan ännu.
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id}>
                    <td className="border-b border-border px-2 py-2.5 text-[13.5px]">
                      {it.description}
                      {it.rot_rut_hours ? (
                        <span className="text-ink-3"> · {num(it.rot_rut_hours)} arb.tim</span>
                      ) : null}
                    </td>
                    <td className="tnum border-b border-border px-2 py-2.5 text-right font-mono text-[13px] text-ink-2">
                      {num(it.quantity, { decimals: Number(it.quantity) % 1 ? 2 : 0 })} {it.unit}
                    </td>
                    <td className="border-b border-border px-2 py-2.5 text-right">
                      <Kr value={it.unit_price} className="font-mono text-[13px] text-ink-2" />
                    </td>
                    <td className="tnum border-b border-border px-2 py-2.5 text-right font-mono text-[13px] text-ink-2">
                      {pct(it.vat_rate)}
                    </td>
                    <td className="border-b border-border px-2 py-2.5 text-right">
                      <Kr value={Number(it.quantity) * Number(it.unit_price)} className="font-mono text-[13px]" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <dl className="grid w-full max-w-[300px] grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-[13.5px]">
            <dt className="text-ink-2">Delsumma</dt>
            <dd className="text-right"><Kr value={inv.subtotal} className="font-mono" /></dd>
            <dt className="text-ink-2">Moms</dt>
            <dd className="text-right"><Kr value={inv.vat_amount} className="font-mono" /></dd>
            {Number(inv.rot_amount) > 0 && (<>
              <dt className="text-ink-2">ROT-avdrag</dt>
              <dd className="text-right"><Kr value={-Math.abs(inv.rot_amount)} className="font-mono" /></dd>
            </>)}
            {Number(inv.rut_amount) > 0 && (<>
              <dt className="text-ink-2">RUT-avdrag</dt>
              <dd className="text-right"><Kr value={-Math.abs(inv.rut_amount)} className="font-mono" /></dd>
            </>)}
            <dt className="mt-2 border-t-2 border-ink pt-2.5 text-[15px] font-medium text-ink">Att betala</dt>
            <dd className="mt-2 border-t-2 border-ink pt-2.5 text-right">
              <Kr value={inv.total} className="font-mono text-[17px] font-medium" />
            </dd>
          </dl>
        </div>

        {inv.reverse_charge && (
          <p className="mt-6 rounded-[var(--radius-ctl)] bg-raised px-4 py-3 text-[13px] leading-relaxed text-ink-2">
            <span className="font-medium text-ink">Omvänd skattskyldighet.</span> Köparen
            redovisar moms enligt artikel 196 i mervärdesskattedirektivet.
          </p>
        )}

        <footer className="mt-7 grid gap-6 border-t border-border pt-5 sm:grid-cols-2">
          <Block label="Betalning">
            {settings?.bankgiro && (<>Bankgiro: <span className="font-mono text-ink">{settings.bankgiro}</span><br /></>)}
            {settings?.iban && (<>IBAN: <span className="font-mono text-ink">{settings.iban}</span><br /></>)}
            {settings?.plusgiro && (<>Plusgiro: <span className="font-mono text-ink">{settings.plusgiro}</span><br /></>)}
            Ange OCR: <span className="tnum font-mono text-ink">{inv.ocr_number || "—"}</span>
          </Block>
          <Block label="Villkor">
            Betalningsvillkor: {termDays != null ? `${num(termDays)} dagar` : "—"}
            <br />
            Dröjsmålsränta enligt räntelagen.
            {settings?.f_skatt_approved && (<><br />Godkänd för F-skatt.</>)}
          </Block>
        </footer>

        {inv.notes && (
          <p className="mt-5 border-t border-border pt-4 text-[13px] leading-relaxed text-ink-2">{inv.notes}</p>
        )}
      </article>
    </div>
  );
}
