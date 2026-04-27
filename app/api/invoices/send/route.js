import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireUser } from "@/lib/supabase-server";
import { renderInvoiceHTML } from "@/lib/invoice-html";

export async function POST(req) {
  try {
    const { sb, user } = await requireUser();
    const { invoice_id } = await req.json();
    if (!invoice_id) return NextResponse.json({ error: "Missing invoice_id" }, { status: 400 });

    const { data: invoice, error } = await sb.from("studio_invoices").select("*").eq("id", invoice_id).maybeSingle();
    if (error || !invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    const { data: client } = await sb.from("studio_clients").select("*").eq("id", invoice.client_id).maybeSingle();
    const { data: settings } = await sb.from("studio_settings").select("*").maybeSingle();
    const { data: items } = await sb.from("studio_invoice_items").select("*").eq("invoice_id", invoice_id).order("position");

    if (!client?.email) {
      return NextResponse.json({ error: "Klienten saknar e-postadress." }, { status: 400 });
    }
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "RESEND_API_KEY saknas i serverns miljövariabler." }, { status: 500 });
    }

    const html = renderInvoiceHTML({ invoice, client, settings, items: items || [] });

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromName = settings?.business_name || "Nordbok Studio";
    const fromEmail = process.env.RESEND_FROM_EMAIL || `Studio <faktura@${(process.env.NEXT_PUBLIC_APP_URL || "nordbok.app").replace(/^https?:\/\//, "").split("/")[0]}>`;

    const subject = `Faktura ${invoice.invoice_number} från ${fromName}`;
    const body = `<p>Hej ${client.contact_person || client.name},</p>
<p>Bifogat finner du faktura <strong>${invoice.invoice_number}</strong> på <strong>${new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2 }).format(Number(invoice.total))} kr</strong>, förfaller <strong>${invoice.due_date}</strong>.</p>
<p>OCR-nummer för betalning: <strong style="font-family:ui-monospace,monospace">${invoice.ocr_number}</strong></p>
<hr style="border:0;border-top:1px solid #e7e7e0;margin:24px 0">
${html.replace(/^<!doctype[^>]+>/i, "").replace(/^<html[^>]*>/i, "").replace(/<\/html>$/i, "")}`;

    const result = await resend.emails.send({
      from: fromEmail,
      to: client.email,
      reply_to: user.email,
      subject,
      html: body,
    });
    if (result.error) return NextResponse.json({ error: result.error.message || "Resend error" }, { status: 502 });

    await sb.from("studio_invoices").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", invoice_id);

    // Schedule a follow-up reminder 3 days after due date
    await sb.from("studio_tasks").insert({
      user_id: user.id,
      title: `Påminn ${client.name} — faktura ${invoice.invoice_number}`,
      description: `Faktura förföll ${invoice.due_date} och är inte markerad som betald.`,
      due_at: new Date(new Date(invoice.due_date).getTime() + 3 * 86400000).toISOString(),
      remind_at: new Date(new Date(invoice.due_date).getTime() + 3 * 86400000).toISOString(),
      category: "invoice_followup",
      priority: "high",
      source: "system",
      related_invoice: invoice_id,
    });

    return NextResponse.json({ ok: true, id: result.data?.id });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: e.status || 500 });
  }
}
