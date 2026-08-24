"use client";

/* components/settings/Verksamheter.jsx
 *
 * One enskild firma, several brands. This is where you say which of those names are
 * actually registered at Bolagsverket, because that -- not preference -- decides which
 * of them may appear as the seller on a faktura.
 *
 * The three kinds are not cosmetic:
 *   primary   the registered foretagsnamn. There is exactly one; the database enforces it.
 *   sarskilt  a registered sarskilt foretagsnamn. Prints together with the main name.
 *   brand     unregistered. Prints as a reference line. Never as the seller.
 *
 * Claiming a name is registered when it is not does not make the invoice legal -- it
 * just moves the problem to your customer's avdrag for ingaende moms. So the wording
 * below asks the question plainly rather than offering a tickbox called "registered".
 */

import { useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { VENTURE_KEYS, NAME_TYPES } from "@/lib/seller";

const LABEL = {
  the_next_cigar: "The Next Cigar",
  turquino: "Turquino",
  skattenavigator: "Skattenavigator",
  zamacharters: "Zama Charters",
  cruiseshuttle: "Cruise Shuttle",
  ifmba: "IFMBA",
  other: "Annat",
};

export default function Verksamheter() {
  const sb = useMemo(() => browserClient(), []);
  const [user, setUser] = useState(null);
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  async function load(uid) {
    const { data } = await sb
      .from("studio_venture_identity").select("*").eq("user_id", uid).order("display_name");
    setRows(data || []);
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      setUser(user);
      await load(user.id);
    })();
  }, [sb]);

  async function save(e) {
    e.preventDefault();
    setErr(""); setInfo(""); setBusy(true);
    try {
      if (!draft.venture) throw new Error("Välj vilken verksamhet det gäller.");
      if (!draft.display_name?.trim()) throw new Error("Namnet får inte vara tomt.");
      const { error } = await sb.from("studio_venture_identity").upsert({
        user_id: user.id,
        venture: draft.venture,
        display_name: draft.display_name.trim(),
        name_type: draft.name_type || "brand",
        from_email: draft.from_email?.trim() || null,
        reply_to: draft.reply_to?.trim() || null,
        bcc: draft.bcc?.trim() || null,
        invoice_footer: draft.invoice_footer?.trim() || null,
      });
      /* The unique index on one primary name per user surfaces here. Say what it means
         rather than showing the raw constraint name. */
      if (error) {
        throw new Error(
          error.message.includes("uq_venture_primary_per_user")
            ? "Du har redan ett registrerat huvudnamn. En enskild firma har bara ett — ändra det befintliga, eller registrera det här som särskilt företagsnamn."
            : error.message
        );
      }
      await load(user.id);
      setDraft(null);
      setInfo("Sparat.");
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  async function remove(venture) {
    setErr(""); setInfo("");
    const { error } = await sb
      .from("studio_venture_identity").delete().eq("user_id", user.id).eq("venture", venture);
    if (error) { setErr(error.message); return; }
    await load(user.id);
    setInfo("Borttagen. Redan skickade fakturor påverkas inte.");
  }

  const used = new Set(rows.map((r) => r.venture));
  const blank = {
    venture: "", display_name: "", name_type: "brand",
    from_email: "", reply_to: "", bcc: "", invoice_footer: "",
  };

  if (!user) return null;

  return (
    <div className="card">
      <h2 className="h2" style={{ marginTop: 0 }}>Verksamheter</h2>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 12 }}>
        Säljaren på en faktura måste vara ett namn som är registrerat hos Bolagsverket —
        annars ditt eget för- och efternamn. Ett varumärke får stå bredvid, aldrig i stället.
        Här avgör du vilket som är vilket.
      </div>

      {info && <div className="alert alert-ok">{info}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      {rows.length === 0 && !draft && (
        <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Inga verksamheter tillagda. Fakturor använder företagsnamnet ovan.
        </div>
      )}

      {rows.map((r) => (
        <div key={r.venture}
          style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                   gap: 12, borderTop: "1px solid var(--line)", padding: "10px 0" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{r.display_name}</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              {NAME_TYPES.find((t) => t.value === r.name_type)?.sv || r.name_type}
              {r.from_email ? ` · ${r.from_email}` : " · ingen avsändaradress"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button className="btn btn-ghost" type="button"
              onClick={() => setDraft({ ...blank, ...r })}>Ändra</button>
            <button className="btn btn-ghost" type="button"
              onClick={() => remove(r.venture)}>Ta bort</button>
          </div>
        </div>
      ))}

      {draft ? (
        <form onSubmit={save} style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 6 }}>
          <div className="grid-2">
            <div className="field">
              <label className="label">Verksamhet</label>
              <select className="select" value={draft.venture}
                onChange={(e) => setDraft({
                  ...draft, venture: e.target.value,
                  display_name: draft.display_name || LABEL[e.target.value] || "",
                })}>
                <option value="">Välj…</option>
                {VENTURE_KEYS.map((k) => (
                  <option key={k} value={k} disabled={used.has(k) && k !== draft.venture}>
                    {LABEL[k] || k}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Namn som ska skrivas ut</label>
              <input className="input" value={draft.display_name}
                onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} />
            </div>
            <div className="field" style={{ gridColumn: "1/-1" }}>
              <label className="label">Är namnet registrerat hos Bolagsverket?</label>
              <select className="select" value={draft.name_type}
                onChange={(e) => setDraft({ ...draft, name_type: e.target.value })}>
                {NAME_TYPES.map((t) => <option key={t.value} value={t.value}>{t.sv}</option>)}
              </select>
              <div className="muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
                {draft.name_type === "primary"
                  ? "Står ensamt som säljare. En enskild firma har bara ett huvudnamn."
                  : draft.name_type === "sarskilt"
                  ? "Skrivs ut tillsammans med verksamhetens huvudnamn — det är ett krav, inte en stilfråga."
                  : "Skrivs ut som referensrad. Säljaren förblir det registrerade huvudnamnet."}
              </div>
            </div>
            <div className="field">
              <label className="label">Avsändaradress för fakturor</label>
              <input className="input" type="email" placeholder="hello@turquinostudios.com"
                value={draft.from_email}
                onChange={(e) => setDraft({ ...draft, from_email: e.target.value })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Domänen måste vara verifierad i Resend, annars vägrar utskicket.
              </div>
            </div>
            <div className="field">
              <label className="label">Svar går till</label>
              <input className="input" type="email" value={draft.reply_to}
                onChange={(e) => setDraft({ ...draft, reply_to: e.target.value })} />
            </div>
            <div className="field" style={{ gridColumn: "1/-1" }}>
              <label className="label">Blindkopia</label>
              <input className="input" type="email" value={draft.bcc || ""}
                onChange={(e) => setDraft({ ...draft, bcc: e.target.value })} />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Lämna tom för att använda verksamhetens standardadress.
              </div>
            </div>
            <div className="field" style={{ gridColumn: "1/-1" }}>
              <label className="label">Faktura-fot för den här verksamheten</label>
              <textarea className="textarea" rows={2} value={draft.invoice_footer || ""}
                onChange={(e) => setDraft({ ...draft, invoice_footer: e.target.value })} />
            </div>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn" type="submit" disabled={busy}>{busy ? "Sparar…" : "Spara"}</button>
            <button className="btn btn-ghost" type="button" onClick={() => setDraft(null)}>Avbryt</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-ghost" type="button" style={{ marginTop: 10 }}
          onClick={() => { setDraft(blank); setErr(""); setInfo(""); }}>
          Lägg till verksamhet
        </button>
      )}
    </div>
  );
}
