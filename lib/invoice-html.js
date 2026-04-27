/* Renders an invoice as a self-contained HTML document. Used for both:
   - browser PDF print (window.print() in /api/invoices/pdf)
   - email body
   Localizes based on `invoice.language` ('sv' | 'en') and `invoice.currency`. */

import { fmtMoney, fmtDate } from "./currency";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

const T = {
  sv: {
    invoice: "FAKTURA", number: "Nr", issued: "Datum", due: "Förfaller", ocr: "OCR",
    bill_to: "Faktureras till", description: "Beskrivning", qty: "Antal", price: "À-pris",
    vat: "Moms", total: "Summa", subtotal: "Delsumma", vat_amount: "Moms",
    rot_deduction: "ROT-avdrag", rut_deduction: "RUT-avdrag", to_pay: "Att betala",
    payment: "Betalning", reference_note: "Vid betalning ange OCR",
    terms: "Betalningsvillkor", days: "dagar", interest_note: "Dröjsmålsränta enligt räntelagen.",
    f_skatt: "Godkänd för F-skatt", reverse_charge_note: "Omvänd skattskyldighet — köparen redovisar moms enligt artikel 196 i mervärdesskattedirektivet.",
    rot_rut_work: (t) => `${t}-arbete`, fastighetsbeteckning: "Fastighetsbeteckning", customer_pn: "Personnr (kund)",
    work_hours: "arbetstimmar", html_lang: "sv", date_locale: "sv-SE",
  },
  en: {
    invoice: "INVOICE", number: "No.", issued: "Issued", due: "Due", ocr: "Reference",
    bill_to: "Bill to", description: "Description", qty: "Qty", price: "Unit price",
    vat: "VAT", total: "Amount", subtotal: "Subtotal", vat_amount: "VAT",
    rot_deduction: "ROT deduction", rut_deduction: "RUT deduction", to_pay: "Total due",
    payment: "Payment", reference_note: "Use this reference when paying",
    terms: "Payment terms", days: "days", interest_note: "Late payment interest applies per Swedish Interest Act.",
    f_skatt: "Approved for F-skatt (Swedish tax)", reverse_charge_note: "Reverse charge — buyer accounts for VAT (Article 196, EU VAT Directive).",
    rot_rut_work: (t) => `${t} work (Sweden)`, fastighetsbeteckning: "Property designation", customer_pn: "Customer ID",
    work_hours: "work hours", html_lang: "en", date_locale: "en-GB",
  },
};

export function renderInvoiceHTML({ invoice, client, settings, items }) {
  const lang = invoice.language === "en" ? "en" : "sv";
  const t = T[lang];
  const ccy = invoice.currency || "SEK";
  const f = (n) => fmtMoney(n, ccy);
  const totalDays = Math.max(0, Math.ceil((new Date(invoice.due_date) - new Date(invoice.issue_date)) / 86400000));

  return `<!doctype html>
<html lang="${t.html_lang}"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t.invoice} ${esc(invoice.invoice_number)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif;color:#18181b;margin:0;padding:24px;font-size:14px;line-height:1.5;background:#fff}
  @media (min-width: 600px) { body { padding: 32px; } }
  .head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;flex-wrap:wrap;gap:16px}
  .biz{font-size:20px;font-weight:700}
  h1{font-size:28px;font-weight:700;letter-spacing:-.02em;margin:0}
  .meta{text-align:right;font-size:13px;color:#525258;line-height:1.7}
  .blocks{display:flex;justify-content:space-between;gap:24px;margin-bottom:20px;font-size:13px;flex-wrap:wrap}
  .block-title{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a8a90;margin-bottom:6px;font-weight:600}
  .table-wrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
  table{width:100%;border-collapse:collapse;min-width:480px}
  th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#8a8a90;border-bottom:1px solid #e7e7e0;padding:8px 10px}
  td{padding:10px;border-bottom:1px solid #f3f3ee}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .totals{display:flex;justify-content:flex-end;margin-top:18px}
  .totals table{min-width:260px;width:auto}
  .totals td{border:0;padding:4px 10px}
  .totals tr.grand td{font-weight:700;font-size:16px;border-top:2px solid #18181b;padding-top:10px}
  .footer{margin-top:28px;padding-top:16px;border-top:1px solid #e7e7e0;font-size:13px;color:#525258;display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}
  .stamp{display:inline-block;border:2px solid #0d3a2a;color:#0d3a2a;padding:6px 12px;border-radius:6px;font-weight:700;font-size:12px;letter-spacing:.05em;text-transform:uppercase}
  .rotrut{margin-top:14px;padding:12px;background:#f4f4ef;border-radius:8px;font-size:13px}
  .reverse{margin-top:14px;padding:12px;background:#fef3c7;border-radius:8px;font-size:13px}
  @media print{body{padding:18mm}}
</style></head>
<body>
<div class="head">
  <div>
    <div class="biz">${esc(settings?.business_name)}</div>
    <div style="color:#525258;white-space:pre-line;margin-top:6px">${esc((settings?.address_street || "") + "\n" + (settings?.address_zip || "") + " " + (settings?.address_city || ""))}</div>
    <div style="color:#525258;margin-top:8px">${lang === "sv" ? "Personnr" : "Tax ID"}: ${esc(settings?.personnummer || "—")}${settings?.vat_number ? `<br>${lang === "sv" ? "Moms-nr" : "VAT no."}: ${esc(settings.vat_number)}` : ""}</div>
    ${settings?.f_skatt_approved ? `<div style="margin-top:8px"><span class="stamp">${t.f_skatt}</span></div>` : ""}
  </div>
  <div>
    <h1>${t.invoice}</h1>
    <div class="meta">
      ${t.number}: <strong>${esc(invoice.invoice_number)}</strong><br>
      ${t.issued}: ${fmtDate(invoice.issue_date, t.date_locale)}<br>
      ${t.due}: <strong>${fmtDate(invoice.due_date, t.date_locale)}</strong><br>
      ${t.ocr}: <span style="font-family:ui-monospace,monospace">${esc(invoice.ocr_number || "—")}</span>
    </div>
  </div>
</div>

<div class="blocks">
  <div>
    <div class="block-title">${t.bill_to}</div>
    <div style="font-weight:600">${esc(client?.name)}</div>
    <div style="white-space:pre-line;color:#525258">${esc((client?.address_street || "") + "\n" + (client?.address_zip || "") + " " + (client?.address_city || ""))}</div>
    ${client?.country_code && client.country_code !== "SE" ? `<div style="color:#525258">${esc(client.country_code)}</div>` : ""}
    ${client?.org_nr ? `<div style="color:#525258">${lang === "sv" ? "Org-nr" : "Tax ID"}: ${esc(client.org_nr)}</div>` : ""}
    ${client?.vat_number ? `<div style="color:#525258">${lang === "sv" ? "Moms-nr" : "VAT"}: ${esc(client.vat_number)}</div>` : ""}
  </div>
  ${invoice.rot_rut_type ? `
    <div>
      <div class="block-title">${esc(t.rot_rut_work(invoice.rot_rut_type))}</div>
      <div style="color:#525258">${t.fastighetsbeteckning}: <strong>${esc(client?.fastighetsbeteckning || "—")}</strong></div>
      <div style="color:#525258">${t.customer_pn}: ${esc(client?.org_nr || "—")}</div>
      <div style="color:#525258">${esc(invoice.rot_rut_type)}: <strong>${f(Number(invoice.rot_amount) || Number(invoice.rut_amount))}</strong></div>
    </div>` : ""}
</div>

<div class="table-wrap">
<table>
  <thead><tr><th>${t.description}</th><th class="num">${t.qty}</th><th class="num">${t.price}</th><th class="num">${t.vat} %</th><th class="num">${t.total}</th></tr></thead>
  <tbody>
    ${(items || []).map((it) => `
      <tr>
        <td>${esc(it.description)}${it.rot_rut_hours ? `<div style="color:#8a8a90;font-size:12px">${esc(it.rot_rut_hours)} ${t.work_hours}</div>` : ""}</td>
        <td class="num">${esc(it.quantity)} ${esc(it.unit || "")}</td>
        <td class="num">${f(it.unit_price)}</td>
        <td class="num">${esc(it.vat_rate)}%</td>
        <td class="num">${f(Number(it.quantity) * Number(it.unit_price))}</td>
      </tr>`).join("")}
  </tbody>
</table>
</div>

<div class="totals">
  <table>
    <tbody>
      <tr><td>${t.subtotal}</td><td class="num">${f(invoice.subtotal)}</td></tr>
      <tr><td>${t.vat_amount}</td><td class="num">${f(invoice.vat_amount)}</td></tr>
      ${Number(invoice.rot_amount) > 0 ? `<tr><td>${t.rot_deduction}</td><td class="num">−${f(invoice.rot_amount)}</td></tr>` : ""}
      ${Number(invoice.rut_amount) > 0 ? `<tr><td>${t.rut_deduction}</td><td class="num">−${f(invoice.rut_amount)}</td></tr>` : ""}
      <tr class="grand"><td>${t.to_pay}</td><td class="num">${f(invoice.total)}</td></tr>
    </tbody>
  </table>
</div>

${invoice.reverse_charge ? `<div class="reverse"><strong>${t.reverse_charge_note}</strong></div>` : ""}

<div class="footer">
  <div>
    <strong>${t.payment}</strong><br>
    ${settings?.bankgiro ? `Bankgiro: <strong>${esc(settings.bankgiro)}</strong><br>` : ""}
    ${settings?.iban ? `IBAN: <strong>${esc(settings.iban)}</strong><br>` : ""}
    ${settings?.plusgiro ? `Plusgiro: <strong>${esc(settings.plusgiro)}</strong><br>` : ""}
    ${invoice.ocr_number ? `${t.reference_note}: <strong>${esc(invoice.ocr_number)}</strong>` : ""}
  </div>
  <div style="text-align:right">
    ${t.terms}: ${totalDays} ${t.days}<br>
    ${t.interest_note}<br>
    ${settings?.invoice_footer ? esc(settings.invoice_footer) : ""}
  </div>
</div>

${invoice.notes ? `<div style="margin-top:16px;color:#525258">${esc(invoice.notes)}</div>` : ""}

</body></html>`;
}
