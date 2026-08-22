/* app/api/assistant/route.js — NORDBOK assistant.
 *
 * CHANGES vs the previous version:
 *   1. Reads conversation history back from studio_assistant_log  ← the amnesia fix
 *   2. Prompt caching on the static half of the system prompt (cuts cost materially)
 *   3. Model + max_tokens moved to env vars — no redeploy to change model
 *   4. VAT period awareness: current kvartal + next deadline + days remaining
 *   5. NORDBOK system prompt, split into a cacheable static block and a live block
 *
 * Deliberately NOT here yet: tools, and the full moms engine (lib/moms.js).
 * Those are the next two steps.
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";
import { estimateTax, mileageDeduction } from "@/lib/swedish-tax";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_TOKENS = Number(process.env.ASSISTANT_MAX_TOKENS || 3000);
const HISTORY_TURNS = Number(process.env.ASSISTANT_HISTORY_TURNS || 20);

/* ── VAT period helpers (kvartal + kontantmetoden) ───────────────────────────
 * Quarterly deadlines are the 12th of the second month after period end, except
 * August and January which fall on the 17th.
 * Source: Skatteverket, "Deklarera moms".
 */
function vatQuarter(today = new Date()) {
  const y = today.getUTCFullYear();
  const q = Math.floor(today.getUTCMonth() / 3); // 0..3
  const startMonth = q * 3;
  const start = new Date(Date.UTC(y, startMonth, 1));
  const end = new Date(Date.UTC(y, startMonth + 3, 0));
  const DEADLINES = [
    { m: 4, d: 12 },  // Q1 jan–mar → 12 maj
    { m: 7, d: 17 },  // Q2 apr–jun → 17 aug
    { m: 10, d: 12 }, // Q3 jul–sep → 12 nov
    { m: 1, d: 12 },  // Q4 okt–dec → 12 feb (following year)
  ];
  const dl = DEADLINES[q];
  const deadline = new Date(Date.UTC(q === 3 ? y + 1 : y, dl.m, dl.d));
  return {
    label: `Q${q + 1} ${y}`,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    deadline: deadline.toISOString().slice(0, 10),
    daysToDeadline: Math.ceil((deadline - today) / 86400000),
  };
}

/* ── Static half of the system prompt: identical every call, so it caches ──── */
const NORDBOK_STATIC = `# IDENTITY

You are NORDBOK — a world-class financial advisor for Swedish sole traders
(enskild näringsidkare). You combine four kinds of expertise:

  • Auktoriserad redovisningskonsult — Swedish bookkeeping and VAT, day to day
  • Skatterådgivare — inkomstskatt, egenavgifter, NE-bilaga, entity structure
  • CFO — cash flow, pricing, margin, runway, the decision behind the number
  • Ekonom — the macro context: rates, inflation, currency, what it means for a
    one-person business in Sweden

You are not a chatbot that answers questions. You are the person who notices what
the user hasn't asked about yet.

# WHO YOU SERVE

One legal entity — an enskild firma — running SEVERAL ventures:
The Next Cigar (magazine + tobacco accessories, no tobacco sales) · Turquino Studios
(web agency) · Skattenavigator (tax tool) · zamacharters · cruiseshuttlemiami · ifmba.

All of them file under a single org number, a single momsdeklaration and a single
NE-bilaga — but the user needs to see each venture's performance separately. Always
tag figures by venture when the data allows, and never imply the ventures file
separately.

# SWEDISH DOMAIN RULES

VAT rates: 25% standard · 12% food, hotel, restaurant · 6% books, newspapers,
periodicals, passenger transport, culture.
  ⚠ The user publishes a magazine (6%) AND sells accessories (25%). Mixed-rate
  invoices must show beskattningsunderlag PER RATE.

Momsdeklaration boxes:
  05 momspliktig försäljning · 06 uttag · 07 VMB · 08 hyresinkomster
  10/11/12 utgående moms 25/12/6%
  20 varor från EU · 21 tjänster från EU (huvudregeln) · 22 tjänster utanför EU
  23 varor i Sverige, köparen betalningsskyldig · 24 övriga sådana tjänster
  30/31/32 utgående moms på rutor 20–24
  35–42 försäljning undantagen från moms
  48 avdragsgill ingående moms · 49 moms att betala eller få tillbaka

Reverse charge (omvänd betalningsskyldighet):
  Services bought from an EU supplier  → ruta 21 + 30, deduct in 48. Net zero.
  Services bought from outside the EU  → ruta 22 + 30, deduct in 48. Net zero.
  Requires the user's VAT number to be on file with the supplier.

VAT charged through OSS by a foreign supplier is NEVER deductible. If an invoice
from a foreign supplier shows Swedish VAT, that is a red flag: the user failed to
give them their VAT number. Say so, and tell them to fix the billing profile.

Kontantmetoden (bokslutsmetoden): VAT falls in the period the MONEY MOVES, not the
invoice date. Apply this consistently — it is the user's method.

Quarterly deadlines: 12 maj · 17 augusti · 12 november · 12 februari.
Late filing = 625 kr förseningsavgift, chargeable even when the period nets to a
refund. Befrielse can be requested; short delays and first offences are reasonable
grounds.

Foreign currency: convert to SEK using a documented, consistently applied rate —
the Riksbank or ECB rate for the transaction date, and under kontantmetoden that
means the payment date. Never silently guess a rate — state which rate and which
date you used.

For any threshold, percentage or fixed amount (egenavgifter, schablonavdrag,
omsättningsgräns, brytpunkt, milersättning): use the value supplied in the
constants context, cite the source, and state the income year it applies to.
If a value is not supplied, say you need to verify it rather than recalling one.

# HARD CONSTRAINTS

1. NEVER invent a rule, an SKV document number, a percentage or a threshold. If you
   are not certain, say "I need to verify this against Skatteverket" and stop.
2. NEVER present analysis as licensed advice. You are structured expertise. For
   anything with real exposure, recommend an auktoriserad redovisningskonsult.
3. NEVER let a wrong number pass to be encouraging. If the user's plan has a
   20 000 kr hole in it, the first sentence names the hole.
4. NEVER round money in a tax context. Exact öre or exact kronor, as the field requires.
5. If the user asks you to do something that would misreport tax — backdating,
   deducting private costs, omitting income — decline plainly, explain the exposure,
   and offer the legitimate version.

# HOW TO ANSWER

Lead with the number or the answer. Reasoning after, not before.
Use a table when comparing periods, rates or scenarios. Prose otherwise.
Swedish if asked in Swedish, English if asked in English. Match the user, don't
translate tax terms that have no clean equivalent — keep momsdeklaration,
egenavgifter, NE-bilaga in Swedish and gloss them once.
Cite Skatteverket by page or SKV number when stating a rule.
Be brief. This user reads on a phone.

# TOOLS

When a tool is available, USE IT rather than instructing the user to click. Creating
a draft invoice is better than explaining how to create one. Confirm before anything
that sends, charges or files. After every write, state plainly what changed.

# PROACTIVITY

End substantive answers with at most ONE observation the user did not ask for —
only when it is materially important. A deadline inside 14 days. A supplier
charging VAT that can't be reclaimed. An unpaid invoice past terms. A quarter where
income arrived but no invoice exists.

One. Not a list. If nothing qualifies, end without one.`;

export async function POST(req) {
  try {
    const { sb, user } = await requireUser();
    const { thread_id, message } = await req.json();
    if (!message) return NextResponse.json({ error: "Missing message" }, { status: 400 });
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY saknas" }, { status: 500 });
    }

    const tid = thread_id || crypto.randomUUID();
    const now = new Date();
    const yearStart = `${now.getUTCFullYear()}-01-01`;
    const q = vatQuarter(now);

    /* ── Snapshot + history in one round trip (RLS keeps us in this user's rows) ── */
    const [
      { data: settings }, { data: invoices }, { data: receipts },
      { data: trips }, { data: tasks }, { data: clients }, { data: history },
    ] = await Promise.all([
      sb.from("studio_settings").select("*").maybeSingle(),
      sb.from("studio_invoices")
        .select("invoice_number, status, total, vat_amount, subtotal, currency, issue_date, due_date, paid_at, venture, studio_clients(name)")
        .gte("issue_date", yearStart).order("issue_date", { ascending: false }).limit(60),
      sb.from("studio_receipts")
        .select("vendor, total, vat_amount, currency, category, bas_account, ne_row, receipt_date, is_business, is_deductible, vat_treatment, venture")
        .gte("receipt_date", yearStart).order("receipt_date", { ascending: false }).limit(120),
      sb.from("studio_trips")
        .select("trip_date, from_address, to_address, purpose, km, deduction, is_business")
        .gte("trip_date", yearStart).order("trip_date", { ascending: false }).limit(60),
      sb.from("studio_tasks")
        .select("title, due_at, status, priority, category")
        .eq("status", "open").order("due_at").limit(20),
      sb.from("studio_clients").select("name, email").eq("archived", false).limit(40),
      sb.from("studio_assistant_log")
        .select("role, content, created_at")
        .eq("thread_id", tid).order("created_at", { ascending: false }).limit(HISTORY_TURNS),
    ]);

    const inv = invoices || [];
    const rec = receipts || [];
    const sumPaid = inv.filter((i) => i.status === "paid").reduce((a, i) => a + Number(i.total || 0), 0);
    const sumOpen = inv.filter((i) => !["paid", "draft", "cancelled"].includes(i.status)).reduce((a, i) => a + Number(i.total || 0), 0);
    const sumExpenses = rec.filter((r) => r.is_business && r.is_deductible).reduce((a, r) => a + Number(r.total || 0), 0);
    const tripDed = (trips || []).filter((t) => t.is_business).reduce((a, t) => a + Number(t.deduction || mileageDeduction(t.km)), 0);
    const revenue = inv.reduce((a, i) => a + Number(i.subtotal || 0), 0);
    const profit = revenue - sumExpenses - tripDed;
    const tax = estimateTax(Math.max(0, profit));

    /* Kontantmetoden: what actually landed inside the current VAT quarter. */
    const paidInQuarter = inv.filter((i) => i.paid_at && i.paid_at >= q.start && i.paid_at <= q.end);
    const spentInQuarter = rec.filter((r) => r.receipt_date >= q.start && r.receipt_date <= q.end);
    const nonSekRows = [...inv, ...rec].filter((r) => r.currency && r.currency !== "SEK").length;
    const untagged = [...inv, ...rec].filter((r) => !r.venture).length;

    /* ── Live half of the system prompt: changes every call, not cached ── */
    const live = `# LIVE DATA — as of ${now.toISOString().slice(0, 10)}

Företag: ${settings?.business_name || user.email} | F-skatt: ${settings?.f_skatt_approved ? "ja" : "nej"} | Moms-nr: ${settings?.vat_number || "SAKNAS"}
Redovisningsmetod: bokslutsmetoden (kontantmetoden) · Redovisningsperiod: kvartal

— AKTUELL MOMSPERIOD —
${q.label} (${q.start} – ${q.end}) · deklaration senast ${q.deadline} · ${q.daysToDeadline} dagar kvar
Betalt IN under perioden (kontantmetoden): ${paidInQuarter.length} fakturor
Kostnader bokförda i perioden: ${spentInQuarter.length} kvitton
${nonSekRows > 0 ? `⚠ ${nonSekRows} rader i utländsk valuta — kräver SEK-omräkning innan momsdeklaration` : ""}
${untagged > 0 ? `⚠ ${untagged} rader saknar venture-tagg` : ""}

— SNAPSHOT YTD ${now.getUTCFullYear()} —
Intäkter: ${revenue.toFixed(0)} kr · Inbetalt: ${sumPaid.toFixed(0)} kr · Utestående: ${sumOpen.toFixed(0)} kr
Avdragsgilla utgifter: ${sumExpenses.toFixed(0)} kr · Reseavdrag: ${tripDed.toFixed(0)} kr
Beräknad vinst: ${profit.toFixed(0)} kr · Beräknad skatt: ${tax.total_tax} kr (egenavg ${tax.egenavgifter}, kommunal ${tax.kommunalskatt}, statlig ${tax.statligskatt})

— FAKTUROR (senaste 12 av ${inv.length}) —
${inv.slice(0, 12).map((i) => `${i.invoice_number} ${i.studio_clients?.name || "—"} ${i.status} ${i.total} ${i.currency || "SEK"} förfaller ${i.due_date}${i.paid_at ? ` betald ${i.paid_at}` : ""}${i.venture ? ` [${i.venture}]` : ""}`).join("\n") || "(inga)"}

— KVITTON (senaste 10 av ${rec.length}) —
${rec.slice(0, 10).map((r) => `${r.receipt_date} ${r.vendor} ${r.total} ${r.currency || "SEK"} (${r.category || "?"}/${r.bas_account || "?"})${r.vat_treatment ? ` {${r.vat_treatment}}` : ""}${r.venture ? ` [${r.venture}]` : ""}`).join("\n") || "(inga)"}

— RESOR (senaste 8) —
${(trips || []).slice(0, 8).map((t) => `${t.trip_date} ${t.from_address}→${t.to_address} (${t.purpose}) ${t.km} km`).join("\n") || "(inga)"}

— ÖPPNA DEADLINES —
${(tasks || []).map((t) => `${t.title} — ${new Date(t.due_at).toISOString().slice(0, 10)} (${t.priority})`).join("\n") || "(inga)"}

— KUNDER — ${(clients || []).map((c) => c.name).join(", ") || "(inga)"}

Everything above is the user's real data as of this moment. Use it. Never invent a
figure that could have come from it — if the data doesn't contain what you need, say
which record is missing and how to add it.`;

    /* Oldest → newest, and never open the window on an assistant turn. */
    const priorTurns = (history || [])
      .slice()
      .reverse()
      .map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.content }));
    while (priorTurns.length && priorTurns[0].role !== "user") priorTurns.shift();

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          { type: "text", text: NORDBOK_STATIC, cache_control: { type: "ephemeral" } },
          { type: "text", text: live },
        ],
        messages: [...priorTurns, { role: "user", content: message }],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json({ error: t.slice(0, 400) }, { status: 502 });
    }
    const j = await r.json();
    const reply = j.content?.filter((b) => b.type === "text").map((b) => b.text).join("\n") || "(inget svar)";

    await sb.from("studio_assistant_log").insert([
      { user_id: user.id, thread_id: tid, role: "user", content: message },
      { user_id: user.id, thread_id: tid, role: "assistant", content: reply },
    ]);

    return NextResponse.json({ thread_id: tid, reply });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: e.status || 500 });
  }
}
