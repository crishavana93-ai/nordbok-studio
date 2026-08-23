"use client";

/* app/invoices/new/page.js — DIRECTION A · KONTOR
 *
 * THIS PAGE CREATES A DRAFT. IT CANNOT SEND ONE.
 *
 * What it used to do, and why each part was wrong:
 *
 *  1. It PREDICTED the invoice number in JavaScript — `bumpNumber(lastNumber)` — and
 *     wrote it onto the draft. `next_invoice_number()` exists precisely so that a
 *     number is allocated inside a single statement under a row lock, because Swedish
 *     law requires an unbroken series. The send route only calls the allocator when the
 *     invoice has no number yet, so writing a predicted one here meant **the atomic
 *     allocator never ran**. Two tabs, or one double-click, produced two invoices
 *     carrying the same number.
 *  2. The number field was EDITABLE. A series you can type over is not a series.
 *  3. The predicted format was `2026-001`; the database emits `2026-0001`. The very
 *     first invoice would have been mis-formatted and the series table never initialised.
 *  4. `status: send ? "sent" : "draft"` marked the row **sent before validation ran**.
 *     If /api/invoices/send then rejected it as defective (422), the books were left
 *     holding an invoice recorded as sent that had never been sent, with a number that
 *     was never properly allocated.
 *
 * So: no number, no status choice, no send button. Save produces a draft and takes you
 * to it, where ComplianceGate is the only route to "sent" — the same rule that fixed
 * the bypass in app/invoices/[id]/actions.js. One door, and it is guarded.
 */

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { computeInvoice, generateOcrNumber } from "@/lib/swedish-tax";
import {
  CURRENCIES, COUNTRIES, COUNTRY_TO_CURRENCY, EU_COUNTRIES,
  suggestVatRate, isReverseChargeCandidate,
} from "@/lib/currency";
import { money, num, pct, dateISO } from "@/lib/format";
import { sellerIdentity } from "@/lib/seller";

const VAT_RATES = [25, 12, 6, 0];

const inputCls =
  "w-full rounded-[var(--radius-ctl)] border border-border bg-surface px-3 py-2.5 text-[16px] text-ink";

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="micro-label">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] leading-relaxed text-ink-3">{hint}</span>}
    </label>
  );
}

export default function NewInvoice() {
  const router = useRouter();
  const sb = useMemo(() => browserClient(), []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [settings, setSettings] = useState(null);
  const [clients, setClients] = useState([]);
  const [ventures, setVentures] = useState([]);
  const [venture, setVenture] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);

  const today = dateISO(new Date());
  const due30 = dateISO(new Date(Date.now() + 30 * 86400 * 1000));
  const [client_id, setClientId] = useState("");
  const [issue_date, setIssueDate] = useState(today);
  const [due_date, setDueDate] = useState(due30);
  const [currency, setCurrency] = useState("SEK");
  const [reference, setReference] = useState("");
  const [rot_rut_type, setRotRutType] = useState("");
  const [reverse_charge, setReverseCharge] = useState(false);
  const [oss_country, setOssCountry] = useState("");
  const [language, setLanguage] = useState("sv");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([
    { description: "", quantity: 1, unit: "st", unit_price: 0, vat_rate: 25, rot_rut_hours: "" },
  ]);

  const selectedClient = clients.find((c) => c.id === client_id);
  const selectedVenture = ventures.find((v) => v.venture === venture) || null;
  const seller = sellerIdentity({ settings, venture: selectedVenture, lang: language });

  useEffect(() => {
    (async () => {
      const { data: { user: me } } = await sb.auth.getUser();
      if (!me) return;
      const { data: s } = await sb.from("studio_settings").select("*").eq("user_id", me.id).maybeSingle();
      setSettings(s);
      if (s?.default_currency) setCurrency(s.default_currency);
      const { data: c } = await sb
        .from("studio_clients").select("*").eq("user_id", me.id).eq("archived", false).order("name");
      setClients(c || []);
      const { data: v } = await sb
        .from("studio_venture_identity").select("*").eq("user_id", me.id).order("display_name");
      setVentures(v || []);
      /* Default to the registered main name. Choosing nothing must never mean
         "invoice under an unregistered brand". */
      const primary = (v || []).find((x) => x.name_type === "primary");
      if (primary) setVenture(primary.venture);
    })();
  }, [sb]);

  /* Defaults cascade from the customer — country decides currency, VAT rate,
   * reverse charge and language. Typing them again for every invoice is how a form
   * becomes a chore. */
  useEffect(() => {
    if (!selectedClient) return;
    const country = selectedClient.country_code || "SE";
    setCurrency(selectedClient.preferred_currency || COUNTRY_TO_CURRENCY[country] || "SEK");
    const isB2B = Boolean(selectedClient.org_nr || selectedClient.vat_number);
    const rc = isReverseChargeCandidate({ country, vatNumber: selectedClient.vat_number });
    setReverseCharge(rc);
    const sug = suggestVatRate({ country, isBusiness: isB2B, vatNumber: selectedClient.vat_number });
    setItems((arr) => arr.map((it) => ({ ...it, vat_rate: sug })));
    if (selectedClient.language) setLanguage(selectedClient.language);
    setOssCountry(country !== "SE" && EU_COUNTRIES.has(country) && !rc ? country : "");
  }, [selectedClient]);

  const computed = useMemo(
    () => computeInvoice(items, { rot_rut_type, reverse_charge }),
    [items, rot_rut_type, reverse_charge]
  );

  const updateItem = (i, patch) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () =>
    setItems((arr) => [...arr, {
      description: "", quantity: 1, unit: "st", unit_price: 0,
      vat_rate: items[0]?.vat_rate ?? 25, rot_rut_hours: "",
    }]);
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  async function saveDraft() {
    setErr(""); setBusy(true);
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("Du är inte inloggad.");
      if (!settings?.business_name) throw new Error("Fyll först i företagsuppgifter under Inställningar.");
      if (!client_id) throw new Error("Välj eller skapa en kund.");
      if (!items.length || !items[0].description.trim()) throw new Error("Lägg till minst en rad.");

      const inv = {
        user_id: user.id,
        client_id,
        /* No invoice_number. next_invoice_number() allocates it at send time, under a
         * row lock, so the series can never gap or collide. Do not set it here. */
        status: "draft",
      venture: venture || null,
        issue_date, due_date, reference,
        ocr_number: generateOcrNumber(`${Date.now()}`),
        currency, language,
        subtotal: computed.subtotal,
        vat_amount: computed.vat_amount,
        total: computed.total,
        rot_amount: computed.rot_amount,
        rut_amount: computed.rut_amount,
        rot_rut_type: rot_rut_type || null,
        reverse_charge,
        oss_country: oss_country || null,
        payment_terms_days: Math.max(0, Math.round((new Date(due_date) - new Date(issue_date)) / 86400000)),
        notes,
      };

      const { data: inserted, error } = await sb.from("studio_invoices").insert(inv).select().single();
      if (error) throw error;

      const itemRows = items.map((it, position) => ({
        invoice_id: inserted.id, user_id: user.id, position,
        description: it.description,
        quantity: Number(it.quantity || 0),
        unit: it.unit || "st",
        unit_price: Number(it.unit_price || 0),
        vat_rate: Number(it.vat_rate || 0),
        rot_rut_hours: it.rot_rut_hours ? Number(it.rot_rut_hours) : null,
      }));
      const { error: e2 } = await sb.from("studio_invoice_items").insert(itemRows);
      if (e2) throw e2;

      router.push(`/invoices/${inserted.id}`);
      router.refresh();
    } catch (e) {
      setErr(e.message || String(e));
    } finally { setBusy(false); }
  }

  async function createClient(e) {
    e.preventDefault();
    setErr("");
    const payload = Object.fromEntries(new FormData(e.currentTarget));
    payload.country_code = (payload.country_code || "SE").toUpperCase();
    const { data: { user } } = await sb.auth.getUser();
    payload.user_id = user.id;
    const { data, error } = await sb.from("studio_clients").insert(payload).select().single();
    if (error) { setErr(error.message); return; }
    setClients((c) => [...c, data]);
    setClientId(data.id);
    setShowNewClient(false);
  }

  const isSE = (selectedClient?.country_code || "SE") === "SE";

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">
      <div>
        <h1 className="text-[21px] font-medium tracking-[-0.015em]">Ny faktura</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Det här skapar ett utkast. Fakturanumret tilldelas först när du skickar, så
          serien aldrig får luckor.
        </p>
      </div>

      {err && (
        <p className="rounded-[var(--radius-card)] border border-crit/35 bg-crit-bg px-4 py-3 text-[13px] text-ink-2">{err}</p>
      )}

      {/* ── Från ──────────────────────────────────────────────────────────────
          The seller, and the one field on this form with legal consequences for
          somebody else. Skatteverket's position is that the name here must be a
          registered företagsnamn -- or, if none is registered, the person's own name.
          A brand may sit beside it; it may never replace it. So the picker below
          chooses which VENTURE the work was done under, and lib/seller.js decides
          whether that name is allowed to head the invoice or has to appear as a
          reference line underneath. The preview shows the outcome before you save,
          because the alternative is finding out from your customer's bookkeeper. */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Från</h2>
          <a href="/settings"
            className="rounded-[var(--radius-ctl)] border border-border-firm px-3 py-1.5 font-mono text-[11.5px] font-medium text-ink-2 hover:text-ink">
            Ändra
          </a>
        </div>

        {ventures.length > 0 && (
          <Field
            label="Verksamhet"
            hint={
              selectedVenture?.name_type === "brand"
                ? "Varumärket är inte registrerat, så det står som referens på fakturan — säljaren förblir det registrerade namnet."
                : selectedVenture?.name_type === "sarskilt"
                ? "Särskilt företagsnamn: både det och verksamhetens huvudnamn måste visas, så båda skrivs ut."
                : "Registrerat företagsnamn — står som säljare på fakturan."
            }
          >
            <select className={inputCls} value={venture} onChange={(e) => setVenture(e.target.value)}>
              <option value="">Registrerat huvudnamn</option>
              {ventures.map((v) => (
                <option key={v.venture} value={v.venture}>
                  {v.display_name}{v.name_type === "brand" ? " · varumärke" : ""}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="rounded-[var(--radius-ctl)] bg-raised p-3.5">
          <span className="micro-label">Så här står det på fakturan</span>
          <div className="mt-1.5 text-[15.5px] font-medium tracking-[-0.01em]">
            {seller.headerName || "Ingen verksamhet namngiven"}
          </div>
          {seller.subLine && (
            <div className="mt-0.5 text-[12.5px] text-ink-2">{seller.subLine}</div>
          )}
          {seller.brandLine && (
            <div className="mt-1 font-mono text-[12px] text-ink-2">{seller.brandLine}</div>
          )}
          <div className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
            {[
              settings?.vat_number ? `Moms-nr ${settings.vat_number}` : "Moms-nr saknas",
              settings?.f_skatt_approved ? "Godkänd för F-skatt" : "F-skatt ej angiven",
              settings?.bankgiro
                ? `Bankgiro ${settings.bankgiro}`
                : settings?.iban ? `IBAN ${settings.iban}` : "Inget betalsätt angivet",
            ].join(" · ")}
          </div>
          <div className="mt-2 border-t border-border pt-2 font-mono text-[11.5px] text-ink-3">
            Skickas från {seller.fromEmail || "ingen avsändaradress angiven"}
          </div>
        </div>

        {seller.warning && (
          <p className="rounded-[var(--radius-ctl)] bg-crit-bg px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
            {seller.warning}
          </p>
        )}
      </section>

      {/* ── Kund ── */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Kund</h2>
        <Field label="Välj kund">
          <select className={inputCls} value={client_id} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Välj…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.country_code && c.country_code !== "SE" ? ` · ${c.country_code}` : ""}</option>
            ))}
          </select>
        </Field>

        <button
          type="button" onClick={() => setShowNewClient((v) => !v)}
          className="self-start rounded-[var(--radius-ctl)] border border-border-firm px-3 py-1.5 font-mono text-[11.5px] font-medium text-ink-2 hover:text-ink"
        >
          {showNewClient ? "Avbryt" : "Ny kund"}
        </button>

        {showNewClient && (
          <form onSubmit={createClient} className="flex flex-col gap-3 rounded-[var(--radius-ctl)] bg-raised p-3.5">
            <Field label="Namn *"><input name="name" required className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kontaktperson"><input name="contact_person" className={inputCls} /></Field>
              <Field label="E-post"><input name="email" type="email" className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Land">
                <select name="country_code" defaultValue="SE" className={inputCls}>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Föredragen valuta">
                <select name="preferred_currency" defaultValue="SEK" className={inputCls}>
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Org-nr / Personnr"><input name="org_nr" className={inputCls} /></Field>
              <Field label="VAT-nummer (EU)" hint="Krävs för omvänd skattskyldighet inom EU.">
                <input name="vat_number" className={inputCls} />
              </Field>
            </div>
            <Field label="Adress"><input name="address_street" className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Postnr"><input name="address_zip" className={inputCls} /></Field>
              <Field label="Ort"><input name="address_city" className={inputCls} /></Field>
            </div>
            <button type="submit" className="self-start rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink">
              Spara kund
            </button>
          </form>
        )}
      </section>

      {/* ── Faktura ── */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Faktura</h2>

        <div className="rounded-[var(--radius-ctl)] bg-raised px-3.5 py-3">
          <span className="micro-label">Fakturanummer</span>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            Tilldelas av databasen när fakturan skickas — nästa lediga i serien
            <span className="font-mono"> {new Date().getFullYear()}-NNNN</span>. Det går
            inte att välja själv, och det är avsiktligt: en nummerserie du kan skriva
            över är ingen nummerserie.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fakturadatum">
            <input type="date" className={inputCls} value={issue_date} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          <Field label="Förfallodatum">
            <input type="date" className={inputCls} value={due_date} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valuta">
            <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </Field>
          <Field label="Språk på fakturan">
            <select className={inputCls} value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="sv">Svenska</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>

        <Field label="Kundens referens"><input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`ROT/RUT-arbete${isSE ? "" : " (endast Sverige)"}`}>
            <select className={inputCls} value={rot_rut_type} disabled={!isSE}
              onChange={(e) => setRotRutType(e.target.value)}>
              <option value="">Nej</option>
              <option value="ROT">ROT</option>
              <option value="RUT">RUT</option>
            </select>
          </Field>
          <Field label="OSS-destinationsland (B2C EU)">
            <select className={inputCls} value={oss_country} onChange={(e) => setOssCountry(e.target.value)}>
              <option value="">—</option>
              {COUNTRIES.filter((c) => EU_COUNTRIES.has(c.code)).map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <label className="flex items-start gap-2.5">
          <input type="checkbox" checked={reverse_charge} onChange={(e) => setReverseCharge(e.target.checked)}
            className="mt-0.5 size-4" />
          <span className="text-[13.5px] leading-relaxed text-ink-2">
            <span className="font-medium text-ink">Omvänd skattskyldighet.</span> Ingen moms
            debiteras; köparen redovisar den. Kräver kundens VAT-nummer på fakturan.
          </span>
        </label>
      </section>

      {/* ── Rader ── */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Rader</h2>

        {items.map((it, i) => (
          <div key={i} className="flex flex-col gap-3 border-b border-border pb-4 last:border-b-0 last:pb-0">
            <Field label={`Rad ${i + 1}`}>
              <input className={inputCls} value={it.description} placeholder="Tjänst eller vara"
                onChange={(e) => updateItem(i, { description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Antal">
                <input type="number" step="0.01" className={inputCls} value={it.quantity}
                  onChange={(e) => updateItem(i, { quantity: e.target.value })} />
              </Field>
              <Field label="Enhet">
                <input className={inputCls} value={it.unit} onChange={(e) => updateItem(i, { unit: e.target.value })} />
              </Field>
              <Field label="À-pris exkl. moms">
                <input type="number" step="0.01" className={inputCls} value={it.unit_price}
                  onChange={(e) => updateItem(i, { unit_price: e.target.value })} />
              </Field>
              <Field label="Moms">
                <select className={inputCls} value={it.vat_rate}
                  onChange={(e) => updateItem(i, { vat_rate: Number(e.target.value) })}>
                  {VAT_RATES.map((r) => <option key={r} value={r}>{pct(r)}</option>)}
                </select>
              </Field>
            </div>
            {rot_rut_type && (
              <Field label="Arbetstimmar" hint="Endast arbetskostnad ger ROT/RUT — material räknas inte.">
                <input type="number" step="0.5" className={inputCls} value={it.rot_rut_hours}
                  onChange={(e) => updateItem(i, { rot_rut_hours: e.target.value })} />
              </Field>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="tnum font-mono text-[13px] text-ink-2">
                {money(Number(it.quantity || 0) * Number(it.unit_price || 0), { decimals: 2, currency }).text}
              </span>
              {items.length > 1 && (
                <button type="button" onClick={() => removeItem(i)}
                  className="rounded-[var(--radius-ctl)] border border-border-firm px-2.5 py-1 font-mono text-[11.5px] font-medium text-ink-2 hover:text-crit">
                  Ta bort
                </button>
              )}
            </div>
          </div>
        ))}

        <button type="button" onClick={addItem}
          className="self-start rounded-[var(--radius-ctl)] border border-border-firm px-3 py-1.5 font-mono text-[11.5px] font-medium text-ink-2 hover:text-ink">
          Lägg till rad
        </button>
      </section>

      {/* ── Summa ── */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <div className="flex justify-end">
          <dl className="grid w-full max-w-[300px] grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-[13.5px]">
            <dt className="text-ink-2">Delsumma</dt>
            <dd className="tnum text-right font-mono">{money(computed.subtotal, { decimals: 2, currency }).text}</dd>
            <dt className="text-ink-2">Moms</dt>
            <dd className="tnum text-right font-mono">{money(computed.vat_amount, { decimals: 2, currency }).text}</dd>
            {computed.rot_amount > 0 && (<>
              <dt className="text-ink-2">ROT-avdrag</dt>
              <dd className="tnum text-right font-mono">{money(-computed.rot_amount, { decimals: 2, currency }).text}</dd>
            </>)}
            {computed.rut_amount > 0 && (<>
              <dt className="text-ink-2">RUT-avdrag</dt>
              <dd className="tnum text-right font-mono">{money(-computed.rut_amount, { decimals: 2, currency }).text}</dd>
            </>)}
            <dt className="mt-2 border-t-2 border-ink pt-2.5 text-[15px] font-medium text-ink">Att betala</dt>
            <dd className="tnum mt-2 border-t-2 border-ink pt-2.5 text-right font-mono text-[17px] font-medium">
              {money(computed.total, { decimals: 2, currency }).text}
            </dd>
          </dl>
        </div>
      </section>

      <Field label="Noteringar på fakturan">
        <textarea rows={3} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="flex flex-wrap gap-2.5">
        <button onClick={saveDraft} disabled={busy}
          className="rounded-[var(--radius-ctl)] bg-brand px-4 py-3 text-[14px] font-semibold text-brand-ink disabled:opacity-40">
          {busy ? "Sparar…" : "Spara utkast"}
        </button>
        <button onClick={() => router.push("/invoices")} disabled={busy}
          className="rounded-[var(--radius-ctl)] border border-border-firm px-4 py-3 text-[14px] font-medium text-ink-2">
          Avbryt
        </button>
      </div>

      <p className="px-1 pb-2 text-[12px] leading-relaxed text-ink-3">
        Nästa steg är granskning: när du sparat öppnas fakturan, och där kontrolleras den
        mot mervärdesskattelagen 17 kap. innan den kan skickas. Först då tilldelas
        fakturanumret.
      </p>
    </div>
  );
}
