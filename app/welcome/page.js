"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { validPersonnummer, validOrgNr, buildVatNumber } from "@/lib/swedish-tax";
import { CURRENCIES } from "@/lib/currency";
import { buildTaxYearDeadlines } from "@/lib/seed-deadlines";

/* Three-step first-run wizard. Triggered by /dashboard when business_name is empty.
   Goal: zero-to-first-invoice in 3 minutes, no Skatteverket vocabulary required. */
export default function Welcome() {
  const router = useRouter();
  const sb = useMemo(() => browserClient(), []);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [user, setUser] = useState(null);

  const [s, setS] = useState({
    business_name: "",
    personnummer: "",
    contact_email: "",
    f_skatt_approved: true,
    address_street: "",
    address_zip: "",
    address_city: "",
    bankgiro: "",
    iban: "",
    default_currency: "SEK",
    preferred_locale: "sv-SE",
    oss_registered: false,
  });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setUser(user);
      setS((cur) => ({ ...cur, contact_email: user.email || "" }));
    })();
  }, [sb, router]);

  async function finish() {
    setErr(""); setBusy(true);
    try {
      if (!s.business_name) throw new Error("Vi behöver ett företagsnamn för att fortsätta.");
      if (s.personnummer && !validPersonnummer(s.personnummer)) throw new Error("Personnumret ser inte rätt ut. Format: YYYYMMDD-XXXX.");
      const vat_number = s.personnummer ? buildVatNumber(s.personnummer) : null;
      const { error } = await sb.from("studio_settings").upsert({
        ...s, user_id: user.id, vat_number, updated_at: new Date().toISOString(),
      });
      if (error) throw error;

      // Seed Swedish tax-year deadlines if user wants them
      if (s.seedDeadlines !== false) {
        const tasks = buildTaxYearDeadlines(new Date().getFullYear(), user.id);
        await sb.from("studio_tasks").insert(tasks).select(); // ignore error if duplicates
      }
      // Initialize notification preferences
      await sb.from("studio_notif_prefs").upsert({ user_id: user.id, email_digest: true, email_deadlines: true });

      router.replace("/dashboard");
      router.refresh();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const Step = ({ n, title, children }) => (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: step === n ? "var(--accent)" : "var(--bg-soft)", color: step === n ? "#fff" : "var(--text-muted)", display: "grid", placeItems: "center", fontWeight: 700 }}>{n}</div>
        <h2 className="h2" style={{ margin: 0 }}>{title}</h2>
      </div>
      {step === n && children}
    </div>
  );

  if (!user) return <div className="empty">Laddar...</div>;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 22, paddingTop: 8 }}>
        <div className="brand-dot" style={{ width: 56, height: 56, fontSize: 26, borderRadius: 14, margin: "0 auto 12px" }}>N</div>
        <h1 className="h1">Välkommen till Nordbok Studio</h1>
        <div className="muted" style={{ marginTop: 4 }}>Tre korta steg så är du redo att skicka din första faktura.</div>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      <Step n={1} title="Vad heter din verksamhet?">
        <div className="field">
          <label className="label">Företagsnamn</label>
          <input className="input" value={s.business_name} onChange={(e) => setS({ ...s, business_name: e.target.value })} placeholder="t.ex. Hopkins Method, Cris Ortiz Konsulting" autoFocus />
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Detta visas högst upp på alla fakturor. Du kan ändra senare.</div>
        </div>
        <div className="field">
          <label className="label">E-post för fakturafrågor (Reply-To)</label>
          <input className="input" type="email" value={s.contact_email} onChange={(e) => setS({ ...s, contact_email: e.target.value })} />
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={() => setStep(2)} disabled={!s.business_name}>Nästa →</button>
        </div>
      </Step>

      <Step n={2} title="Skatteuppgifter">
        <div className="alert alert-info">
          <strong>Personnummer</strong> är din skatteidentitet som enskild näringsidkare. Det visas på fakturorna (kunden behöver det för att betala dig). Vi räknar automatiskt fram ditt momsregistreringsnummer från det.
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label">Personnummer (YYYYMMDDXXXX)</label>
            <input className="input" value={s.personnummer} onChange={(e) => setS({ ...s, personnummer: e.target.value })} placeholder="198001019999" inputMode="numeric" />
          </div>
          <div className="field">
            <label className="label">F-skatt godkänd?</label>
            <select className="select" value={s.f_skatt_approved ? "1" : "0"} onChange={(e) => setS({ ...s, f_skatt_approved: e.target.value === "1" })}>
              <option value="1">Ja — visa "Godkänd för F-skatt" på fakturor</option>
              <option value="0">Nej, ännu inte</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1/-1" }}>
            <label className="label">Faktureringsadress</label>
            <input className="input" value={s.address_street} onChange={(e) => setS({ ...s, address_street: e.target.value })} placeholder="Vasagatan 1" />
          </div>
          <div className="field">
            <label className="label">Postnr</label>
            <input className="input" value={s.address_zip} onChange={(e) => setS({ ...s, address_zip: e.target.value })} placeholder="111 20" />
          </div>
          <div className="field">
            <label className="label">Ort</label>
            <input className="input" value={s.address_city} onChange={(e) => setS({ ...s, address_city: e.target.value })} placeholder="Stockholm" />
          </div>
        </div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
          <button className="btn btn-ghost" onClick={() => setStep(1)}>← Tillbaka</button>
          <button className="btn" onClick={() => setStep(3)}>Nästa →</button>
        </div>
      </Step>

      <Step n={3} title="Hur vill du få betalt?">
        <div className="alert alert-info">
          Lägg in minst <strong>ett</strong> betalningsalternativ — Bankgiro är vanligast i Sverige. Kunder utomlands betalar via IBAN.
        </div>
        <div className="grid-2">
          <div className="field"><label className="label">Bankgiro</label><input className="input" value={s.bankgiro} onChange={(e) => setS({ ...s, bankgiro: e.target.value })} placeholder="123-4567" /></div>
          <div className="field"><label className="label">IBAN (för utlandsbetalningar)</label><input className="input" value={s.iban} onChange={(e) => setS({ ...s, iban: e.target.value })} placeholder="SE45 5000 0000 0583 9825 7466" /></div>
          <div className="field"><label className="label">Standardvaluta för fakturor</label>
            <select className="select" value={s.default_currency} onChange={(e) => setS({ ...s, default_currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
            </select>
          </div>
          <div className="field"><label className="label">Språk i appen</label>
            <select className="select" value={s.preferred_locale} onChange={(e) => setS({ ...s, preferred_locale: e.target.value })}>
              <option value="sv-SE">Svenska</option>
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
            </select>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <input type="checkbox" defaultChecked onChange={(e) => setS({ ...s, seedDeadlines: e.target.checked })} />
          <span>Importera Skatteverket-deadlines för i år (moms Q1–Q4, NE-bilaga, F-skatt månadsbetalning).</span>
        </label>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={() => setStep(2)}>← Tillbaka</button>
          <button className="btn" onClick={finish} disabled={busy}>{busy ? "Sparar..." : "Klar — gå till dashboard"}</button>
        </div>
      </Step>

      <div style={{ textAlign: "center", marginTop: 18 }}>
        <a href="/dashboard" style={{ fontSize: 13, color: "var(--text-muted)" }}>Hoppa över för nu</a>
      </div>
    </div>
  );
}
