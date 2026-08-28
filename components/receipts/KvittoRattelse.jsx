"use client";

/* components/receipts/KvittoRattelse.jsx — rätta ett sparat kvitto
 *
 * Skärmen kunde tala om att momsbehandlingen saknades men inte låta någon
 * sätta den. Ett kvitto med fel behandling var alltså synligt fel, permanent,
 * tills någon gick in i databasen. Det här är vägen som saknades.
 *
 * Formuläret rättar. Det suddar inte: varje ändring skrivs som en rättelse med
 * före- och eftervärde (BFL 5 kap. 5 §), och historiken visas under fälten.
 * Underlaget — bilden och kontrollsumman — går inte att röra härifrån.
 */

import { useState } from "react";

const BEHANDLINGAR = [
  { v: "domestic",    label: "Svensk moms",
    hint: "Leverantören är svensk och har debiterat moms. Den dras av i sin helhet i ruta 48." },
  { v: "rc_eu",       label: "Omvänd betalningsskyldighet — EU",
    hint: "Leverantören inom EU fakturerar UTAN moms. Du redovisar både utgående och ingående moms själv; de tar ut varandra. Momsbeloppet ska vara 0." },
  { v: "rc_non_eu",   label: "Omvänd betalningsskyldighet — utanför EU",
    hint: "Tjänst från land utanför EU, fakturerad UTAN moms. Du redovisar båda leden själv. Momsbeloppet ska vara 0." },
  { v: "oss_non_ded", label: "OSS — utländsk moms, ej avdragsgill",
    hint: "Leverantören debiterade sitt eget lands moms för att den inte visste att du är momsregistrerad. Momsen går inte att få tillbaka i Sverige — hela beloppet är i stället en kostnad." },
  { v: "exempt",      label: "Undantagen eller momsfri",
    hint: "Ingen moms alls: bank, försäkring, vård, utbildning och liknande." },
];

const VERKSAMHETER = [
  { v: "", label: "—" },
  { v: "turquino", label: "Turquino" },
  { v: "the_next_cigar", label: "The Next Cigar" },
  { v: "zamacharters", label: "Zama Charters" },
  { v: "skattenavigator", label: "Skattenavigator" },
  { v: "cruiseshuttle", label: "Cruise Shuttle" },
  { v: "ifmba", label: "IFMBA" },
  { v: "other", label: "Övrigt" },
];

const FALTNAMN = {
  vendor: "Leverantör", receipt_date: "Datum", total: "Belopp", vat_amount: "Moms",
  vat_rate: "Momssats", currency: "Valuta", category: "Kategori", description: "Vad",
  bas_account: "Konto", ne_row: "NE-rad", vat_treatment: "Momsbehandling",
  venture: "Verksamhet", business_share: "Andel affär", is_business: "Affärsutgift",
  is_deductible: "Avdragsgill", payment_method: "Betalsätt",
  total_sek: "Belopp i SEK", vat_sek: "Moms i SEK",
};

const visa = (v) =>
  v === null || v === undefined || v === "" ? "—"
  : v === true ? "ja" : v === false ? "nej"
  : String(v);

export default function KvittoRattelse({ kvitto, onSparad, onAvbryt }) {
  const [form, setForm] = useState(() => ({
    vendor: kvitto.vendor ?? "",
    receipt_date: kvitto.receipt_date ?? "",
    total: kvitto.total ?? "",
    vat_amount: kvitto.vat_amount ?? "",
    currency: kvitto.currency ?? "SEK",
    vat_treatment: kvitto.vat_treatment ?? "",
    category: kvitto.category ?? "",
    description: kvitto.description ?? "",
    bas_account: kvitto.bas_account ?? "",
    ne_row: kvitto.ne_row ?? "",
    venture: kvitto.venture ?? "",
    business_share: kvitto.business_share ?? 1,
    is_business: kvitto.is_business !== false,
    skal: "",
  }));
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState(null);
  const [notis, setNotis] = useState(null);
  const [historik, setHistorik] = useState(null);

  const satt = (k) => (e) => {
    const el = e.target;
    setForm((f) => ({ ...f, [k]: el.type === "checkbox" ? el.checked : el.value }));
    setFel(null);
  };

  const vald = BEHANDLINGAR.find((b) => b.v === form.vat_treatment);

  /* Motsägelsen som fällde SIE-exporten, sagd innan den sparas i stället för
     efteråt. Servern stoppar den ändå — det här gör bara att den syns medan
     man fortfarande tittar på fälten. */
  const momsTal = form.vat_amount === "" ? 0 : Number(form.vat_amount);
  const motsagelse =
    (form.vat_treatment === "rc_eu" || form.vat_treatment === "rc_non_eu") && momsTal > 0
      ? `Omvänd betalningsskyldighet betyder att leverantören inte debiterade någon moms — ` +
        `men här står ${String(momsTal).replace(".", ",")}. Debiterade den moms är behandlingen ` +
        `"OSS — utländsk moms, ej avdragsgill". Gjorde den inte det ska momsen vara 0.`
      : form.vat_treatment === "oss_non_ded" && momsTal === 0
      ? "OSS-behandlingen förutsätter att leverantören debiterade moms. Står ingen moms på kvittot är det omvänd betalningsskyldighet i stället."
      : null;

  async function hamtaHistorik() {
    try {
      const res = await fetch(`/api/receipts/${kvitto.id}`);
      const j = await res.json();
      setHistorik(j.rattelser || []);
    } catch { setHistorik([]); }
  }

  async function spara(e) {
    e.preventDefault();
    setSparar(true); setFel(null); setNotis(null);
    try {
      const res = await fetch(`/api/receipts/${kvitto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          total: form.total === "" ? null : Number(form.total),
          vat_amount: form.vat_amount === "" ? 0 : Number(form.vat_amount),
          business_share: Number(form.business_share),
          venture: form.venture || null,
          category: form.category || null,
          description: form.description || null,
          bas_account: form.bas_account || null,
          ne_row: form.ne_row || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setFel(j.error || `Kunde inte spara (${res.status}).`); return; }
      if (j.oforandrad) { setNotis("Ingenting var ändrat."); return; }
      setNotis(j.note || `Rättat: ${(j.andrade || []).map((f) => FALTNAMN[f] || f).join(", ")}.`);
      onSparad?.(j.receipt);
    } catch (e2) {
      setFel(e2.message || "Kunde inte spara.");
    } finally {
      setSparar(false);
    }
  }

  const inputCls =
    "w-full rounded-[var(--radius-ctl)] border border-border bg-surface px-3 py-2 text-[16px] text-ink";

  return (
    <form onSubmit={spara} className="mb-3 flex flex-col gap-3 rounded-[var(--radius-ctl)] border border-border bg-raised p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13.5px] font-medium text-ink">Rätta kvittot</h3>
        <span className="text-[12px] text-ink-3">Bilden och kontrollsumman rörs inte.</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="micro-label">Leverantör</span>
          <input className={inputCls} value={form.vendor} onChange={satt("vendor")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="micro-label">Datum</span>
          <input type="date" className={inputCls} value={form.receipt_date} onChange={satt("receipt_date")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="micro-label">Belopp</span>
          <input type="number" step="0.01" inputMode="decimal" className={inputCls}
            value={form.total} onChange={satt("total")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="micro-label">Moms</span>
          <input type="number" step="0.01" inputMode="decimal" className={inputCls}
            value={form.vat_amount} onChange={satt("vat_amount")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="micro-label">Valuta</span>
          <input className={inputCls} maxLength={3} value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="micro-label">Konto</span>
          <input className={inputCls} inputMode="numeric" value={form.bas_account} onChange={satt("bas_account")} />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="micro-label">Momsbehandling</span>
        <select className={inputCls} value={form.vat_treatment} onChange={satt("vat_treatment")}>
          <option value="">— välj —</option>
          {BEHANDLINGAR.map((b) => <option key={b.v} value={b.v}>{b.label}</option>)}
        </select>
      </label>
      {vald && <p className="-mt-1 text-[12.5px] leading-relaxed text-ink-3">{vald.hint}</p>}

      {motsagelse && (
        <div className="rounded-[var(--radius-ctl)] border border-crit/35 bg-crit-bg p-3">
          <p className="text-[13px] leading-relaxed text-ink">{motsagelse}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="micro-label">Verksamhet</span>
          <select className={inputCls} value={form.venture} onChange={satt("venture")}>
            {VERKSAMHETER.map((v) => <option key={v.v} value={v.v}>{v.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="micro-label">Andel affär</span>
          <input type="number" step="0.05" min="0" max="1" inputMode="decimal" className={inputCls}
            value={form.business_share} onChange={satt("business_share")} />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="micro-label">Vad</span>
        <input className={inputCls} value={form.description} onChange={satt("description")} />
      </label>

      <label className="flex items-center gap-2.5">
        <input type="checkbox" className="size-4" checked={form.is_business} onChange={satt("is_business")} />
        <span className="text-[13px] text-ink-2">Affärsutgift — avmarkera om det här visade sig vara privat</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="micro-label">Varför rättas det?</span>
        <input className={inputCls} placeholder="t.ex. Anthropic debiterade moms — inte omvänd skattskyldighet"
          value={form.skal} onChange={satt("skal")} />
        <span className="text-[12px] leading-relaxed text-ink-3">
          Frivilligt, men det är den enda delen en revisor faktiskt läser. Sparas tillsammans
          med före- och eftervärdet.
        </span>
      </label>

      {fel && (
        <div className="rounded-[var(--radius-ctl)] border border-crit/35 bg-crit-bg p-3">
          <p className="text-[13px] leading-relaxed text-ink">{fel}</p>
        </div>
      )}
      {notis && !fel && (
        <div className="rounded-[var(--radius-ctl)] border border-good/35 bg-good-bg p-3">
          <p className="text-[13px] leading-relaxed text-ink">{notis}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={sparar}
          className="rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink disabled:opacity-60">
          {sparar ? "Sparar…" : "Spara rättelsen"}
        </button>
        <button type="button" onClick={onAvbryt}
          className="rounded-[var(--radius-ctl)] border border-border px-4 py-2.5 text-[14px] text-ink-2">
          Avbryt
        </button>
        <button type="button" onClick={hamtaHistorik}
          className="text-[13px] text-ink-3 underline underline-offset-2 hover:text-ink">
          Visa rättelsehistorik
        </button>
      </div>

      {historik !== null && (
        <div className="border-t border-border pt-3">
          {historik.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">Kvittot har inte rättats tidigare.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {historik.map((h) => (
                <li key={h.id} className="text-[12.5px] leading-relaxed text-ink-2">
                  <span className="font-mono text-[11.5px] text-ink-3">
                    {new Date(h.created_at).toLocaleString("sv-SE")}
                  </span>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {(h.falt || []).map((f) => (
                      <li key={f}>
                        {FALTNAMN[f] || f}: <span className="text-ink-3 line-through">{visa(h.fore?.[f])}</span>
                        {" → "}
                        <span className="text-ink">{visa(h.efter?.[f])}</span>
                      </li>
                    ))}
                  </ul>
                  {h.skal && <p className="mt-1 text-ink-3">”{h.skal}”</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
