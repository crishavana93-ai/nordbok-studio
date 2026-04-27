"use client";
import { useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { validPersonnummer, validOrgNr, buildVatNumber } from "@/lib/swedish-tax";
import { CURRENCIES } from "@/lib/currency";
import Tip from "@/components/Tip";

export default function SettingsPage() {
  const sb = useMemo(() => browserClient(), []);
  const [s, setS] = useState(null);
  const [n, setN] = useState(null);
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      setUser(user);
      const { data: settings } = await sb.from("studio_settings").select("*").maybeSingle();
      setS(settings || { user_id: user.id, default_vat_rate: 25, default_payment_terms_days: 30, f_skatt_approved: true });
      const { data: prefs } = await sb.from("studio_notif_prefs").select("*").maybeSingle();
      setN(prefs || { user_id: user.id, email_digest: true, email_deadlines: true, email_invoice_paid: true, email_invoice_overdue: true, digest_day: 1, digest_hour: 8 });
    })();
  }, [sb]);

  async function save(e) {
    e.preventDefault(); setErr(""); setInfo(""); setBusy(true);
    try {
      // Validate personnummer / orgnr
      if (s.personnummer && !validPersonnummer(s.personnummer)) throw new Error("Ogiltigt personnummer (Luhn-kontroll).");
      if (s.org_nr && !validOrgNr(s.org_nr)) throw new Error("Ogiltigt organisationsnummer.");
      // Auto-build VAT number
      if (!s.vat_number && (s.personnummer || s.org_nr)) s.vat_number = buildVatNumber(s.personnummer || s.org_nr);

      const { error: e1 } = await sb.from("studio_settings").upsert({ ...s, user_id: user.id, updated_at: new Date().toISOString() });
      if (e1) throw e1;
      const { error: e2 } = await sb.from("studio_notif_prefs").upsert({ ...n, user_id: user.id });
      if (e2) throw e2;
      setInfo("Sparat.");
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (!s) return <div className="empty">Laddar...</div>;

  return (
    <>
      <h1 className="h1" style={{ marginBottom: 18 }}>Inställningar</h1>

      {info && <div className="alert alert-ok">{info}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      <form onSubmit={save}>
        <div className="card" style={{ marginBottom: 14 }}>
          <h2 className="h2" style={{ marginTop: 0 }}>Företagsuppgifter</h2>
          <div className="grid-2">
            <div className="field"><label className="label">Företagsnamn *</label><input className="input" required value={s.business_name || ""} onChange={(e) => setS({ ...s, business_name: e.target.value })} placeholder="ditt företag, t.ex. Hopkins Method EF" /></div>
            <div className="field"><label className="label">E-post (faktureringsfrågor)</label><input className="input" value={s.contact_email || user?.email || ""} onChange={(e) => setS({ ...s, contact_email: e.target.value })} /></div>
            <div className="field"><label className="label">Personnummer (YYYYMMDDXXXX) <Tip text="Din skatteidentitet som enskild näringsidkare. Visas på fakturor så kunden kan betala dig korrekt. Format: 12 siffror utan bindestreck (eller med — bägge funkar)." /></label><input className="input" value={s.personnummer || ""} onChange={(e) => setS({ ...s, personnummer: e.target.value })} /></div>
            <div className="field"><label className="label">Organisationsnummer (frivilligt) <Tip text="Frivilligt för enskild firma — du kan ansöka via Bolagsverket om du vill ha ett separat orgnr istället för att använda personnummer på fakturor. 10 siffror." /></label><input className="input" value={s.org_nr || ""} onChange={(e) => setS({ ...s, org_nr: e.target.value })} /></div>
            <div className="field"><label className="label">Momsregistreringsnummer <Tip text="'SE' + ditt personnummer (10 siffror) + '01'. Krävs på fakturor om du är momsregistrerad. Lämna tomt — appen bygger det åt dig från personnumret." /></label><input className="input" value={s.vat_number || ""} onChange={(e) => setS({ ...s, vat_number: e.target.value })} placeholder="lämna tomt — fylls i automatiskt" /></div>
            <div className="field"><label className="label">F-skatt godkänd? <Tip text="F-skatt = företagsskatt. Ett godkännande från Skatteverket som visar att du själv betalar in din skatt. Utan F-skatt-stämpel måste din kund hålla inne 30% i preliminärskatt. Ansök på skatteverket.se." /></label>
              <select className="select" value={s.f_skatt_approved ? "1" : "0"} onChange={(e) => setS({ ...s, f_skatt_approved: e.target.value === "1" })}>
                <option value="1">Ja — visa "Godkänd för F-skatt" på fakturor</option>
                <option value="0">Nej</option>
              </select>
            </div>
            <div className="field" style={{ gridColumn: "span 2" }}><label className="label">Adress</label><input className="input" value={s.address_street || ""} onChange={(e) => setS({ ...s, address_street: e.target.value })} /></div>
            <div className="field"><label className="label">Postnr</label><input className="input" value={s.address_zip || ""} onChange={(e) => setS({ ...s, address_zip: e.target.value })} /></div>
            <div className="field"><label className="label">Ort</label><input className="input" value={s.address_city || ""} onChange={(e) => setS({ ...s, address_city: e.target.value })} /></div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <h2 className="h2" style={{ marginTop: 0 }}>Betalning</h2>
          <div className="grid-3">
            <div className="field"><label className="label">Bankgiro</label><input className="input" value={s.bankgiro || ""} onChange={(e) => setS({ ...s, bankgiro: e.target.value })} /></div>
            <div className="field"><label className="label">Plusgiro</label><input className="input" value={s.plusgiro || ""} onChange={(e) => setS({ ...s, plusgiro: e.target.value })} /></div>
            <div className="field"><label className="label">IBAN</label><input className="input" value={s.iban || ""} onChange={(e) => setS({ ...s, iban: e.target.value })} placeholder="SE45 5000 0000 0583 9825 7466" /></div>
            <div className="field"><label className="label">Std. betalningsvillkor (dagar)</label><input className="input num" type="number" value={s.default_payment_terms_days || 30} onChange={(e) => setS({ ...s, default_payment_terms_days: Number(e.target.value) })} /></div>
            <div className="field"><label className="label">Std. momssats</label>
              <select className="select" value={s.default_vat_rate || 25} onChange={(e) => setS({ ...s, default_vat_rate: Number(e.target.value) })}>
                <option value={25}>25%</option><option value={12}>12%</option><option value={6}>6%</option><option value={0}>0%</option>
              </select>
            </div>
            <div className="field"><label className="label">OSS-registrerad?</label>
              <select className="select" value={s.oss_registered ? "1" : "0"} onChange={(e) => setS({ ...s, oss_registered: e.target.value === "1" })}>
                <option value="0">Nej</option><option value="1">Ja (B2C EU försäljning över 99 680 kr)</option>
              </select>
            </div>
            <div className="field"><label className="label">Standardvaluta för fakturor</label>
              <select className="select" value={s.default_currency || "SEK"} onChange={(e) => setS({ ...s, default_currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
              </select>
            </div>
            <div className="field"><label className="label">Föredraget språk i UI</label>
              <select className="select" value={s.preferred_locale || "sv-SE"} onChange={(e) => setS({ ...s, preferred_locale: e.target.value })}>
                <option value="sv-SE">Svenska (sv-SE)</option>
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <h2 className="h2" style={{ marginTop: 0 }}>Notiser & påminnelser</h2>
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}><input type="checkbox" checked={!!n?.email_digest} onChange={(e) => setN({ ...n, email_digest: e.target.checked })} /> Veckosammanfattning (kvitton, fakturor, deadlines)</label>
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}><input type="checkbox" checked={!!n?.email_deadlines} onChange={(e) => setN({ ...n, email_deadlines: e.target.checked })} /> Skatteverket-deadlines (moms, NE-bilaga, F-skatt)</label>
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}><input type="checkbox" checked={!!n?.email_invoice_overdue} onChange={(e) => setN({ ...n, email_invoice_overdue: e.target.checked })} /> Notifiera mig om obetalda fakturor (3 dagar efter förfallodag)</label>
          <label style={{ display: "flex", alignItems: "center", gap: 10 }}><input type="checkbox" checked={!!n?.email_invoice_paid} onChange={(e) => setN({ ...n, email_invoice_paid: e.target.checked })} /> Notifiera mig när en faktura betalas</label>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <h2 className="h2" style={{ marginTop: 0 }}>Faktura-fot</h2>
          <textarea className="textarea" rows={3} value={s.invoice_footer || ""} onChange={(e) => setS({ ...s, invoice_footer: e.target.value })} placeholder="t.ex. webbplats, sociala kanaler, säljvillkor" />
        </div>

        <button className="btn" type="submit" disabled={busy}>{busy ? "Sparar..." : "Spara inställningar"}</button>
      </form>
    </>
  );
}
