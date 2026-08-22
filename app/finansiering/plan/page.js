"use client";
import { useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { CREDIT_PLAN_STEPS, buildCreditPlan } from "@/lib/credit-plan";

const SCRIPTS = {
  swedbank_call: `Hej, jag heter [ditt namn] och driver enskild näringsverksamhet (Hopkins Method, registreringsdatum [datum]). Jag är privatkund hos er och vill öppna ett företagskonto, gärna Företagspaket Bas. Kan jag boka ett personligt möte hos närmaste kontor?`,
  swedbank_meeting: `Tack för mötet. Jag har precis startat Hopkins Method som enskild firma (org-nr / personnr [ditt nr]). Här är registreringsbevis, F-skatt-bevis och ID. Jag har inga betalningsanmärkningar och inga skulder hos Kronofogden. Det jag behöver idag är ett enkelt företagskonto med Bankgiro så att jag kan ta emot betalningar från kunder. Vad behöver ni från mig för att öppna Företagspaket Bas idag?`,
  almi_form: `Driver ny enskild firma (Hopkins Method) inom konsult-/tjänsteverksamhet. Tidigare verksamhet (The Next Cigar) avregistrerades 2025-12-18 efter att inte ha fått fart. Söker rådgivning kring hur jag bygger upp Hopkins Method strukturerat och eventuellt mikrolån/startuplån för uppstartskapital (utrustning, marknadsföring). Vill också förstå hur jag bygger företagskredit på rätt sätt från början.`,
  almi_meeting: `Hej [rådgivarens namn], tack för att du tog mötet. Kort om mig: Jag heter [ditt namn], driver Hopkins Method som enskild firma sedan [datum]. Tidigare hade jag The Next Cigar — fungerade inte, avvecklat i god ordning, inga skulder kvar. Vill bygga Hopkins Method professionellt den här gången. Jag använder en bokföringsapp (Nordbok Studio) så hela min finansiella data är samlad. Min första fråga: vilka steg rekommenderar du för någon som vill etablera kreditvärdighet från noll och samtidigt få startuppkapital? Andra: är jag en kandidat för mikrolån eller startuplån?`,
};

export default function PlanPage() {
  const sb = useMemo(() => browserClient(), []);
  const [tasks, setTasks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  async function load() {
    const { data } = await sb.from("studio_tasks").select("*").eq("category", "credit_plan").order("due_at");
    setTasks(data || []);
  }
  useEffect(() => { load(); }, []);

  async function seed() {
    setErr(""); setInfo(""); setBusy(true);
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("Inte inloggad");
      // Avoid duplicates: delete existing credit_plan tasks first if user wants reset
      const existing = tasks.length > 0;
      if (existing && !confirm("Du har redan en kreditplan aktiv. Vill du nollställa och börja om från idag?")) {
        setBusy(false); return;
      }
      if (existing) {
        await sb.from("studio_tasks").delete().eq("category", "credit_plan").eq("user_id", user.id);
      }
      const rows = buildCreditPlan(user.id);
      const { error } = await sb.from("studio_tasks").insert(rows);
      if (error) throw error;
      setInfo(`${rows.length} steg lades till. Du får påminnelser via e-post och kan se dem i Deadlines.`);
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function toggle(t) {
    const newStatus = t.status === "done" ? "open" : "done";
    await sb.from("studio_tasks").update({ status: newStatus, done_at: newStatus === "done" ? new Date().toISOString() : null }).eq("id", t.id);
    load();
  }

  const completed = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <h1 className="h1">12-månaders kreditplan</h1>
        <div className="muted">Konkret plan för att gå från ”tunn fil” till godkänd företagskredit. Påminnelser kommer via veckorapporten.</div>
      </div>

      {err && <div className="alert alert-error">{err}</div>}
      {info && <div className="alert alert-ok">{info}</div>}

      {tasks.length === 0 ? (
        <div className="card" style={{ marginBottom: 14, textAlign: "center" }}>
          <h2 className="h2" style={{ marginTop: 0 }}>Aktivera din 12-månaders plan</h2>
          <p className="muted">{CREDIT_PLAN_STEPS.length} steg, från Swedbank-mötet idag till AB-utvärdering om 12 månader. Sparas som tasks med påminnelser.</p>
          <button className="btn" onClick={seed} disabled={busy}>{busy ? "Skapar..." : "Skapa min plan"}</button>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="spread">
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Framsteg</div>
                <div className="muted" style={{ fontSize: 13 }}>{completed} av {total} steg klara</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{pct}%</div>
            </div>
            <div style={{ height: 8, background: "var(--bg-soft)", borderRadius: 4, overflow: "hidden", marginTop: 10 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", transition: "width 200ms" }} />
            </div>
            <button className="btn btn-ghost btn-sm" onClick={seed} disabled={busy} style={{ marginTop: 12 }}>Nollställ plan</button>
          </div>

          <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
            {tasks.map((t) => {
              const overdue = t.status !== "done" && new Date(t.due_at) < new Date();
              const daysUntil = Math.round((new Date(t.due_at) - new Date()) / 86400000);
              return (
                <div key={t.id} className="card" style={{ padding: 14, opacity: t.status === "done" ? 0.55 : 1 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <input type="checkbox" checked={t.status === "done"} onChange={() => toggle(t)} style={{ marginTop: 4, width: 22, height: 22 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                        <strong style={{ fontSize: 15, textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.title}</strong>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {t.status === "done" ? "✅ Klar" :
                           overdue ? <span style={{ color: "var(--error)" }}>⚠ {-daysUntil} dagar sen</span> :
                           daysUntil === 0 ? "📅 Idag" :
                           daysUntil <= 7 ? `📅 om ${daysUntil} dagar` :
                           `${new Date(t.due_at).toLocaleDateString("sv-SE")}`}
                        </div>
                      </div>
                      {t.description && <div style={{ fontSize: 13, color: "var(--text-soft)", marginTop: 4, lineHeight: 1.5 }}>{t.description}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ─── Scripts ─── */}
      <h2 className="h2">📞 Klar-att-kopiera-skript</h2>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Swedbank — bokningssamtal (0771-22 11 22)</h3>
        <pre style={{ background: "var(--bg-soft)", padding: 12, borderRadius: 9, whiteSpace: "pre-wrap", fontSize: 13, fontFamily: "inherit", margin: 0 }}>{SCRIPTS.swedbank_call}</pre>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Swedbank — när du sitter i mötet</h3>
        <pre style={{ background: "var(--bg-soft)", padding: 12, borderRadius: 9, whiteSpace: "pre-wrap", fontSize: 13, fontFamily: "inherit", margin: 0 }}>{SCRIPTS.swedbank_meeting}</pre>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Almi — bokningsformulär (almi.se/boka-radgivare)</h3>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 8px" }}>I rutan ”Vad behöver du hjälp med?” klistra in:</p>
        <pre style={{ background: "var(--bg-soft)", padding: 12, borderRadius: 9, whiteSpace: "pre-wrap", fontSize: 13, fontFamily: "inherit", margin: 0 }}>{SCRIPTS.almi_form}</pre>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Almi — öppning på rådgivningsmötet</h3>
        <pre style={{ background: "var(--bg-soft)", padding: 12, borderRadius: 9, whiteSpace: "pre-wrap", fontSize: 13, fontFamily: "inherit", margin: 0 }}>{SCRIPTS.almi_meeting}</pre>
      </div>

      <div className="card">
        <h2 className="h2" style={{ marginTop: 0 }}>Pre-flight checklist innan möten</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>📄 Registreringsbevis (Bolagsverket Mina sidor → ladda ner gratis PDF)</li>
          <li>🪪 Körkort eller pass</li>
          <li>📊 Senaste 3 månadernas kontoutdrag (privatkonto)</li>
          <li>📑 F-skatt-godkännande (Skatteverket Mina sidor → utdrag)</li>
          <li>📈 Affärsplan 1–3 sidor (Almis mall: almi.se/planera)</li>
          <li>💼 Inkomstprognos 12 mån framåt (vad du planerar tjäna)</li>
          <li>📦 Lista på vad du behöver kapital till (specifikt: utrustning x kr, marknadsföring y kr...)</li>
        </ul>
      </div>
    </>
  );
}
