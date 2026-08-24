"use client";

/* app/welcome/page.js — DIRECTION C
 *
 * THE BUG THAT MADE THIS SCREEN UNUSABLE
 * `Step` was declared INSIDE the component body:
 *
 *   export default function Welcome() {
 *     const Step = ({ n, title, children }) => (...)     // ← new identity every render
 *
 * React compares element types by identity. A function redefined on every render is a
 * different type each time, so React unmounted and remounted the entire subtree on
 * every setState — which here means every keystroke. Each field lost focus after one
 * character. Only business_name appeared to work, and only because autoFocus re-fired
 * on the remount and threw the caret to the end.
 *
 * This is the first screen a new user meets, and it captures the personnummer that
 * ends up on every invoice. It could not be completed on a phone.
 *
 * Step is now at module scope. Two other things changed while it was open: the answers
 * survive a reload, and the buttons are inside a <form> so Enter advances the step.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { validPersonnummer, buildVatNumber } from "@/lib/swedish-tax";
import { CURRENCIES } from "@/lib/currency";
import { buildTaxYearDeadlines } from "@/lib/seed-deadlines";
import { reportErrorAsync } from "@/lib/report-error";

const DRAFT_KEY = "nordbok_welcome_draft";

const inputCls =
  "w-full rounded-[var(--radius-ctl)] border border-border bg-surface px-3 py-2.5 text-[16px] text-ink " +
  "focus:border-border-firm focus:outline-none focus:ring-2 focus:ring-brand/25";

function Field({ label, hint, required, wide, children }) {
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

/* MODULE SCOPE. Moving this inside the component is what broke the screen — see the
   header. Its identity must be stable across renders. */
function Step({ n, title, active, done, children }) {
  return (
    <section className={`rounded-[var(--radius-card)] border bg-surface p-4 sm:p-5 ${active ? "border-border-firm" : "border-border"}`}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`grid size-7 shrink-0 place-items-center rounded-full font-mono text-[12px] font-medium ${
            active ? "bg-brand text-brand-ink" : done ? "bg-good-bg text-good" : "bg-raised text-ink-3"
          }`}
        >
          {done && !active ? "✓" : n}
        </span>
        <h2 className={`text-[15.5px] font-medium tracking-[-0.01em] ${active ? "text-ink" : "text-ink-3"}`}>
          {title}
        </h2>
      </div>
      {active && <div className="mt-4 flex flex-col gap-4">{children}</div>}
    </section>
  );
}

export default function Welcome() {
  const router = useRouter();
  const sb = useMemo(() => browserClient(), []);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [user, setUser] = useState(null);
  const [restored, setRestored] = useState(false);

  const [s, setS] = useState({
    business_name: "", personnummer: "", contact_email: "",
    f_skatt_approved: true, address_street: "", address_zip: "", address_city: "",
    bankgiro: "", iban: "", default_currency: "SEK", oss_registered: false,
    seedDeadlines: true,
  });
  const set = (patch) => setS((v) => ({ ...v, ...patch }));

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setUser(user);

      /* Answers survive a reload. Leaving this page used to discard everything typed —
         on a form asking for a personnummer and a bankgiro that is a real cost. */
      let draft = null;
      try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch { /* private mode */ }
      setS((cur) => ({ ...cur, contact_email: user.email || "", ...(draft || {}) }));
      if (draft) setRestored(true);
    })();
  }, [sb, router]);

  useEffect(() => {
    if (!user) return;
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }, [s, user]);

  function next(e) {
    e.preventDefault();
    setErr("");
    if (step === 1 && !s.business_name.trim()) { setErr("Vi behöver ett företagsnamn för att fortsätta."); return; }
    setStep((v) => v + 1);
  }

  async function finish(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      if (!s.business_name.trim()) throw new Error("Vi behöver ett företagsnamn för att fortsätta.");
      if (s.personnummer && !validPersonnummer(s.personnummer)) {
        throw new Error("Personnumret ser inte rätt ut — kontrollsiffran stämmer inte. 12 siffror, t.ex. 199309199090.");
      }

      const { seedDeadlines, ...settings } = s;
      const vat_number = s.personnummer ? buildVatNumber(s.personnummer) : null;

      const { error } = await sb.from("studio_settings").upsert({
        ...settings, user_id: user.id, vat_number, updated_at: new Date().toISOString(),
      });
      if (error) throw error;

      if (seedDeadlines) {
        const tasks = buildTaxYearDeadlines(new Date().getFullYear(), user.id);
        /* Duplicates are harmless if the wizard is run twice; a failure here must not
           lose the settings that were just saved. */
        const { error: e2 } = await sb.from("studio_tasks").insert(tasks).select();
        if (e2) reportErrorAsync(e2, { scope: "ui/welcome-deadlines", level: "warn" });
      }

      const { error: e3 } = await sb.from("studio_notif_prefs")
        .upsert({ user_id: user.id, email_digest: true, email_deadlines: true });
      if (e3) reportErrorAsync(e3, { scope: "ui/welcome-prefs", level: "warn" });

      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      router.replace("/dashboard");
      router.refresh();
    } catch (e2) {
      setErr(e2.message || "Kunde inte spara.");
      reportErrorAsync(e2, { scope: "ui/welcome" });
    } finally { setBusy(false); }
  }

  if (!user) {
    return <p className="mx-auto w-full max-w-[560px] py-12 text-[14px] text-ink-3">Laddar…</p>;
  }

  const btnPrimary = "rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink disabled:opacity-40";
  const btnGhost = "rounded-[var(--radius-ctl)] border border-border-firm px-4 py-2.5 text-[14px] font-medium text-ink-2";

  return (
    <div className="mx-auto flex w-full max-w-[620px] flex-col gap-3 pb-10">

      <div className="pt-2">
        <span className="micro-label">Kom igång</span>
        <h1 className="mt-1.5 text-[24px] font-medium tracking-[-0.02em]">Välkommen till Nordbök</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          Tre korta steg. Det du fyller i här hamnar på varje faktura du skickar, så
          det är värt en minut — men allt går att ändra sedan.
        </p>
      </div>

      {restored && (
        <p className="rounded-[var(--radius-card)] border border-border bg-raised px-4 py-3 text-[13px] text-ink-2">
          Vi har fyllt i det du skrev förra gången.
        </p>
      )}

      {err && (
        <p role="alert" className="rounded-[var(--radius-card)] border border-crit/35 bg-crit-bg px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          {err}
        </p>
      )}

      <Step n={1} title="Vad heter din verksamhet?" active={step === 1} done={step > 1}>
        <form onSubmit={next} className="flex flex-col gap-4">
          <Field label="Företagsnamn" required
            hint="Namnet högst upp på fakturan. Måste vara registrerat hos Bolagsverket — annars ditt eget för- och efternamn.">
            <input className={inputCls} value={s.business_name} autoFocus autoComplete="organization"
              onChange={(e) => set({ business_name: e.target.value })} placeholder="t.ex. Turquino Studios" />
          </Field>
          <Field label="E-post för fakturafrågor"
            hint="Hit svarar kunden om något är oklart.">
            <input className={inputCls} type="email" inputMode="email" autoComplete="email"
              value={s.contact_email} onChange={(e) => set({ contact_email: e.target.value })} />
          </Field>
          <div className="flex justify-end">
            <button type="submit" className={btnPrimary}>Nästa</button>
          </div>
        </form>
      </Step>

      <Step n={2} title="Skatteuppgifter" active={step === 2} done={step > 2}>
        <form onSubmit={next} className="flex flex-col gap-4">
          <p className="rounded-[var(--radius-ctl)] bg-raised px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-2">
            Personnumret är din skatteidentitet som enskild näringsidkare. Det står på
            fakturorna — kunden behöver det för att kunna betala dig. Momsnumret räknar
            vi fram automatiskt.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Personnummer">
              <input className={inputCls} inputMode="numeric" value={s.personnummer}
                onChange={(e) => set({ personnummer: e.target.value })} placeholder="199309199090" />
            </Field>
            <Field label="Godkänd för F-skatt"
              hint="Utan F-skatt håller kunden inne 30 % i preliminärskatt.">
              <select className={inputCls} value={s.f_skatt_approved ? "1" : "0"}
                onChange={(e) => set({ f_skatt_approved: e.target.value === "1" })}>
                <option value="1">Ja</option>
                <option value="0">Nej, ännu inte</option>
              </select>
            </Field>
            <Field label="Adress" wide>
              <input className={inputCls} autoComplete="street-address" value={s.address_street}
                onChange={(e) => set({ address_street: e.target.value })} placeholder="Bredåkersvägen 7" />
            </Field>
            <Field label="Postnummer">
              <input className={inputCls} inputMode="numeric" autoComplete="postal-code"
                value={s.address_zip} onChange={(e) => set({ address_zip: e.target.value })} placeholder="217 63" />
            </Field>
            <Field label="Ort">
              <input className={inputCls} autoComplete="address-level2"
                value={s.address_city} onChange={(e) => set({ address_city: e.target.value })} placeholder="Malmö" />
            </Field>
          </div>
          <div className="flex justify-between">
            <button type="button" className={btnGhost} onClick={() => setStep(1)}>Tillbaka</button>
            <button type="submit" className={btnPrimary}>Nästa</button>
          </div>
        </form>
      </Step>

      <Step n={3} title="Hur vill du få betalt?" active={step === 3} done={false}>
        <form onSubmit={finish} className="flex flex-col gap-4">
          <p className="rounded-[var(--radius-ctl)] bg-raised px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-2">
            Minst ett betalsätt behövs — utan det stoppas fakturan innan den skickas,
            eftersom kunden då inte kan dra av momsen. Bankgiro är vanligast i Sverige.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bankgiro">
              <input className={inputCls} inputMode="numeric" value={s.bankgiro}
                onChange={(e) => set({ bankgiro: e.target.value })} placeholder="123-4567" />
            </Field>
            <Field label="IBAN" hint="För kunder utomlands.">
              <input className={inputCls} value={s.iban}
                onChange={(e) => set({ iban: e.target.value })} placeholder="SE45 5000 0000 0583 9825 7466" />
            </Field>
            <Field label="Standardvaluta" wide
              hint="Fakturerar du svenska kunder ska det vara SEK.">
              <select className={inputCls} value={s.default_currency}
                onChange={(e) => set({ default_currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
              </select>
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={s.seedDeadlines}
              onChange={(e) => set({ seedDeadlines: e.target.checked })}
              className="mt-[3px] size-[18px] shrink-0 accent-[var(--brand)]" />
            <span className="text-[13.5px] leading-relaxed text-ink-2">
              Lägg in årets deadlines hos Skatteverket — moms Q1–Q4, NE-bilaga och
              F-skatt månadsvis.
            </span>
          </label>

          <div className="flex justify-between">
            <button type="button" className={btnGhost} onClick={() => setStep(2)} disabled={busy}>Tillbaka</button>
            <button type="submit" className={btnPrimary} disabled={busy}>
              {busy ? "Sparar…" : "Klar"}
            </button>
          </div>
        </form>
      </Step>

      <p className="pt-1 text-center text-[13px]">
        <a href="/dashboard" className="text-ink-3 underline">Hoppa över — fyll i senare</a>
      </p>
    </div>
  );
}
