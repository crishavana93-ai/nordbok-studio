/* app/api/invoices/send/route.js
 *
 * Sending is the moment a document becomes a fact in someone else's accounts. This
 * route is therefore the strictest one in the app.
 *
 * FIVE THINGS THE PREVIOUS VERSION GOT WRONG
 *
 * 1. No validation. A defective invoice — missing VAT number, a 0% line with no stated
 *    ground, totals that disagree with the lines — went out and cost the customer their
 *    input-VAT deduction. Now validateInvoice() runs and errors BLOCK the send.
 * 2. The number was assumed to already exist. Swedish law wants a gap-free sequence,
 *    so a number must be allocated at SEND, never to a draft that might be deleted.
 *    Now next_invoice_number() is called here, atomically.
 * 3. "kr" was hardcoded in the email body. A EUR invoice said "1 200 kr".
 * 4. No idempotency. A double-tapped button sent two emails and created two follow-up
 *    tasks. Now a second call returns the first result.
 * 5. The VAT breakdown was recomputed on every render, so editing a line item silently
 *    changed what a historical invoice looked like. Now it is frozen at send.
 */

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireUser } from "@/lib/supabase-server";
import { renderInvoiceHTML } from "@/lib/invoice-html";
import { validateInvoice, vatBreakdown } from "@/lib/invoice-compliance";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { sb, user } = await requireUser();
    const { invoice_id, acknowledge_warnings } = await req.json();
    if (!invoice_id) return NextResponse.json({ error: "Missing invoice_id" }, { status: 400 });

    const [{ data: invoice }, { data: settings }] = await Promise.all([
      sb.from("studio_invoices").select("*").eq("id", invoice_id).maybeSingle(),
      sb.from("studio_settings").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    if (!invoice) return NextResponse.json({ error: "Fakturan hittades inte." }, { status: 404 });

    /* ── Idempotency: already sent is a success, not a second email ─────────── */
    if (invoice.sent_at) {
      return NextResponse.json({
        ok: true, replayed: true,
        invoice_number: invoice.invoice_number,
        message: `Fakturan skickades redan ${new Date(invoice.sent_at).toLocaleString("sv-SE")}.`,
      });
    }

    const [{ data: client }, { data: items }] = await Promise.all([
      sb.from("studio_clients").select("*").eq("id", invoice.client_id).maybeSingle(),
      sb.from("studio_invoice_items").select("*").eq("invoice_id", invoice_id).order("position"),
    ]);

    if (!client?.email) {
      return NextResponse.json({ error: "Kunden saknar e-postadress." }, { status: 400 });
    }
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "RESEND_API_KEY saknas i serverns miljövariabler." }, { status: 500 });
    }

    /* ── The gate ──────────────────────────────────────────────────────────── */
    const check = validateInvoice({
      invoice: { ...invoice, invoice_number: invoice.invoice_number || "PENDING" },
      client,
      settings,
      items: items || [],
    });

    if (!check.ok) {
      return NextResponse.json(
        { error: "Fakturan uppfyller inte kraven och kan inte skickas.", errors: check.errors, warnings: check.warnings },
        { status: 422 }
      );
    }
    if (check.warnings.length && !acknowledge_warnings) {
      return NextResponse.json(
        { needs_acknowledgement: true, warnings: check.warnings },
        { status: 409 }
      );
    }

    /* ── Allocate the number now, not before ───────────────────────────────── */
    let invoiceNumber = invoice.invoice_number;
    if (!invoiceNumber || invoice.status === "draft") {
      const { data: allocated, error: numErr } = await sb.rpc("next_invoice_number", { p_series: "default" });
      if (numErr) return NextResponse.json({ error: `Kunde inte tilldela fakturanummer: ${numErr.message}` }, { status: 500 });
      invoiceNumber = allocated;
    }

    /* ── Freeze the breakdown so history stays reproducible ────────────────── */
    const bd = vatBreakdown(items || []);
    const frozen = bd.rows.map((r) => ({ rate: r.rate, net: r.net, vat: r.vat, gross: r.gross }));

    const sendable = { ...invoice, invoice_number: invoiceNumber, vat_breakdown: frozen };
    const html = renderInvoiceHTML({ invoice: sendable, client, settings, items: items || [] });

    /* ── Email, in the invoice's own currency ──────────────────────────────── */
    const ccy = invoice.currency || "SEK";
    const money = new Intl.NumberFormat("sv-SE", {
      style: "currency", currency: ccy, minimumFractionDigits: 2,
    }).format(Number(invoice.total) || 0);

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromName = settings?.business_name || "Nordbok Studio";
    const fromEmail =
      process.env.RESEND_FROM_EMAIL ||
      `Studio <faktura@${(process.env.NEXT_PUBLIC_APP_URL || "nordbok.app").replace(/^https?:\/\//, "").split("/")[0]}>`;

    const en = invoice.language === "en";
    const subject = en
      ? `Invoice ${invoiceNumber} from ${fromName}`
      : `Faktura ${invoiceNumber} från ${fromName}`;

    const intro = en
      ? `<p>Hi ${client.contact_person || client.name},</p>
<p>Please find invoice <strong>${invoiceNumber}</strong> for <strong>${money}</strong>, due <strong>${invoice.due_date}</strong>.</p>`
      : `<p>Hej ${client.contact_person || client.name},</p>
<p>Bifogat finner du faktura <strong>${invoiceNumber}</strong> på <strong>${money}</strong>, förfaller <strong>${invoice.due_date}</strong>.</p>`;

    const ref = invoice.ocr_number
      ? `<p>${en ? "Payment reference" : "OCR-nummer för betalning"}: <strong style="font-family:ui-monospace,monospace">${invoice.ocr_number}</strong></p>`
      : "";

    const body = `${intro}${ref}
<hr style="border:0;border-top:1px solid #e7e7e0;margin:24px 0">
${html.replace(/^<!doctype[^>]+>/i, "").replace(/^<html[^>]*>/i, "").replace(/<\/html>$/i, "")}`;

    const result = await resend.emails.send({
      from: fromEmail, to: client.email, reply_to: user.email, subject, html: body,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error.message || "Resend error" }, { status: 502 });
    }

    /* ── Only now does it become a fact ────────────────────────────────────── */
    await sb.from("studio_invoices").update({
      invoice_number: invoiceNumber,
      status: "sent",
      sent_at: new Date().toISOString(),
      vat_breakdown: frozen,
      subtotal: bd.subtotal,
      vat_amount: bd.vatTotal,
      total: bd.total,
    }).eq("id", invoice_id);

    await sb.from("studio_tasks").insert({
      user_id: user.id,
      title: `Påminn ${client.name} — faktura ${invoiceNumber}`,
      description: `Faktura förföll ${invoice.due_date} och är inte markerad som betald.`,
      due_at: new Date(new Date(invoice.due_date).getTime() + 3 * 86400000).toISOString(),
      remind_at: new Date(new Date(invoice.due_date).getTime() + 3 * 86400000).toISOString(),
      category: "invoice_followup",
      priority: "high",
      source: "system",
      related_invoice: invoice_id,
    });

    return NextResponse.json({
      ok: true,
      id: result.data?.id,
      invoice_number: invoiceNumber,
      warnings: check.warnings,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: e.status || 500 });
  }
}
