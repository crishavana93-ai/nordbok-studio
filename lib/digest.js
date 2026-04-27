/* Build the weekly digest email body for one user. Pure function — no IO. */
import { mileageDeduction, estimateTax } from "./swedish-tax";

const fmt = (n) => new Intl.NumberFormat("sv-SE").format(Math.round(Number(n) || 0));

export function buildDigest({ user, settings, invoices, receipts, trips, tasks }) {
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
  const revenue     = inv.reduce((a, i) => a + Number(i.subtotal || 0), 0);
  const profit      = revenue - sumExpenses - tripDed;
  const tax         = estimateTax(Math.max(0, profit));
  const vatOut      = inv.reduce((a, i) => a + Number(i.vat_amount || 0), 0);
  const vatIn       = rec.reduce((a, r) => a + Number(r.vat_amount || 0), 0);

  const businessName = settings?.business_name || "din verksamhet";
  const subject = overdue.length > 0
    ? `📌 ${overdue.length} förfallna fakturor · ${due14.length} deadlines på 14d`
    : `Veckorapport · ${due14.length} deadlines · ${fmt(sumOpen)} kr utestående`;

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

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="background:#f4f4ef;padding:12px;border-radius:9px"><div style="font-size:11px;color:#8a8a90;text-transform:uppercase">Inbetalt YTD</div><div style="font-weight:700;font-size:20px">${fmt(sumPaid)} kr</div></div>
      <div style="background:#f4f4ef;padding:12px;border-radius:9px"><div style="font-size:11px;color:#8a8a90;text-transform:uppercase">Utestående</div><div style="font-weight:700;font-size:20px">${fmt(sumOpen)} kr</div></div>
      <div style="background:#f4f4ef;padding:12px;border-radius:9px"><div style="font-size:11px;color:#8a8a90;text-transform:uppercase">Avdragsgilla utg.</div><div style="font-weight:700;font-size:20px">${fmt(sumExpenses)} kr</div></div>
      <div style="background:#f4f4ef;padding:12px;border-radius:9px"><div style="font-size:11px;color:#8a8a90;text-transform:uppercase">Beräknad skatt</div><div style="font-weight:700;font-size:20px">${fmt(tax.total_tax)} kr</div></div>
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
      <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://studio.skattenavigator.se"}/dashboard" style="display:inline-block;background:#0d3a2a;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:600">Öppna dashboard</a>
    </div>

    <div style="font-size:11px;color:#8a8a90;text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #e7e7e0">
      Du får detta mail för att veckosammanfattning är aktiverad i <a href="${process.env.NEXT_PUBLIC_APP_URL || ""}/settings" style="color:#0d3a2a">Inställningar</a>.
    </div>
  </div>
</div>
</body></html>`;

  return { subject, html, summary: { sumPaid, sumOpen, sumExpenses, tripDed, profit, tax: tax.total_tax, overdue: overdue.length, due14: due14.length, reviewQ: reviewQ.length } };
}
