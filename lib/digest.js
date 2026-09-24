/* Build the weekly digest email body for one user. Pure function — no IO. */
import { mileageDeduction } from "./swedish-tax";
import { beraknaResultat } from "./resultat.js";
import { beraknaSkatt } from "./skatt-2026.js";
import { buildAdvice } from "./brief.js";

const fmt = (n) => new Intl.NumberFormat("sv-SE").format(Math.round(Number(n) || 0));

export function buildDigest({ user, settings, invoices, receipts, trips, tasks, bankTx = [] }) {
  const today = new Date();
  const yearStart = `${today.getFullYear()}-01-01`;
  const ytd = (rows = [], dateField) => rows.filter((r) => (r[dateField] || "") >= yearStart);

  const inv = ytd(invoices, "issue_date");
  const rec = ytd(receipts, "receipt_date");
  const tr  = ytd(trips, "trip_date");

  const overdue = inv.filter((i) => (i.status === "sent" || i.status === "overdue") && new Date(i.due_date) < today);
  const open    = inv.filter((i) => i.status === "sent" || i.status === "overdue");
  const due14   = (tasks || []).filter((t) => t.status === "open" && new Date(t.due_at) <= new Date(today.getTime() + 14 * 86400000));
  const reviewQ = rec.filter((r) => r.status === "review");

  const sumPaid     = inv.filter((i) => i.status === "paid").reduce((a, i) => a + Number(i.total || 0), 0);
  const sumOpen     = open.reduce((a, i) => a + Number(i.total || 0), 0);
  const sumExpenses = rec.filter((r) => r.is_business && r.is_deductible).reduce((a, r) => a + Number(r.total || 0), 0);
  const tripDed     = tr.filter((t) => t.is_business).reduce((a, t) => a + Number(t.deduction || mileageDeduction(t.km)), 0);
  /* Överskottet räknas i lib/resultat.js: intäkt först när fakturan betalas,
     kostnad netto efter avdragen moms, bara innevarande räkenskapsår. De tre
     raderna som stod här räknade obetalda fakturor som intäkt. */
  const resultat    = beraknaResultat({ invoices: inv, receipts: rec, trips: tr,
                                        year: today.getFullYear(),
                                        momsregistrerad: !!settings?.vat_number });
  const revenue     = resultat.intakter;
  const profit      = resultat.overskott;
  const tax         = beraknaSkatt(profit);
  const vatOut      = inv.reduce((a, i) => a + Number(i.vat_amount || 0), 0);
  const vatIn       = rec.reduce((a, r) => a + Number(r.vat_amount || 0), 0);

  const businessName = settings?.business_name || "din verksamhet";
  const advice = buildAdvice({ today, bankTx, receipts: rec, invoices: inv, tasks, settings });
  const atgarda = advice.filter((a) => a.sev === "atgarda").length;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://studio.skattenavigator.se";
  const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const subject = atgarda > 0
    ? `Veckobrev · ${atgarda} saker att åtgärda · ${fmt(sumOpen)} kr utestående`
    : `Veckobrev · ${advice.length ? `${advice.length} saker att titta på` : "allt i ordning"} · ${fmt(sumOpen)} kr utestående`;

  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;color:#18181b;background:#fafaf7;margin:0;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7e7e0;border-radius:14px;overflow:hidden">
  <div style="padding:20px 24px;background:#0d3a2a;color:#fff">
    <div style="font-weight:700;font-size:20px">Nordbok Studio · veckorapport</div>
    <div style="opacity:.8;font-size:13px;margin-top:4px">${businessName} · ${today.toLocaleDateString("sv-SE")}</div>
  </div>
  <div style="padding:24px">
    ${overdue.length > 0 ? `
      <div style="background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:12px 14px;border-radius:9px;margin-bottom:16px">
        <strong>${overdue.length} förfallna fakturor</strong> – totalt ${fmt(overdue.reduce((a, i) => a + Number(i.total || 0), 0))} kr.
        <ul style="margin:8px 0 0;padding-left:18px;font-size:13px">
          ${overdue.slice(0, 5).map((i) => `<li>#${i.invoice_number} — ${i.studio_clients?.name || ""} · ${fmt(i.total)} kr · förföll ${i.due_date}</li>`).join("")}
        </ul>
      </div>` : ""}

    ${advice.length > 0 ? `
      <div style="margin-bottom:18px">
        <div style="font-weight:600;margin-bottom:8px">Att göra den här veckan</div>
        ${advice.map((a) => `
          <a href="${appUrl}${a.href}" style="display:block;text-decoration:none;color:#18181b;border:1px solid ${a.sev === "atgarda" ? "#fecaca" : "#e7e7e0"};border-radius:9px;padding:10px 12px;margin-bottom:8px">
            <div style="font-size:10.5px;letter-spacing:.06em;color:${a.sev === "atgarda" ? "#b91c1c" : "#8a8a90"}">${a.sev === "atgarda" ? "ÅTGÄRDA" : "GRANSKA"}</div>
            <div style="font-weight:600;font-size:14px;margin-top:2px">${esc(a.title)}</div>
            <div style="font-size:13px;color:#525258;margin-top:3px;line-height:1.45">${esc(a.detail)}</div>
          </a>`).join("")}
      </div>` : `<div style="font-size:14px;color:#525258;margin-bottom:16px">Inget som kräver dig den här veckan.</div>`}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="background:#f4f4ef;padding:12px;border-radius:9px"><div style="font-size:11px;color:#8a8a90;text-transform:uppercase">Inbetalt YTD</div><div style="font-weight:700;font-size:20px">${fmt(sumPaid)} kr</div></div>
      <div style="background:#f4f4ef;padding:12px;border-radius:9px"><div style="font-size:11px;color:#8a8a90;text-transform:uppercase">Utestående</div><div style="font-weight:700;font-size:20px">${fmt(sumOpen)} kr</div></div>
      <div style="background:#f4f4ef;padding:12px;border-radius:9px"><div style="font-size:11px;color:#8a8a90;text-transform:uppercase">Avdragsgilla utg.</div><div style="font-weight:700;font-size:20px">${fmt(sumExpenses)} kr</div></div>
      <div style="background:#f4f4ef;padding:12px;border-radius:9px"><div style="font-size:11px;color:#8a8a90;text-transform:uppercase">Beräknad skatt</div><div style="font-weight:700;font-size:20px">${fmt(tax.total_skatt)} kr</div></div>
    </div>

    <div style="margin-bottom:16px">
      <div style="font-weight:600;margin-bottom:6px">Moms YTD</div>
      <div style="font-size:14px;color:#525258">Utgående: <strong>${fmt(vatOut)} kr</strong> · Ingående: <strong>${fmt(vatIn)} kr</strong> · Att redovisa: <strong>${fmt(Math.max(0, vatOut - vatIn))} kr</strong></div>
    </div>

    ${due14.length > 0 ? `
      <div style="margin-bottom:16px">
        <div style="font-weight:600;margin-bottom:6px">Deadlines nästa 14 dagar (${due14.length})</div>
        <ul style="margin:0;padding-left:18px;font-size:14px;color:#525258">
          ${due14.slice(0, 8).map((t) => `<li><strong>${t.title}</strong> — ${new Date(t.due_at).toLocaleDateString("sv-SE")}${t.priority === "high" ? " · 🔴 hög prio" : ""}</li>`).join("")}
        </ul>
      </div>` : ""}

    ${reviewQ.length > 0 ? `<div style="font-size:14px;color:#525258;margin-bottom:16px"><strong>${reviewQ.length} kvitton</strong> väntar på granskning.</div>` : ""}

    <div style="margin-top:20px;text-align:center">
      <a href="${appUrl}/brief" style="display:inline-block;background:#0d3a2a;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:600">Öppna veckobrevet</a>
    </div>

    <div style="font-size:11px;color:#8a8a90;text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #e7e7e0">
      Du får detta mail för att veckosammanfattning är aktiverad i <a href="${process.env.NEXT_PUBLIC_APP_URL || ""}/settings" style="color:#0d3a2a">Inställningar</a>.
    </div>
  </div>
</div>
</body></html>`;

  return { subject, html, advice, summary: { sumPaid, sumOpen, sumExpenses, tripDed, profit, tax: tax.total_skatt, overdue: overdue.length, due14: due14.length, reviewQ: reviewQ.length } };
}
