"use client";

/* app/deadlines/page.js — DIRECTION C
 *
 * Migrated 2026-08-24. Three real bugs went with the colours:
 *
 * 1. SNOOZING HID A TASK FOREVER. snooze() set status to "snoozed"; load() filtered
 *    .eq("status", "open"). The task vanished from the list and never came back — on a
 *    screen whose entire job is to stop you missing a Skatteverket deadline.
 *
 * 2. NOT SCOPED TO THE OWNER. No user_id filter, so once 006 added revisor access the
 *    list merged two people's tax deadlines.
 *
 * 3. EVERY WRITE DISCARDED ITS ERROR. markDone, snooze and seed all ignored
 *    { error }, so a failure looked exactly like a success until the next reload.
 *
 * Countdown days are counted in Stockholm calendar days via lib/tid.js, not by
 * dividing milliseconds — the old arithmetic said "idag" for something due at 23:00
 * tomorrow, and "om 1 dagar" for something due in twenty minutes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { readActiveOwnerId } from "@/lib/owner-client";
import { buildTaxYearDeadlines } from "@/lib/seed-deadlines";
import { dayStartUTC } from "@/lib/tid.js";
import { dateISO, daysPhrase, num } from "@/lib/format";
import { reportErrorAsync } from "@/lib/report-error";

const inputCls =
  "w-full rounded-[var(--radius-ctl)] border border-border bg-surface px-3 py-2.5 text-[16px] text-ink " +
  "focus:border-border-firm focus:outline-none focus:ring-2 focus:ring-brand/25";

function Field({ label, wide, children }) {
  return (
    <label className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-3" : ""}`}>
      <span className="micro-label">{label}</span>
      {children}
    </label>
  );
}

/* Whole calendar days between today and the due date, in Stockholm. */
function daysUntil(dueAt) {
  const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  const dueISO = new Date(dueAt).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  const a = new Date(dayStartUTC(todayISO)).getTime();
  const b = new Date(dayStartUTC(dueISO)).getTime();
  return Math.round((b - a) / 86400000);
}

export default function DeadlinesPage() {
  const sb = useMemo(() => browserClient(), []);
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const ownerId = readActiveOwnerId(user.id);
    const { data, error } = await sb
      .from("studio_tasks").select("*")
      .eq("user_id", ownerId)
      /* "snoozed" belongs here. Excluding it is what made a snoozed deadline
         disappear permanently. */
      .in("status", ["open", "snoozed"])
      .order("due_at");
    if (error) {
      setErr("Kunde inte hämta deadlines.");
      reportErrorAsync(error, { scope: "ui/deadlines" });
      setList([]); return;
    }
    setList(data || []);
  }, [sb]);

  useEffect(() => { load(); }, [load]);

  async function withErrors(fn, scope) {
    setErr(""); setBusy(true);
    try {
      const { error } = await fn();
      if (error) { setErr(error.message); reportErrorAsync(error, { scope }); return false; }
      await load();
      return true;
    } finally { setBusy(false); }
  }

  const seed = async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    /* Momsdatumen beror på redovisningsperioden, så inställningarna måste läsas
       innan raderna byggs. Utan dem lades fyra kvartalsdeklarationer in oavsett
       vad Skatteverket faktiskt beslutat. */
    const { data: settings } = await sb
      .from("studio_settings")
      .select("vat_registered_from, vat_dereg_from, vat_period_type, vat_eu_trade, vat_large_turnover")
      .eq("user_id", user.id)
      .maybeSingle();
    await withErrors(
      () => sb.from("studio_tasks").insert(buildTaxYearDeadlines(new Date().getFullYear(), user.id, settings)),
      "ui/deadlines-seed");
  };

  const markDone = (id) => withErrors(
    () => sb.from("studio_tasks").update({ status: "done", done_at: new Date().toISOString() }).eq("id", id),
    "ui/deadlines-done");

  const snooze = (t, days = 7) => withErrors(
    () => sb.from("studio_tasks").update({
      status: "snoozed",
      due_at: new Date(new Date(t.due_at).getTime() + days * 86400000).toISOString(),
    }).eq("id", t.id),
    "ui/deadlines-snooze");

  async function addManual(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = Object.fromEntries(new FormData(form));
    const { data: { user } } = await sb.auth.getUser();
    const ok = await withErrors(() => sb.from("studio_tasks").insert({
      ...payload,
      user_id: user.id,
      due_at: new Date(payload.due_at).toISOString(),
      category: payload.category || "manual",
      priority: payload.priority || "normal",
      status: "open",
    }), "ui/deadlines-add");
    if (ok) { form.reset(); setAdding(false); }
  }

  const rows = list || [];
  const overdue = rows.filter((t) => daysUntil(t.due_at) < 0).length;

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-medium tracking-[-0.015em]">Deadlines</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {list === null ? "Laddar…"
              : rows.length === 0 ? "Inga öppna deadlines"
              : overdue > 0
                ? `${num(rows.length)} öppna · ${num(overdue)} ${overdue === 1 ? "är försenad" : "är försenade"}`
                : `${num(rows.length)} öppna`}
          </p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="shrink-0 rounded-[var(--radius-ctl)] border border-border-firm px-3.5 py-2.5 text-[13px] font-medium text-ink-2 hover:text-ink">
            Lägg till
          </button>
        )}
      </div>

      {err && (
        <p role="alert" className="rounded-[var(--radius-card)] border border-crit/35 bg-crit-bg px-4 py-3 text-[13px] leading-relaxed text-ink-2">{err}</p>
      )}

      {adding && (
        <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Egen påminnelse</h2>
          <form onSubmit={addManual} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Vad ska göras" wide>
                <input className={inputCls} name="title" required autoFocus placeholder="t.ex. Betala F-skatt" />
              </Field>
              <Field label="När">
                <input className={inputCls} name="due_at" type="datetime-local" required />
              </Field>
              <Field label="Prioritet">
                <select className={inputCls} name="priority" defaultValue="normal">
                  <option value="high">Hög</option><option value="normal">Normal</option><option value="low">Låg</option>
                </select>
              </Field>
              <Field label="Beskrivning" wide>
                <textarea className={inputCls} name="description" rows={2} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button type="submit" disabled={busy}
                className="rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink disabled:opacity-40">
                {busy ? "Sparar…" : "Lägg till"}
              </button>
              <button type="button" onClick={() => setAdding(false)}
                className="rounded-[var(--radius-ctl)] border border-border-firm px-4 py-2.5 text-[14px] font-medium text-ink-2">
                Avbryt
              </button>
            </div>
          </form>
        </section>
      )}

      {list !== null && rows.length === 0 && (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <div className="py-10 text-center">
            <p className="text-[14px] text-ink-2">Inga öppna deadlines.</p>
            <p className="mx-auto mt-1.5 max-w-[44ch] text-[13px] leading-relaxed text-ink-3">
              Lägg in årets datum hos Skatteverket — momsdeklarationerna, NE-bilagan och
              F-skatten månad för månad.
            </p>
            <button onClick={seed} disabled={busy}
              className="mt-4 rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink disabled:opacity-40">
              {busy ? "Lägger in…" : "Importera Skatteverkets datum"}
            </button>
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-col">
            {rows.map((t) => {
              const d = daysUntil(t.due_at);
              const late = d < 0, soon = d >= 0 && d <= 7;
              return (
                <div key={t.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-border py-3.5 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-2 py-0.5 font-mono text-[10.5px] font-medium ${
                        late ? "bg-crit-bg text-crit" : soon ? "bg-warn-bg text-warn" : "bg-raised text-ink-3"
                      }`}>
                        {daysPhrase(d)}
                      </span>
                      <span className="font-mono text-[11.5px] text-ink-3">{dateISO(t.due_at)}</span>
                      {t.status === "snoozed" && (
                        <span className="font-mono text-[11px] text-ink-3">skjuten</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[14px] font-medium text-ink">{t.title}</p>
                    {t.description && (
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{t.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => snooze(t, 7)} disabled={busy}
                      className="rounded-[var(--radius-ctl)] border border-border-firm px-3 py-1.5 font-mono text-[11.5px] font-medium text-ink-2 hover:text-ink disabled:opacity-40">
                      +7 d
                    </button>
                    <button onClick={() => markDone(t.id)} disabled={busy}
                      className="rounded-[var(--radius-ctl)] border border-border-firm px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink disabled:opacity-40">
                      Klar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
