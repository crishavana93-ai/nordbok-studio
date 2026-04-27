"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { computeInvoice, generateOcrNumber, ROTRUT_2026 } from "@/lib/swedish-tax";
import { CURRENCIES, COUNTRIES, COUNTRY_TO_CURRENCY, EU_COUNTRIES, suggestVatRate, isReverseChargeCandidate, fmtMoney } from "@/lib/currency";

export default function NewInvoice() {
  const router = useRouter();
  const sb = useMemo(() => browserClient(), []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [settings, setSettings] = useState(null);
  const [clients, setClients] = useState([]);

  // Form state
  const today = new Date().toISOString().slice(0, 10);
  const due30 = new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10);
  const [client_id, setClientId] = useState("");
  const [invoice_number, setInvoiceNumber] = useState("");
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
  const [newClient, setNewClient] = useState(null);

  const selectedClient = clients.find((c) => c.id === client_id);

  useEffect(() => {
    (async () => {
      const { data: s } = await sb.from("studio_settings").select("*").maybeSingle();
      setSettings(s);
      if (s?.default_currency) setCurrency(s.default_currency);
      const { data: c } = await sb.from("studio_clients").select("*").eq("archived", false).order("name");
      setClients(c || []);
      const { data: last } = await sb.from("studio_invoices").select("invoice_number").order("created_at", { ascending: false }).limit(1);
      const nextNum = last && last[0] ? bumpNumber(last[0].invoice_number) : `${new Date().getFullYear()}-001`;
      setInvoiceNumber(nextNum);
    })();
  }, [sb]);

  // When client changes, suggest currency, VAT rate, reverse-charge, language
  useEffect(() => {
    if (!selectedClient) return;
    const country = selectedClient.country_code || "SE";
    const cur = selectedClient.preferred_currency || COUNTRY_TO_CURRENCY[country] || "SEK";
    setCurrency(cur);
    const isB2B = !!selectedClient.org_nr || !!selectedClient.vat_number;
    const rc = isReverseChargeCandidate({ country, vatNumber: selectedClient.vat_number });
    setReverseCharge(rc);
    const sug = suggestVatRate({ country, isBusiness: isB2B, vatNumber: selectedClient.vat_number });
    setItems((arr) => arr.map((it) => ({ ...it, vat_rate: sug })));
    if (selectedClient.language) setLanguage(selectedClient.language);
    if (country !== "SE" && EU_COUNTRIES.has(country) && !rc) setOssCountry(country);
    else setOssCountry("");
  }, [selectedClient]);

  function bumpNumber(s) {
    const m = String(s).match(/^(.*?)(\d+)$/);
    if (!m) return `${s}-002`;
    const next = String(Number(m[2]) + 1).padStart(m[2].length, "0");
    return m[1] + next;
  }

  const computed = useMemo(
    () => computeInvoice(items, { rot_rut_type, reverse_charge }),
    [items, rot_rut_type, reverse_charge]
  );

  const updateItem = (i, patch) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((arr) => [...arr, { description: "", quantity: 1, unit: "st", unit_price: 0, vat_rate: items[0]?.vat_rate ?? 25, rot_rut_hours: "" }]);
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  async function save(send = false) {
    setErr(""); setBusy(true);
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("Du är inte inloggad.");
      if (!settings?.business_name) throw new Error("Fyll först in företagsuppgifter under Inställningar.");
      if (!client_id) throw new Error("Välj eller skapa en kund.");
      if (items.length === 0 || !items[0].description) throw new Error("Lägg till minst en rad.");

      const ocr_number = generateOcrNumber(`${Date.now()}`);
      const inv = {
        user_id: user.id,
        client_id,
        invoice_number,
        status: send ? "sent" : "draft",
        issue_date,
        due_date,
        reference,
        ocr_number,
        currency,
        language,
        subtotal: computed.subtotal,
        vat_amount: computed.vat_amount,
        total: computed.total,
        rot_amount: computed.rot_amount,
        rut_amount: computed.rut_amount,
        rot_rut_type: rot_rut_type || null,
        reverse_charge,
        oss_country: oss_country || null,
        payment_terms_days: Math.max(0, Math.ceil((new Date(due_date) - new Date(issue_date)) / 86400000)),
        notes,
      };
      const { data: inserted, error } = await sb.from("studio_invoices").insert(inv).select().single();
      if (error) throw error;

      const itemRows = items.map((it, position) => ({
        invoice_id: inserted.id,
        user_id: user.id,
        position,
        description: it.description,
        quantity: Number(it.quantity || 0),
        unit: it.unit || "st",
        unit_price: Number(it.unit_price || 0),
        vat_rate: Number(it.vat_rate || 0),
        rot_rut_hours: it.rot_rut_hours ? Number(it.rot_rut_hours) : null,
      }));
      const { error: e2 } = await sb.from("studio_invoice_items").insert(itemRows);
      if (e2) throw e2;

      if (send) {
        const r = await fetch("/api/invoices/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoice_id: inserted.id }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || "Kunde inte skicka faktura.");
        }
      }
      router.push(`/invoices/${inserted.id}`);
      router.refresh();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createClient(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = Object.fromEntries(f);
    payload.country_code = (payload.country_code || "SE").toUpperCase();
    const { data: { user } } = await sb.auth.getUser();
    payload.user_id = user.id;
    const { data, error } = await sb.from("studio_clients").insert(payload).select().single();
    if (error) { setErr(error.message); return; }
    setClients([...clients, data]);
    setClientId(data.id);
    setNewClient(null);
  }

  const isSE = (selectedClient?.country_code || "SE") === "SE";
  const supportsRotRut = isSE; // ROT/RUT is Sweden-only

  return (
    <>
      <div className="spread" style={{ marginBottom: 16 }}>
        <h1 className="h1">Ny faktura</h1>
      </div>
      {err && <div className="alert alert-error">{err}</div>}

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr" }} className="invoice-layout">
        {/* ─── LEFT: form ─── */}
        <div className="card">
          <h2 className="h2" style={{ marginTop: 0 }}>Kund</h2>
          {!newClient ? (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <select className="select" value={client_id} onChange={(e) => setClientId(e.target.value)} style={{ flex: 1 }}>
                <option value="">— Välj kund —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.country_code !== "SE" ? ` (${c.country_code})` : ""}</option>)}
              </select>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setNewClient({})}>+ Ny</button>
            </div>
          ) : (
            <form onSubmit={createClient} style={{ background: "var(--bg-soft)", padding: 12, borderRadius: 9 }}>
              <div className="grid-2">
                <div className="field"><label className="label">Namn *</label><input className="input" name="name" required /></div>
                <div className="field"><label className="label">Kontaktperson</label><input className="input" name="contact_person" /></div>
                <div className="field"><label className="label">E-post</label><input className="input" name="email" type="email" /></div>
                <div className="field"><label className="label">Land</label>
                  <select className="select" name="country_code" defaultValue="SE">
                    {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                  </select>
                </div>
                <div className="field"><label className="label">Org-nr / Personnr / Tax ID</label><input className="input" name="org_nr" placeholder="SE: pers/orgnr · UK: company nr · US: EIN" /></div>
                <div className="field"><label className="label">VAT-nummer (EU)</label><input className="input" name="vat_number" placeholder="GB123456789, DE123456789..." /></div>
                <div className="field"><label className="label">Föredragen valuta</label>
                  <select className="select" name="preferred_currency" defaultValue="">
                    <option value="">Auto (från land)</option>
                    {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
                  </select>
                </div>
                <div className="field"><label className="label">Språk</label>
                  <select className="select" name="language" defaultValue="sv">
                    <option value="sv">Svenska</option><option value="en">English</option>
                  </select>
                </div>
                <div className="field" style={{ gridColumn: "1/-1" }}><label className="label">Adress</label><input className="input" name="address_street" /></div>
                <div className="field"><label className="label">Postnr/ZIP</label><input className="input" name="address_zip" /></div>
                <div className="field"><label className="label">Ort/City</label><input className="input" name="address_city" /></div>
                <div className="field"><label className="label">Fastighetsbeteckning (ROT)</label><input className="input" name="fastighetsbeteckning" /></div>
                <div className="field"><label className="label">BRF org-nr (RUT)</label><input className="input" name="brf_org_nr" /></div>
              </div>
              <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setNewClient(null)}>Avbryt</button>
                <button className="btn btn-sm" type="submit">Spara kund</button>
              </div>
            </form>
          )}

          <h2 className="h2">Faktura</h2>
          <div className="grid-2">
            <div className="field"><label className="label">Fakturanummer</label><input className="input" value={invoice_number} onChange={(e) => setInvoiceNumber(e.target.value)} /></div>
            <div className="field"><label className="label">Referens (kundens)</label><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
            <div className="field"><label className="label">Fakturadatum</label><input className="input" type="date" value={issue_date} onChange={(e) => setIssueDate(e.target.value)} /></div>
            <div className="field"><label className="label">Förfallodatum</label><input className="input" type="date" value={due_date} onChange={(e) => setDueDate(e.target.value)} /></div>
            <div className="field"><label className="label">Valuta</label>
              <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
              </select>
            </div>
            <div className="field"><label className="label">Språk på faktura</label>
              <select className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="sv">Svenska</option><option value="en">English</option>
              </select>
            </div>
          </div>

          <details style={{ marginTop: 4, marginBottom: 14 }}>
            <summary style={{ fontWeight: 600, cursor: "pointer", padding: "6px 0" }}>Avancerat (ROT/RUT, omvänd skattskyldighet, OSS)</summary>
            <div className="grid-2" style={{ marginTop: 8 }}>
              <div className="field">
                <label className="label">ROT/RUT-arbete {!supportsRotRut && <span className="muted">(endast SE)</span>}</label>
                <select className="select" value={rot_rut_type} onChange={(e) => setRotRutType(e.target.value)} disabled={!supportsRotRut}>
                  <option value="">— Inget —</option>
                  <option value="ROT">ROT (max 50 000 kr/år)</option>
                  <option value="RUT">RUT (max 75 000 kr/år)</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Omvänd skattskyldighet</label>
                <select className="select" value={reverse_charge ? "1" : "0"} onChange={(e) => setReverseCharge(e.target.value === "1")}>
                  <option value="0">Nej</option>
                  <option value="1">Ja (B2B EU/byggsektor — köparen redovisar moms)</option>
                </select>
              </div>
              <div className="field">
                <label className="label">OSS-destinationsland (B2C EU)</label>
                <select className="select" value={oss_country} onChange={(e) => setOssCountry(e.target.value)}>
                  <option value="">— Ingen —</option>
                  {COUNTRIES.filter((c) => EU_COUNTRIES.has(c.code) && c.code !== "SE").map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </details>

          <h2 className="h2">Rader</h2>
          {items.map((it, i) => (
            <div key={i} style={{ background: "var(--bg-soft)", padding: 12, borderRadius: 10, marginBottom: 10 }}>
              <div className="field"><label className="label">Beskrivning</label><input className="input" value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} placeholder="Tjänst eller vara" /></div>
              <div className="grid-4">
                <div className="field"><label className="label">Antal</label><input className="input num" inputMode="decimal" type="number" step="0.01" value={it.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} /></div>
                <div className="field"><label className="label">Enhet</label><input className="input" value={it.unit} onChange={(e) => updateItem(i, { unit: e.target.value })} /></div>
                <div className="field"><label className="label">À-pris (excl. moms)</label><input className="input num" inputMode="decimal" type="number" step="0.01" value={it.unit_price} onChange={(e) => updateItem(i, { unit_price: e.target.value })} /></div>
                <div className="field"><label className="label">Moms %</label>
                  <select className="select" value={it.vat_rate} onChange={(e) => updateItem(i, { vat_rate: e.target.value })}>
                    <option value="25">25</option><option value="12">12</option><option value="6">6</option><option value="0">0</option>
                  </select>
                </div>
              </div>
              {rot_rut_type && supportsRotRut && (
                <div className="field"><label className="label">Arbetstimmar (ROT/RUT)</label><input className="input" inputMode="decimal" type="number" step="0.5" value={it.rot_rut_hours} onChange={(e) => updateItem(i, { rot_rut_hours: e.target.value })} placeholder="Endast arbetskostnad — material räknas inte" /></div>
              )}
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => removeItem(i)} disabled={items.length === 1}>Ta bort rad</button>
              </div>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" type="button" onClick={addItem}>+ Lägg till rad</button>

          <h2 className="h2">Anteckningar (visas på fakturan)</h2>
          <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {/* ─── RIGHT: live summary ─── */}
        <div>
          <div className="card sticky-side">
            <h2 className="h2" style={{ marginTop: 0 }}>Sammanställning</h2>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  <tr><td>Delsumma</td><td className="num">{fmtMoney(computed.subtotal, currency)}</td></tr>
                  <tr><td>Moms</td><td className="num">{fmtMoney(computed.vat_amount, currency)}</td></tr>
                  {computed.rot_amount > 0 && <tr><td>ROT-avdrag (skv)</td><td className="num">−{fmtMoney(computed.rot_amount, currency)}</td></tr>}
                  {computed.rut_amount > 0 && <tr><td>RUT-avdrag (skv)</td><td className="num">−{fmtMoney(computed.rut_amount, currency)}</td></tr>}
                  <tr><td style={{ fontWeight: 700 }}>Att betala</td><td className="num" style={{ fontWeight: 700, fontSize: 17 }}>{fmtMoney(computed.total, currency)}</td></tr>
                </tbody>
              </table>
            </div>
            {reverse_charge && <div className="alert alert-info" style={{ marginTop: 10 }}>Omvänd skattskyldighet — texten "Reverse charge — buyer accounts for VAT" läggs till på PDF.</div>}
            {oss_country && <div className="alert alert-info" style={{ marginTop: 10 }}>OSS-försäljning till {oss_country}. Säkerställ att din OSS-registrering är aktiv hos Skatteverket om du passerat 99 680 kr i EU-B2C.</div>}
            {rot_rut_type && supportsRotRut && (rot_rut_type === "ROT" ? computed.rot_amount === 0 : computed.rut_amount === 0) && (
              <div className="alert alert-error" style={{ marginTop: 10 }}>Ingen {rot_rut_type}-grund — fyll i arbetstimmar på minst en rad.</div>
            )}

            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              <button className="btn btn-block" type="button" onClick={() => save(false)} disabled={busy}>
                {busy ? "Sparar..." : "Spara som utkast"}
              </button>
              <button className="btn btn-ghost btn-block" type="button" onClick={() => save(true)} disabled={busy}>
                Spara &amp; skicka via e-post
              </button>
            </div>
          </div>

          {!settings?.business_name && (
            <div className="alert alert-error" style={{ marginTop: 12 }}>
              Lägg först in dina företagsuppgifter under <a href="/settings" style={{ textDecoration: "underline" }}>Inställningar</a> (företagsnamn, personnr, F-skatt, IBAN).
            </div>
          )}
        </div>
      </div>
      <style jsx>{`
        @media (min-width: 1000px) {
          .invoice-layout { grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); }
        }
      `}</style>
    </>
  );
}
