"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { COUNTRIES, CURRENCIES, COUNTRY_TO_CURRENCY } from "@/lib/currency";
import Tip from "@/components/Tip";

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
    sb.from("studio_clients").select("id,name,country_code").eq("archived", false).order("name").then(({ data }) => setClients(data || []));
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

  async function save() {
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
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <h1 className="h1" style={{ marginBottom: 14 }}>Ny affärsresa</h1>
      {err && <div className="alert alert-error">{err}</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 className="h2" style={{ marginTop: 0 }}>Grundinfo</h2>
        <div className="field">
          <label className="label">Kort titel</label>
          <input className="input" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} placeholder="t.ex. Berlin — kundmöte Acme + CeBIT" />
        </div>
        <div className="grid-2">
          <div className="field"><label className="label">Destination</label><input className="input" value={t.destination} onChange={(e) => setT({ ...t, destination: e.target.value })} placeholder="Berlin, Tyskland" /></div>
          <div className="field"><label className="label">Land</label>
            <select className="select" value={t.country_code} onChange={(e) => setT({ ...t, country_code: e.target.value })}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <div className="field"><label className="label">Avresa</label><input className="input" type="date" value={t.start_date} onChange={(e) => setT({ ...t, start_date: e.target.value })} /></div>
          <div className="field"><label className="label">Hemkomst</label><input className="input" type="date" value={t.end_date} onChange={(e) => setT({ ...t, end_date: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: "1/-1" }}>
            <label className="label">Syfte (varför reser du?) <Tip text="Skatteverket avgör om resan är avdragsgill baserat på syftet. Var konkret: 'kundmöte med Acme GmbH för avtalsförnyelse', 'mässa CeBIT 2026', 'leverantörsbesök Müller Werke', 'fortbildning AWS Summit'. Vagt syfte = underkänd resa." /></label>
            <textarea className="textarea" rows={3} value={t.purpose} onChange={(e) => setT({ ...t, purpose: e.target.value })} placeholder="t.ex. Kundmöte Acme GmbH (avtalsförhandling Q3 2026) + mässa CeBIT — sourcing av nya leverantörer." />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 className="h2" style={{ marginTop: 0 }}>Kontakter & kund <Tip text="Lista vem du faktiskt träffade — namn + företag + roll. Skatteverket frågar 'vem mötte du?' i revision. E-post inte krävt men hjälper dig att kontakta dem senare." /></h2>
        <div className="field">
          <label className="label">Kund (om kopplad till specifik kund)</label>
          <select className="select" value={t.client_id} onChange={(e) => setT({ ...t, client_id: e.target.value })}>
            <option value="">— Ingen specifik kund —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.country_code !== "SE" ? ` (${c.country_code})` : ""}</option>)}
          </select>
        </div>

        <div className="field">
          <label className="label">Konferens / mässa (om applicabelt)</label>
          <input className="input" value={t.conference} onChange={(e) => setT({ ...t, conference: e.target.value })} placeholder="CeBIT 2026, AWS Summit Stockholm, ..." />
        </div>

        {contacts.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {contacts.map((c, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--bg-soft)", borderRadius: 9, marginBottom: 6 }}>
                <div>
                  <strong>{c.name}</strong>{c.company ? ` — ${c.company}` : ""}{c.role ? ` (${c.role})` : ""}{c.email ? ` · ${c.email}` : ""}
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeContact(i)}>×</button>
              </div>
            ))}
          </div>
        )}

        <div className="grid-4">
          <div className="field"><label className="label">Namn</label><input className="input" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="Hans Müller" /></div>
          <div className="field"><label className="label">Företag</label><input className="input" value={contact.company} onChange={(e) => setContact({ ...contact, company: e.target.value })} /></div>
          <div className="field"><label className="label">Roll</label><input className="input" value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })} placeholder="CEO" /></div>
          <div className="field"><label className="label">E-post</label><input className="input" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addContact}>+ Lägg till kontakt</button>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 className="h2" style={{ marginTop: 0 }}>Resa & kostnad</h2>
        <div className="grid-3">
          <div className="field"><label className="label">Färdmedel</label>
            <select className="select" value={t.travel_mode} onChange={(e) => setT({ ...t, travel_mode: e.target.value })}>
              <option value="flight">Flyg</option>
              <option value="train">Tåg</option>
              <option value="car">Bil (egen)</option>
              <option value="mixed">Blandat</option>
            </select>
          </div>
          {(t.travel_mode === "car" || t.travel_mode === "mixed") && (
            <div className="field"><label className="label">Reg-nummer (för körjournal)</label><input className="input" value={t.vehicle_reg} onChange={(e) => setT({ ...t, vehicle_reg: e.target.value.toUpperCase() })} /></div>
          )}
          <div className="field"><label className="label">Beräknad kostnad</label><input className="input num" type="number" inputMode="decimal" value={t.estimated_cost} onChange={(e) => setT({ ...t, estimated_cost: e.target.value })} /></div>
          <div className="field"><label className="label">Valuta</label>
            <select className="select" value={t.currency} onChange={(e) => setT({ ...t, currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </div>
          <div className="field"><label className="label">Privata dagar (av total) <Tip text="Om du stannar 2 helgdagar privat efter ett 3-dagars affärsmöte: skriv 2 här. Hotell + flyg fördelas proportionellt så att du bara drar av affärsdelen." /></label>
            <input className="input num" type="number" min="0" value={t.private_days} onChange={(e) => setT({ ...t, private_days: e.target.value })} />
          </div>
          <div className="field"><label className="label">Måltider <Tip text="Traktamente schablon: 290 kr/dag inrikes 2026, varierar utomlands (Berlin 549, London 561, NYC 700). Receipts: spara kvitton och dra av faktiska. Kan inte kombineras inom samma resa." /></label>
            <select className="select" value={t.uses_traktamente ? "1" : "0"} onChange={(e) => setT({ ...t, uses_traktamente: e.target.value === "1" })}>
              <option value="1">Traktamente schablon</option>
              <option value="0">Faktiska kvitton</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <label className="label">Anteckningar</label>
        <textarea className="textarea" rows={3} value={t.notes} onChange={(e) => setT({ ...t, notes: e.target.value })} placeholder="Övriga noteringar (t.ex. 'familj joinade utan kostnad', 'hotell betalades av kund', etc.)" />
      </div>

      <button className="btn btn-block" onClick={save} disabled={busy}>{busy ? "Sparar..." : "Skapa resa"}</button>
      <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
        Efter att du skapat resan kan du koppla kvitton, körjournal-resor och dokument (boarding pass, hotellfaktura, mässbiljett) till denna resa.
      </div>
    </>
  );
}
