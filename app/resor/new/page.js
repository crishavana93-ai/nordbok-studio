"use client";

/* app/resor/new/page.js — DIRECTION C
 *
 * Migrated 2026-08-24. Beyond colour: the client picker is scoped to the active owner,
 * every field is inside a <label>, and the whole thing is a real <form> so Enter
 * submits instead of doing nothing.
 *
 * The Tip component is gone from this page for the same reason it left Inställningar —
 * it renders a button, and a button inside a <label> steals the click that should
 * focus the field. The text it carried now sits under the field permanently.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { COUNTRIES, CURRENCIES, COUNTRY_TO_CURRENCY } from "@/lib/currency";
import { readActiveOwnerId } from "@/lib/owner-client";
import { reportErrorAsync } from "@/lib/report-error";

export default function NewTrip() {
  const router = useRouter();
  const sb = useMemo(() => browserClient(), []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [clients, setClients] = useState([]);

  const today = new Date().toISOString().slice(0, 10);
  const [t, setT] = useState({
    title: "", destination: "", country_code: "SE",
    start_date: today, end_date: today,
    purpose: "", conference: "",
    client_id: "", travel_mode: "flight", vehicle_reg: "",
    estimated_cost: "", currency: "SEK",
    uses_traktamente: true, status: "planned",
    private_days: 0, notes: "",
  });
  const [contacts, setContacts] = useState([]);
  const [contact, setContact] = useState({ name: "", company: "", role: "", email: "" });

  useEffect(() => {
    /* Scoped. Unfiltered, this offered another owner's customers to attach to your
       trip once revisor access existed. */
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data, error } = await sb.from("studio_clients")
        .select("id,name,country_code")
        .eq("user_id", readActiveOwnerId(user.id))
        .eq("archived", false).order("name");
      if (error) reportErrorAsync(error, { scope: "ui/resor-clients" });
      setClients(data || []);
    })();
  }, [sb]);

  // Auto-suggest currency from country
  useEffect(() => {
    const c = COUNTRY_TO_CURRENCY[t.country_code];
    if (c && c !== t.currency) setT((cur) => ({ ...cur, currency: c }));
  }, [t.country_code]); // eslint-disable-line

  function addContact() {
    if (!contact.name) return;
    setContacts((arr) => [...arr, contact]);
    setContact({ name: "", company: "", role: "", email: "" });
  }
  function removeContact(i) {
    setContacts((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function save(e) {
    e?.preventDefault();
    setErr(""); setBusy(true);
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("Du är inte inloggad.");
      if (!t.title) throw new Error("Ge resan en kort titel.");
      if (!t.purpose) throw new Error("Skriv in syftet — Skatteverket kräver det.");
      if (new Date(t.end_date) < new Date(t.start_date)) throw new Error("Slutdatum kan inte vara före startdatum.");

      const insert = {
        ...t,
        user_id: user.id,
        contacts,
        client_id: t.client_id || null,
        estimated_cost: t.estimated_cost ? Number(t.estimated_cost) : null,
        private_days: Number(t.private_days || 0),
      };
      const { data, error } = await sb.from("studio_business_trips").insert(insert).select().single();
      if (error) throw error;
      router.push(`/resor/${data.id}`);
      router.refresh();
    } catch (e2) {
      setErr(e2.message);
      reportErrorAsync(e2, { scope: "ui/resor-new" });
    } finally { setBusy(false); }
  }

  const inputCls =
    "w-full rounded-[var(--radius-ctl)] border border-border bg-surface px-3 py-2.5 text-[16px] text-ink " +
    "focus:border-border-firm focus:outline-none focus:ring-2 focus:ring-brand/25";

  const Field = ({ label, hint, required, wide, children }) => (
    <label className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="micro-label">{label}{required && <span className="text-crit"> *</span>}</span>
      {children}
      {hint && <span className="text-[11.5px] leading-relaxed text-ink-3">{hint}</span>}
    </label>
  );

  const days = Math.max(1, Math.round(
    (new Date(t.end_date) - new Date(t.start_date)) / 86400000) + 1);

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">
      <div>
        <h1 className="text-[21px] font-medium tracking-[-0.015em]">Ny affärsresa</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Syftet och deltagarna är det Skatteverket frågar efter först. Fyll i dem nu
          medan du minns — i efterhand är det svårt.
        </p>
      </div>

      {err && (
        <p role="alert" className="rounded-[var(--radius-card)] border border-crit/35 bg-crit-bg px-4 py-3 text-[13px] leading-relaxed text-ink-2">{err}</p>
      )}

      <form onSubmit={save} className="flex flex-col gap-3">

        <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Resan</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kort titel" required wide>
              <input className={inputCls} value={t.title} autoFocus
                onChange={(e) => setT({ ...t, title: e.target.value })}
                placeholder="t.ex. Berlin — kundmöte Acme + mässa" />
            </Field>
            <Field label="Destination">
              <input className={inputCls} value={t.destination}
                onChange={(e) => setT({ ...t, destination: e.target.value })} placeholder="Berlin, Tyskland" />
            </Field>
            <Field label="Land">
              <select className={inputCls} value={t.country_code}
                onChange={(e) => setT({ ...t, country_code: e.target.value })}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Avresa">
              <input className={inputCls} type="date" value={t.start_date}
                onChange={(e) => setT({ ...t, start_date: e.target.value })} />
            </Field>
            <Field label="Hemresa" hint={`${days} ${days === 1 ? "dag" : "dagar"}`}>
              <input className={inputCls} type="date" value={t.end_date} min={t.start_date}
                onChange={(e) => setT({ ...t, end_date: e.target.value })} />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <div>
            <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Varför</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
              Utan ett tydligt affärssyfte är resan inte avdragsgill. Skriv vad du skulle
              säga om någon frågade om sex år.
            </p>
          </div>
          <Field label="Syfte" required wide>
            <textarea className={inputCls} rows={3} value={t.purpose}
              onChange={(e) => setT({ ...t, purpose: e.target.value })}
              placeholder="Kundmöte med Acme GmbH om ramavtal, samt mässbesök för leverantörskontakter." />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Konferens eller mässa">
              <input className={inputCls} value={t.conference}
                onChange={(e) => setT({ ...t, conference: e.target.value })} />
            </Field>
            <Field label="Kund resan gäller">
              <select className={inputCls} value={t.client_id}
                onChange={(e) => setT({ ...t, client_id: e.target.value })}>
                <option value="">Ingen särskild</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <div>
            <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Vilka du träffade</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
              Namn och företag räcker. Det här är den vanligaste luckan när ett reseavdrag
              underkänns.
            </p>
          </div>

          {contacts.length > 0 && (
            <div className="flex flex-col">
              {contacts.map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
                  <span className="min-w-0 text-[13.5px]">
                    <span className="font-medium text-ink">{c.name}</span>
                    <span className="text-ink-2">{c.company ? ` — ${c.company}` : ""}{c.role ? ` (${c.role})` : ""}</span>
                  </span>
                  <button type="button" onClick={() => removeContact(i)}
                    className="shrink-0 font-mono text-[11px] text-ink-3 hover:text-crit">Ta bort</button>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-4">
            <input className={inputCls} value={contact.name} placeholder="Namn"
              aria-label="Kontaktens namn"
              onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            <input className={inputCls} value={contact.company} placeholder="Företag"
              aria-label="Företag"
              onChange={(e) => setContact({ ...contact, company: e.target.value })} />
            <input className={inputCls} value={contact.role} placeholder="Roll"
              aria-label="Roll"
              onChange={(e) => setContact({ ...contact, role: e.target.value })} />
            <button type="button" onClick={addContact} disabled={!contact.name}
              className="rounded-[var(--radius-ctl)] border border-border-firm px-3 py-2.5 text-[13px] font-medium text-ink-2 hover:text-ink disabled:opacity-40">
              Lägg till
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Praktiskt</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Färdmedel">
              <select className={inputCls} value={t.travel_mode}
                onChange={(e) => setT({ ...t, travel_mode: e.target.value })}>
                <option value="flight">Flyg</option>
                <option value="train">Tåg</option>
                <option value="car">Bil</option>
                <option value="mixed">Blandat</option>
                <option value="other">Annat</option>
              </select>
            </Field>
            <Field label="Reg-nummer" hint="Om du körde egen bil — kopplar ihop resan med körjournalen.">
              <input className={inputCls} value={t.vehicle_reg}
                onChange={(e) => setT({ ...t, vehicle_reg: e.target.value.toUpperCase() })} placeholder="ABC123" />
            </Field>
            <Field label="Beräknad kostnad">
              <input className={inputCls} type="number" inputMode="decimal" value={t.estimated_cost}
                onChange={(e) => setT({ ...t, estimated_cost: e.target.value })} />
            </Field>
            <Field label="Valuta">
              <select className={inputCls} value={t.currency}
                onChange={(e) => setT({ ...t, currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
              </select>
            </Field>
            <Field label="Måltider"
              hint="Traktamente är ett schablonbelopp per dag. Väljer du kvitton måste varje måltid ha ett underlag.">
              <select className={inputCls} value={t.uses_traktamente ? "1" : "0"}
                onChange={(e) => setT({ ...t, uses_traktamente: e.target.value === "1" })}>
                <option value="1">Traktamente enligt schablon</option>
                <option value="0">Faktiska kvitton</option>
              </select>
            </Field>
            <Field label="Privata dagar"
              hint="Dagar som inte är tjänst. Hotell och flyg fördelas proportionellt.">
              <input className={inputCls} type="number" inputMode="numeric" min={0} max={days}
                value={t.private_days}
                onChange={(e) => setT({ ...t, private_days: e.target.value })} />
            </Field>
            <Field label="Anteckningar" wide>
              <textarea className={inputCls} rows={2} value={t.notes}
                onChange={(e) => setT({ ...t, notes: e.target.value })} />
            </Field>
          </div>
        </section>

        <div className="flex flex-wrap gap-2.5 pb-2">
          <button type="submit" disabled={busy}
            className="rounded-[var(--radius-ctl)] bg-brand px-4 py-3 text-[14px] font-semibold text-brand-ink disabled:opacity-40">
            {busy ? "Sparar…" : "Spara resan"}
          </button>
          <button type="button" onClick={() => router.push("/resor")} disabled={busy}
            className="rounded-[var(--radius-ctl)] border border-border-firm px-4 py-3 text-[14px] font-medium text-ink-2">
            Avbryt
          </button>
        </div>
      </form>
    </div>
  );
}
