"use client";

/* app/settings/page.js — DIRECTION C
 *
 * Migrated off the legacy stylesheet 2026-08-24. Three things changed beyond colour:
 *
 * 1. EVERY FIELD IS NOW LABELLED. The old markup put <label> and <input> side by side
 *    as siblings with no htmlFor and no wrapping — `grep htmlFor` across the whole app
 *    returned nothing. A screen reader announced all nineteen of these as "edit text,
 *    blank". Field below wraps, which associates them without needing ids.
 *
 * 2. THE KEYBOARD MATCHES THE FIELD. app/mobile.css carried
 *    `input[type="number"] { inputmode: decimal }` — there is no such CSS property; it
 *    is an HTML attribute and the rule did nothing. On a phone, personnummer, postnr,
 *    bankgiro and IBAN all opened the alphabetic keyboard.
 *
 * 3. THE TIPS BECAME HINTS. Tip renders a button, and a button inside a <label> steals
 *    the click that should focus the input. The text was good; it now sits under the
 *    field where it is always visible instead of behind a hover that a touch device
 *    cannot perform.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { validPersonnummer, validOrgNr, buildVatNumber } from "@/lib/swedish-tax";
import { CURRENCIES } from "@/lib/currency";
import { reportErrorAsync } from "@/lib/report-error";
import DeladAtkomst from "@/components/settings/DeladAtkomst";
import Verksamheter from "@/components/settings/Verksamheter";
import Felhistorik from "@/components/settings/Felhistorik";

const inputCls =
  "w-full rounded-[var(--radius-ctl)] border border-border bg-surface px-3 py-2.5 text-[16px] text-ink " +
  "focus:border-border-firm focus:outline-none focus:ring-2 focus:ring-brand/25";

function Field({ label, hint, required, children, wide }) {
  return (
    <label className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="micro-label">
        {label}{required && <span className="text-crit"> *</span>}
      </span>
      {children}
      {hint && <span className="text-[11.5px] leading-relaxed text-ink-3">{hint}</span>}
    </label>
  );
}

function Section({ title, note, children, cols = 2 }) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">{title}</h2>
        {note && <p className="text-[12.5px] leading-relaxed text-ink-3">{note}</p>}
      </div>
      <div className={`grid gap-4 ${cols === 2 ? "sm:grid-cols-2" : ""}`}>{children}</div>
    </section>
  );
}

function Check({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <input
        type="checkbox" checked={checked} onChange={onChange}
        className="mt-[3px] size-[18px] shrink-0 accent-[var(--brand)]"
      />
      <span className="text-[14px] leading-relaxed text-ink-2">{children}</span>
    </label>
  );
}

export default function SettingsPage() {
  const sb = useMemo(() => browserClient(), []);
  const [s, setS] = useState(null);
  const [n, setN] = useState(null);
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const [err, setErr] = useState("");
  const [dirty, setDirty] = useState(false);
  const alertRef = useRef(null);

  /* Update helpers that also mark the form dirty, so the save button can say whether
     there is anything to save rather than looking identical either way. */
  const set = (patch) => { setS((v) => ({ ...v, ...patch })); setDirty(true); setInfo(""); };
  const setNotif = (patch) => { setN((v) => ({ ...v, ...patch })); setDirty(true); setInfo(""); };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      setUser(user);
      const { data: settings, error: e1 } = await sb
        .from("studio_settings").select("*").eq("user_id", user.id).maybeSingle();
      if (e1) { setErr("Kunde inte läsa inställningarna."); reportErrorAsync(e1, { scope: "ui/settings" }); }
      setS(settings || { user_id: user.id, default_vat_rate: 25, default_payment_terms_days: 30, f_skatt_approved: true });
      const { data: prefs } = await sb
        .from("studio_notif_prefs").select("*").eq("user_id", user.id).maybeSingle();
      setN(prefs || { user_id: user.id, email_digest: true, email_deadlines: true, email_invoice_paid: true, email_invoice_overdue: true, digest_day: 1, digest_hour: 8 });
    })();
  }, [sb]);

  /* Move focus to the message so it is announced and not merely painted. */
  useEffect(() => { if (err || info) alertRef.current?.focus(); }, [err, info]);

  async function save(e) {
    e.preventDefault(); setErr(""); setInfo(""); setBusy(true);
    try {
      if (s.personnummer && !validPersonnummer(s.personnummer)) {
        throw new Error("Personnumret ser inte rätt ut — kontrollsiffran stämmer inte. Format: 12 siffror, t.ex. 199309199090.");
      }
      if (s.org_nr && !validOrgNr(s.org_nr)) throw new Error("Organisationsnumret ser inte rätt ut. 10 siffror.");

      const next = { ...s };
      if (!next.vat_number && (next.personnummer || next.org_nr)) {
        next.vat_number = buildVatNumber(next.personnummer || next.org_nr);
      }

      const { error: e1 } = await sb.from("studio_settings")
        .upsert({ ...next, user_id: user.id, updated_at: new Date().toISOString() });
      if (e1) throw e1;
      const { error: e2 } = await sb.from("studio_notif_prefs").upsert({ ...n, user_id: user.id });
      if (e2) throw e2;

      setS(next);
      setDirty(false);
      setInfo("Sparat.");
    } catch (e2) {
      setErr(e2.message || "Kunde inte spara.");
      reportErrorAsync(e2, { scope: "ui/settings-save" });
    } finally { setBusy(false); }
  }

  if (!s) {
    return <p className="mx-auto w-full max-w-[820px] py-12 text-[14px] text-ink-3">Laddar…</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">
      <div>
        <h1 className="text-[21px] font-medium tracking-[-0.015em]">Inställningar</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Det här hamnar på dina fakturor och styr hur momsen räknas. Ändringar gäller
          framåt — redan skickade fakturor rör sig inte.
        </p>
      </div>

      {(info || err) && (
        <p
          ref={alertRef} tabIndex={-1} role="alert"
          className={`rounded-[var(--radius-card)] border px-4 py-3 text-[13px] leading-relaxed outline-none ${
            err ? "border-crit/35 bg-crit-bg text-ink-2" : "border-good/35 bg-good-bg text-ink-2"
          }`}
        >
          {err || info}
        </p>
      )}

      <form onSubmit={save} className="flex flex-col gap-3">

        <Section title="Företagsuppgifter"
          note="Säljaren på fakturan. Måste vara ett namn som är registrerat hos Bolagsverket — annars ditt eget för- och efternamn.">
          <Field label="Företagsnamn" required wide>
            <input className={inputCls} required autoComplete="organization"
              value={s.business_name || ""} onChange={(e) => set({ business_name: e.target.value })}
              placeholder="t.ex. Turquino Studios" />
          </Field>

          <Field label="Personnummer"
            hint="Din skatteidentitet som enskild näringsidkare. Står på fakturan så kunden kan betala rätt. 12 siffror.">
            <input className={inputCls} inputMode="numeric" autoComplete="off"
              value={s.personnummer || ""} onChange={(e) => set({ personnummer: e.target.value })}
              placeholder="199309199090" />
          </Field>

          <Field label="Organisationsnummer"
            hint="Frivilligt för enskild firma. Ansök hos Bolagsverket om du hellre vill ha ett separat orgnr än personnummer på fakturorna.">
            <input className={inputCls} inputMode="numeric" autoComplete="off"
              value={s.org_nr || ""} onChange={(e) => set({ org_nr: e.target.value })} />
          </Field>

          <Field label="Momsregistreringsnummer"
            hint="SE + personnummer + 01. Lämna tomt så byggs det när du sparar.">
            <input className={inputCls} autoComplete="off"
              value={s.vat_number || ""} onChange={(e) => set({ vat_number: e.target.value })}
              placeholder="fylls i automatiskt" />
          </Field>

          <Field label="Godkänd för F-skatt"
            hint="Utan F-skatt måste din kund hålla inne 30 % i preliminärskatt. Ansök på skatteverket.se.">
            <select className={inputCls} value={s.f_skatt_approved ? "1" : "0"}
              onChange={(e) => set({ f_skatt_approved: e.target.value === "1" })}>
              <option value="1">Ja — visa på fakturor</option>
              <option value="0">Nej</option>
            </select>
          </Field>

          <Field label="Adress" wide>
            <input className={inputCls} autoComplete="street-address"
              value={s.address_street || ""} onChange={(e) => set({ address_street: e.target.value })} />
          </Field>
          <Field label="Postnummer">
            <input className={inputCls} inputMode="numeric" autoComplete="postal-code"
              value={s.address_zip || ""} onChange={(e) => set({ address_zip: e.target.value })} />
          </Field>
          <Field label="Ort">
            <input className={inputCls} autoComplete="address-level2"
              value={s.address_city || ""} onChange={(e) => set({ address_city: e.target.value })} />
          </Field>
        </Section>

        <Section title="Hur du får betalt"
          note="Minst ett av dessa måste finnas, annars stoppas fakturan innan den skickas.">
          <Field label="Bankgiro">
            <input className={inputCls} inputMode="numeric" autoComplete="off"
              value={s.bankgiro || ""} onChange={(e) => set({ bankgiro: e.target.value })} placeholder="123-4567" />
          </Field>
          <Field label="Plusgiro">
            <input className={inputCls} inputMode="numeric" autoComplete="off"
              value={s.plusgiro || ""} onChange={(e) => set({ plusgiro: e.target.value })} />
          </Field>
          <Field label="IBAN" hint="För kunder utanför Sverige." wide>
            <input className={inputCls} autoComplete="off"
              value={s.iban || ""} onChange={(e) => set({ iban: e.target.value })}
              placeholder="SE45 5000 0000 0583 9825 7466" />
          </Field>
        </Section>

        <Section title="Utskick"
          note="Fakturor går via e-postleverantörens servrar, inte via ditt mailprogram — därför syns de aldrig i mappen Skickat.">
          <Field label="Avsändaradress"
            hint="Domänen måste vara verifierad hos leverantören, annars vägrar utskicket. En verksamhet kan ha en egen adress som går före den här.">
            <input className={inputCls} type="email" inputMode="email" autoComplete="email"
              value={s.from_email || ""} onChange={(e) => set({ from_email: e.target.value })}
              placeholder="hello@turquinostudios.com" />
          </Field>
          <Field label="Blindkopia till"
            hint="Lägger en riktig kopia av varje skickad faktura i din egen inkorg.">
            <input className={inputCls} type="email" inputMode="email" autoComplete="email"
              value={s.invoice_bcc || ""} onChange={(e) => set({ invoice_bcc: e.target.value })} />
          </Field>
          <Field label="Svar på fakturor går till" wide>
            <input className={inputCls} type="email" inputMode="email" autoComplete="email"
              value={s.contact_email || user?.email || ""} onChange={(e) => set({ contact_email: e.target.value })} />
          </Field>
        </Section>

        <Section title="Standardvärden på nya fakturor">
          <Field label="Betalningsvillkor">
            <input className={inputCls} type="number" inputMode="numeric" min={0} max={365}
              value={s.default_payment_terms_days ?? 30}
              onChange={(e) => set({ default_payment_terms_days: Number(e.target.value) })} />
          </Field>
          <Field label="Momssats">
            <select className={inputCls} value={s.default_vat_rate ?? 25}
              onChange={(e) => set({ default_vat_rate: Number(e.target.value) })}>
              <option value={25}>25 %</option><option value={12}>12 %</option>
              <option value={6}>6 %</option><option value={0}>0 %</option>
            </select>
          </Field>
          <Field label="Valuta"
            hint="Fakturerar du en svensk kund ska det nästan alltid vara SEK — en faktura i annan valuta måste dessutom visa momsen i kronor.">
            <select className={inputCls} value={s.default_currency || "SEK"}
              onChange={(e) => set({ default_currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
            </select>
          </Field>
          <Field label="OSS-registrerad"
            hint="Krävs vid B2C-försäljning inom EU över 99 680 kr per år.">
            <select className={inputCls} value={s.oss_registered ? "1" : "0"}
              onChange={(e) => set({ oss_registered: e.target.value === "1" })}>
              <option value="0">Nej</option><option value="1">Ja</option>
            </select>
          </Field>
          <Field label="Text längst ner på fakturan" wide
            hint="T.ex. webbplats eller säljvillkor. En verksamhet kan ha en egen som går före.">
            <textarea rows={3} className={inputCls}
              value={s.invoice_footer || ""} onChange={(e) => set({ invoice_footer: e.target.value })} />
          </Field>
        </Section>

        <Section title="Notiser" cols={1}
          note="Skickas till din e-post. Push till telefonen är inte igång ännu.">
          <div className="flex flex-col divide-y divide-border">
            <Check checked={!!n?.email_digest} onChange={(e) => setNotif({ email_digest: e.target.checked })}>
              Veckosammanfattning — kvitton, fakturor och deadlines
            </Check>
            <Check checked={!!n?.email_deadlines} onChange={(e) => setNotif({ email_deadlines: e.target.checked })}>
              Deadlines hos Skatteverket — moms, NE-bilaga, F-skatt
            </Check>
            <Check checked={!!n?.email_invoice_overdue} onChange={(e) => setNotif({ email_invoice_overdue: e.target.checked })}>
              Obetalda fakturor, tre dagar efter förfallodagen
            </Check>
            <Check checked={!!n?.email_invoice_paid} onChange={(e) => setNotif({ email_invoice_paid: e.target.checked })}>
              När en faktura betalas
            </Check>
          </div>
        </Section>

        <div className="flex flex-wrap items-center gap-3 pb-1">
          <button type="submit" disabled={busy || !dirty}
            className="rounded-[var(--radius-ctl)] bg-brand px-4 py-3 text-[14px] font-semibold text-brand-ink disabled:opacity-40">
            {busy ? "Sparar…" : dirty ? "Spara ändringar" : "Sparat"}
          </button>
          {dirty && !busy && (
            <span className="text-[12.5px] text-ink-3">Du har ändringar som inte är sparade.</span>
          )}
        </div>
      </form>

      {/* Outside the form on purpose: each has its own submit, and nesting forms is
          invalid HTML — the inner one silently stops working. */}
      <Felhistorik />
      <Verksamheter />
      <DeladAtkomst />
    </div>
  );
}
