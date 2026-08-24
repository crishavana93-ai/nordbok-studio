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
import { sellerIdentity } from "@/lib/seller";

/* The credit reason is text the user typed. It goes straight into an HTML email, so it
 * gets escaped here rather than trusted. */
const esc0 = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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

    const [{ data: client }, { data: items }, { data: venture }] = await Promise.all([
      sb.from("studio_clients").select("*").eq("id", invoice.client_id).maybeSingle(),
      sb.from("studio_invoice_items").select("*").eq("invoice_id", invoice_id).order("position"),
      invoice.venture
        ? sb.from("studio_venture_identity").select("*")
            .eq("user_id", invoice.user_id).eq("venture", invoice.venture).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    /* An andringsfaktura is unreadable without the invoice it changes -- the law calls
       for a sarskild och otvetydig hanvisning, and a reference the recipient cannot
       resolve is neither. */
    const isCredit = invoice.document_type === "credit_note";
    const { data: creditOf } = invoice.credit_of
      ? await sb.from("studio_invoices").select("id, invoice_number, issue_date, total")
          .eq("id", invoice.credit_of).maybeSingle()
      : { data: null };
    if (isCredit && !creditOf?.invoice_number) {
      return NextResponse.json({
        error: "Ändringsfakturan hänvisar inte till en skickad ursprungsfaktura och kan inte skickas.",
      }, { status: 422 });
    }

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

    /* ── Everything that can fail must fail BEFORE a number is spent ───────── */
    const resend = new Resend(process.env.RESEND_API_KEY);
    const seller = sellerIdentity({ settings, venture, lang: invoice.language === "en" ? "en" : "sv" });
    const fromName = seller.headerName || settings?.business_name || "Nordbok Studio";
    const configured = seller.fromEmail || process.env.RESEND_FROM_EMAIL || null;
    if (!configured) {
      return NextResponse.json({
        error: "Ingen avsändaradress är konfigurerad. Ange den under Inställningar → Verksamheter, och verifiera domänen hos e-postleverantören.",
      }, { status: 400 });
    }
    /* Accept either a bare address or an already-formatted "Name <addr>" string. */
    const fromEmail = configured.includes("<") ? configured : `${fromName} <${configured}>`;

    /* PRE-FLIGHT THE SENDING DOMAIN.
     * The previous version carried a comment claiming this happened before allocation.
     * It did not -- the check sat twenty lines below the allocator. So when the API key
     * could not see the domain, 2026-0001 was handed out and then thrown away, and the
     * series jumped to 2026-0002. A gap in a Swedish invoice series is the one defect
     * this whole module exists to prevent, so the claim is now enforced by position:
     * nothing below this block runs until the transport says it can send. */
    const addr = (fromEmail.match(/<([^>]+)>/)?.[1] || fromEmail).trim();
    const domain = addr.split("@")[1]?.toLowerCase();
    try {
      const { data: domains, error: dErr } = await resend.domains.list();
      /* A listing failure is usually a bad or foreign API key. Say which, because
         "domain is not verified" sent the last hour in the wrong direction. */
      if (dErr) {
        return NextResponse.json({
          error: `E-postleverantören svarade inte på domänkontrollen: ${dErr.message}. Kontrollera att RESEND_API_KEY hör till samma konto som domänen.`,
        }, { status: 502 });
      }
      const list = domains?.data || domains || [];
      const match = list.find?.((d) => d.name?.toLowerCase() === domain);
      if (!match) {
        return NextResponse.json({
          error: `Domänen ${domain} finns inte hos e-postleverantören för den API-nyckel servern använder. Nyckeln och domänen hör troligen till olika konton. Ingen fakturanummer har förbrukats.`,
        }, { status: 400 });
      }
      if (match.status && match.status !== "verified") {
        return NextResponse.json({
          error: `Domänen ${domain} är inte verifierad (status: ${match.status}). Inget fakturanummer har förbrukats.`,
        }, { status: 400 });
      }
    } catch (probeErr) {
      /* Never let the pre-flight itself block a legitimate send: if the check cannot
         run at all, fall through and let the real send report the real error. */
      console.warn("[send] domain pre-flight skipped:", probeErr?.message);
    }

    /* ── Only now is a number spent ─────────────────────────────────────────── */
    let invoiceNumber = invoice.invoice_number;
    let allocatedHere = false;
    if (!invoiceNumber || invoice.status === "draft") {
      const { data: allocated, error: numErr } = await sb.rpc("next_invoice_number", { p_series: "default" });
      if (numErr) return NextResponse.json({ error: `Kunde inte tilldela fakturanummer: ${numErr.message}` }, { status: 500 });
      invoiceNumber = allocated;
      allocatedHere = true;
    }

    /* If anything below fails, hand the number back so the series stays unbroken. */
    const releaseNumber = async (reason) => {
      if (!allocatedHere) return;
      const { data: rewound, error: relErr } = await sb.rpc("release_invoice_number", {
        p_number: invoiceNumber, p_reason: reason, p_series: "default",
      });
      if (relErr) console.error("[send] could not release", invoiceNumber, relErr.message);
      else if (rewound === false) console.warn("[send] gap logged for", invoiceNumber);
    };

    /* ── Freeze the breakdown so history stays reproducible ────────────────── */
    const bd = vatBreakdown(items || []);
    const frozen = bd.rows.map((r) => ({ rate: r.rate, net: r.net, vat: r.vat, gross: r.gross }));

    const sendable = { ...invoice, invoice_number: invoiceNumber, vat_breakdown: frozen };
    const html = renderInvoiceHTML({ invoice: sendable, client, settings, items: items || [], venture, creditOf });

    /* ── Email, in the invoice's own currency ──────────────────────────────── */
    const ccy = invoice.currency || "SEK";
    const money = new Intl.NumberFormat("sv-SE", {
      style: "currency", currency: ccy, minimumFractionDigits: 2,
    }).format(Number(invoice.total) || 0);

    const en = invoice.language === "en";
    const subject = isCredit
      ? (en ? `Credit note ${invoiceNumber} from ${fromName} (re. invoice ${creditOf.invoice_number})`
            : `Ändringsfaktura ${invoiceNumber} från ${fromName} (avser faktura ${creditOf.invoice_number})`)
      : (en ? `Invoice ${invoiceNumber} from ${fromName}`
            : `Faktura ${invoiceNumber} från ${fromName}`);

    const intro = isCredit
      ? (en
        ? `<p>Hi ${client.contact_person || client.name},</p>
<p>Credit note <strong>${invoiceNumber}</strong> corrects invoice <strong>${creditOf.invoice_number}</strong>. ${esc0(invoice.credit_reason || "")}</p>
<p>Nothing is owed on this document; please disregard the original invoice.</p>`
        : `<p>Hej ${client.contact_person || client.name},</p>
<p>Ändringsfaktura <strong>${invoiceNumber}</strong> rättar faktura <strong>${creditOf.invoice_number}</strong>. ${esc0(invoice.credit_reason || "")}</p>
<p>Ingen betalning ska ske på detta dokument — bortse från ursprungsfakturan.</p>`)
      : en
      ? `<p>Hi ${client.contact_person || client.name},</p>
<p>Please find invoice <strong>${invoiceNumber}</strong> for <strong>${money}</strong>, due <strong>${invoice.due_date}</strong>.</p>`
      : `<p>Hej ${client.contact_person || client.name},</p>
<p>Bifogat finner du faktura <strong>${invoiceNumber}</strong> på <strong>${money}</strong>, förfaller <strong>${invoice.due_date}</strong>.</p>`;

    const ref = isCredit ? "" : invoice.ocr_number
      ? `<p>${en ? "Payment reference" : "OCR-nummer för betalning"}: <strong style="font-family:ui-monospace,monospace">${invoice.ocr_number}</strong></p>`
      : "";

    const body = `${intro}${ref}
<hr style="border:0;border-top:1px solid #e7e7e0;margin:24px 0">
${html.replace(/^<!doctype[^>]+>/i, "").replace(/^<html[^>]*>/i, "").replace(/<\/html>$/i, "")}`;

    /* `replyTo`, not `reply_to`. The Resend Node SDK went camelCase at v2 and silently
     * ignores the snake_case key -- so every customer reply was going back to the
     * sending domain instead of to a mailbox anyone reads. */
    /* BLINDKOPIA.
     * Mail leaves through the email provider's servers, never through your own mail
     * client, so no copy appears in its Sent folder -- there is nothing there to
     * appear. BCC yourself and a real copy lands in a mailbox you control, which is
     * what most people actually mean when they go looking for "sent". */
    const bcc = (venture?.bcc || settings?.invoice_bcc || "").trim() || null;

    const result = await resend.emails.send({
      from: fromEmail,
      to: client.email,
      ...(bcc ? { bcc } : {}),
      replyTo: seller.replyTo || user.email,
      subject,
      html: body,
    });
    if (result.error) {
      await releaseNumber(`Utskick misslyckades: ${result.error.message || "okänt fel"}`);
      return NextResponse.json({
        error: `${result.error.message || "Resend error"} — fakturanumret har återlämnats, serien är obruten.`,
      }, { status: 502 });
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
      sent_from: fromEmail,
    }).eq("id", invoice_id);

    /* No payment is expected on a credit note, so no chase task. Creating one would
       put "remind them to pay" on a document that says the opposite. */
    if (!isCredit) await sb.from("studio_tasks").insert({
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
