import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";
import { estimateTax, mileageDeduction } from "@/lib/swedish-tax";

/** Streaming-light assistant: gathers a snapshot of the user's data, asks Claude.
 *  Body: { thread_id, message }
 */
export async function POST(req) {
  try {
    const { sb, user } = await requireUser();
    const { thread_id, message } = await req.json();
    if (!message) return NextResponse.json({ error: "Missing message" }, { status: 400 });
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY saknas" }, { status: 500 });

    // ─── Snapshot of user data (RLS keeps us inside this user's rows) ───
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const [{ data: settings }, { data: invoices }, { data: receipts }, { data: trips }, { data: tasks }, { data: clients }] = await Promise.all([
      sb.from("studio_settings").select("*").maybeSingle(),
      sb.from("studio_invoices").select("invoice_number, status, total, vat_amount, subtotal, issue_date, due_date, paid_at, studio_clients(name)").gte("issue_date", yearStart).order("issue_date", { ascending: false }).limit(60),
      sb.from("studio_receipts").select("vendor, total, vat_amount, category, bas_account, ne_row, receipt_date, is_business, is_deductible").gte("receipt_date", yearStart).order("receipt_date", { ascending: false }).limit(120),
      sb.from("studio_trips").select("trip_date, from_address, to_address, purpose, km, deduction, is_business").gte("trip_date", yearStart).order("trip_date", { ascending: false }).limit(60),
      sb.from("studio_tasks").select("title, due_at, status, priority, category").eq("status", "open").order("due_at").limit(20),
      sb.from("studio_clients").select("name, email").eq("archived", false).limit(40),
    ]);

    const sumPaid = (invoices || []).filter((i) => i.status === "paid").reduce((a, i) => a + Number(i.total || 0), 0);
    const sumOpen = (invoices || []).filter((i) => i.status !== "paid" && i.status !== "draft" && i.status !== "cancelled").reduce((a, i) => a + Number(i.total || 0), 0);
    const sumExpenses = (receipts || []).filter((r) => r.is_business && r.is_deductible).reduce((a, r) => a + Number(r.total || 0), 0);
    const tripDed = (trips || []).filter((t) => t.is_business).reduce((a, t) => a + Number(t.deduction || mileageDeduction(t.km)), 0);
    const revenue = (invoices || []).reduce((a, i) => a + Number(i.subtotal || 0), 0);
    const profit = revenue - sumExpenses - tripDed;
    const tax = estimateTax(Math.max(0, profit));

    const context = `Du är "Nordbok-assistenten", en svensk bokförings- och skatteexpert som hjälper en enskild näringsidkare (sole trader). Användaren heter ${settings?.business_name || user.email}.

— SNAPSHOT YTD ${new Date().getFullYear()} —
Företag: ${settings?.business_name || "—"} | F-skatt: ${settings?.f_skatt_approved ? "ja" : "nej"} | Moms-nr: ${settings?.vat_number || "—"}
Intäkter: ${revenue.toFixed(0)} kr  ·  Inbetalt: ${sumPaid.toFixed(0)} kr  ·  Utestående: ${sumOpen.toFixed(0)} kr
Avdragsgilla utgifter: ${sumExpenses.toFixed(0)} kr  ·  Reseavdrag: ${tripDed.toFixed(0)} kr
Beräknad vinst: ${profit.toFixed(0)} kr  ·  Beräknad total skatt: ${tax.total_tax} kr (egenavg ${tax.egenavgifter}, kommunal ${tax.kommunalskatt}, statlig ${tax.statligskatt})

— FAKTUROR (senaste 60) —
${(invoices || []).slice(0, 12).map((i) => `${i.invoice_number} ${i.studio_clients?.name || "—"} ${i.status} ${i.total} kr förfaller ${i.due_date}`).join("\n")}

— KVITTON (senaste 120 — visar topp 10) —
${(receipts || []).slice(0, 10).map((r) => `${r.receipt_date} ${r.vendor} ${r.total} kr (${r.category || "?"}/${r.bas_account || "?"})`).join("\n")}

— RESOR (senaste 60 — visar topp 8) —
${(trips || []).slice(0, 8).map((t) => `${t.trip_date} ${t.from_address}→${t.to_address} (${t.purpose}) ${t.km} km`).join("\n")}

— ÖPPNA DEADLINES —
${(tasks || []).map((t) => `${t.title} — ${new Date(t.due_at).toISOString().slice(0, 10)} (${t.priority})`).join("\n")}

— KUNDER — ${(clients || []).map((c) => c.name).join(", ")}

Riktlinjer:
- Svara på svenska om frågan är på svenska, annars på engelska.
- När frågan är "vad är min vinst", "kan jag dra av X", "vad får jag tillbaka" — svara konkret med siffror baserat på snapshot.
- Hänvisa till Skatteverket (SKV-nummer/sida) när du anger regler.
- Om användaren ber dig "skicka faktura" / "logga resa" — ge dem en exakt instruktion (klicka X) eller ett färdigt fakturautkast i text.
- Försvinn inte i jargong — håll det jordnära.
- Var ärlig om osäkerhet och rekommendera revisor för komplexa fall.`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: context,
        messages: [{ role: "user", content: message }],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json({ error: t.slice(0, 400) }, { status: 502 });
    }
    const j = await r.json();
    const reply = j.content?.[0]?.text || "(inget svar)";

    // Save the conversation
    const tid = thread_id || crypto.randomUUID();
    await sb.from("studio_assistant_log").insert([
      { user_id: user.id, thread_id: tid, role: "user", content: message },
      { user_id: user.id, thread_id: tid, role: "assistant", content: reply },
    ]);

    return NextResponse.json({ thread_id: tid, reply });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: e.status || 500 });
  }
}
