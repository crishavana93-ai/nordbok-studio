"use client";

/* components/settings/DeladAtkomst.jsx — invite a revisor, see who has access, revoke.
 *
 * The panel says what access actually means in both directions, because "share my
 * accounts" is a sentence people agree to without picturing the consequence. The
 * database enforces read-only (006_delad_atkomst.sql) — this only has to be honest
 * about it.
 */

import { useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { dateISO } from "@/lib/format";

const STATUS = {
  pending: { label: "Väntar på att accepteras", tone: "bg-warn-bg text-warn" },
  active:  { label: "Aktiv",                    tone: "bg-good-bg text-good" },
  revoked: { label: "Återkallad",               tone: "bg-raised text-ink-3" },
};

export default function DeladAtkomst() {
  const sb = useMemo(() => browserClient(), []);
  const [granted, setGranted] = useState([]);   // access I have given
  const [received, setReceived] = useState([]); // access others have given me
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [ready, setReady] = useState(false);

  async function load() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const [{ data: g, error: ge }, { data: r }] = await Promise.all([
      sb.from("studio_memberships").select("*").eq("owner_id", user.id).order("created_at", { ascending: false }),
      sb.from("studio_memberships").select("*").eq("member_id", user.id).eq("status", "active"),
    ]);
    // The table only exists after 006 has been applied. Say so rather than showing an
    // empty panel that looks like "nobody has access" when it means "not installed".
    if (ge && /relation .* does not exist/i.test(ge.message)) { setErr("__NOT_INSTALLED__"); setReady(true); return; }
    if (ge) setErr(ge.message);
    setGranted(g || []); setReceived(r || []); setReady(true);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function invite(e) {
    e.preventDefault();
    setErr(""); setInfo(""); setBusy(true);
    try {
      const { error } = await sb.rpc("bjud_in_revisor", { p_email: email.trim(), p_note: note.trim() || null });
      if (error) throw new Error(error.message);
      setInfo(`Inbjudan skapad för ${email.trim()}. Den börjar gälla när hen loggat in och accepterat.`);
      setEmail(""); setNote("");
      await load();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  async function revoke(id) {
    setErr(""); setInfo(""); setBusy(true);
    try {
      const { error } = await sb.rpc("aterkalla_atkomst", { p_membership: id });
      if (error) throw new Error(error.message);
      setInfo("Åtkomsten är återkallad och gäller från och med nu.");
      await load();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  async function accept() {
    setErr(""); setInfo(""); setBusy(true);
    try {
      const { data, error } = await sb.rpc("acceptera_inbjudan");
      if (error) throw new Error(error.message);
      setInfo(data > 0 ? `Du har nu läsbehörighet till ${data} bokföring${data === 1 ? "" : "ar"}.`
                       : "Ingen väntande inbjudan hittades för din e-postadress.");
      await load();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  if (!ready) return null;

  if (err === "__NOT_INSTALLED__") {
    return (
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Delad åtkomst</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          Funktionen är inte installerad i databasen ännu. Kör{" "}
          <span className="font-mono text-[12px]">supabase/migrations/006_delad_atkomst.sql</span>{" "}
          i Supabase SQL-editorn, så dyker den upp här.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
      <div>
        <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Delad åtkomst</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Ge din revisor läsbehörighet till bokföringen. Hen ser fakturor, kvitton med
          bilder, kunder och underlag — men <strong className="font-medium text-ink">kan inte
          ändra någonting</strong>, och ser varken dina samtal med assistenten eller dina
          egna anteckningar. Du kan återkalla när som helst; det gäller direkt.
        </p>
      </div>

      {received.length > 0 && (
        <div className="rounded-[var(--radius-ctl)] bg-raised p-3.5">
          <span className="micro-label">Du har läsbehörighet till</span>
          <p className="mt-1 text-[13px] text-ink-2">
            {received.length} annan bokföring{received.length === 1 ? "" : "ar"}. Byt med
            väljaren högst upp på sidan.
          </p>
        </div>
      )}

      <form onSubmit={invite} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="micro-label">Revisorns e-postadress</span>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="revisor@byra.se"
            className="rounded-[var(--radius-ctl)] border border-border bg-surface px-3 py-2.5 text-[16px] text-ink"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="micro-label">Anteckning (valfritt)</span>
          <input
            value={note} onChange={(e) => setNote(e.target.value)} placeholder="T.ex. bokslut 2026"
            className="rounded-[var(--radius-ctl)] border border-border bg-surface px-3 py-2.5 text-[16px] text-ink"
          />
        </label>
        <button
          type="submit" disabled={busy || !email.trim()}
          className="self-start rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink disabled:opacity-40"
        >
          {busy ? "Sparar…" : "Bjud in"}
        </button>
        <p className="text-[12px] leading-relaxed text-ink-3">
          Inbjudan kopplas till e-postadressen. Den som kan logga in med adressen får
          behörigheten — bjud därför bara in adresser du litar på.
        </p>
      </form>

      {granted.length > 0 && (
        <div className="flex flex-col">
          <span className="micro-label mb-1.5">Inbjudna</span>
          {granted.map((g) => {
            const s = STATUS[g.status] || STATUS.revoked;
            return (
              <div key={g.id} className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-border py-2.5 last:border-b-0">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-ink">{g.invited_email}</span>
                  <span className="mt-0.5 block font-mono text-[11.5px] text-ink-3">
                    inbjuden {dateISO(g.created_at)}
                    {g.accepted_at ? ` · accepterad ${dateISO(g.accepted_at)}` : ""}
                    {g.revoked_at ? ` · återkallad ${dateISO(g.revoked_at)}` : ""}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`inline-block rounded px-2 py-0.5 font-mono text-[10.5px] font-medium ${s.tone}`}>{s.label}</span>
                    {g.note && <span className="text-[12px] text-ink-3">{g.note}</span>}
                  </span>
                </span>
                {g.status !== "revoked" && (
                  <button
                    onClick={() => revoke(g.id)} disabled={busy}
                    className="shrink-0 rounded-[var(--radius-ctl)] border border-border-firm px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:text-crit disabled:opacity-50"
                  >
                    Återkalla
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-border pt-3.5">
        <span className="micro-label">Har någon bjudit in dig?</span>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <button
            onClick={accept} disabled={busy}
            className="rounded-[var(--radius-ctl)] border border-border-firm px-3.5 py-2 text-[13px] font-medium text-ink-2 hover:text-ink disabled:opacity-50"
          >
            Hämta inbjudningar
          </button>
          <span className="text-[12.5px] text-ink-3">Söker på din inloggade e-postadress.</span>
        </div>
      </div>

      {info && <p className="rounded-[var(--radius-ctl)] bg-good-bg px-3.5 py-2.5 text-[13px] text-ink-2">{info}</p>}
      {err && err !== "__NOT_INSTALLED__" && (
        <p className="rounded-[var(--radius-ctl)] bg-crit-bg px-3.5 py-2.5 text-[13px] text-ink-2">{err}</p>
      )}
    </section>
  );
}
