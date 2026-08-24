/* app/resor/[id]/page.js — DIRECTION C
 *
 * Migrated 2026-08-24. The important change is not the colour.
 *
 * THE CANDIDATE QUERIES WERE UNSCOPED. Six reads, none filtered by user_id:
 *
 *   sb.from("studio_receipts").select("*").is("business_trip_id", null)
 *     .gte("receipt_date", trip.start_date)...
 *
 * Once migration 006 allowed a revisor to read someone else's books, RLS returned
 * BOTH owners' rows — so this page offered YOUR receipts as candidates to attach to
 * THEIR trip, and attaching one would have moved a verifikation between two people's
 * accounts. Everything is scoped to the trip's own owner now, and the trip itself is
 * fetched by owner too rather than by id alone.
 *
 * The checklist at the bottom also stopped using emoji as its only state signal —
 * "✅"/"⬜" carried the meaning with nothing else, and a screen reader announces those
 * as "vit tung bock" and "vit kvadrat".
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { serverClient } from "@/lib/supabase-server";
import { getActiveOwnerId } from "@/lib/access";
import { money, num, dateISO } from "@/lib/format";
import TripActions from "./actions";

export const dynamic = "force-dynamic";

const STATUS = {
  planned:   { label: "Planerad",  tone: "bg-raised text-ink-3" },
  ongoing:   { label: "Pågår",     tone: "bg-warn-bg text-warn" },
  completed: { label: "Genomförd", tone: "bg-good-bg text-good" },
  cancelled: { label: "Inställd",  tone: "bg-raised text-ink-3" },
};

function Block({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="micro-label">{label}</span>
      <div className="text-[13.5px] leading-relaxed text-ink">{children}</div>
    </div>
  );
}

function Stat({ label, value, note }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <span className="micro-label">{label}</span>
      <span className="tnum text-[20px] font-medium tracking-[-0.02em]">{value}</span>
      {note && <span className="text-[11.5px] text-ink-3">{note}</span>}
    </div>
  );
}

function Check({ done, children, note }) {
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <span aria-hidden="true"
        className={`mt-[3px] grid size-[15px] shrink-0 place-items-center rounded-[4px] font-mono text-[10px] ${
          done ? "bg-good-bg text-good" : "border border-border-firm text-transparent"
        }`}>
        ✓
      </span>
      <span className="text-[13.5px] leading-relaxed text-ink-2">
        <span className="sr-only">{done ? "Klart: " : "Saknas: "}</span>
        <span className={done ? "text-ink-2" : "text-ink"}>{children}</span>
        {note && <span className="text-ink-3"> — {note}</span>}
      </span>
    </li>
  );
}

export default async function TripView({ params }) {
  const { id } = await params;
  const sb = await serverClient();
  const ownerId = await getActiveOwnerId();

  const { data: trip } = await sb
    .from("studio_business_trips").select("*, studio_clients(name, email)")
    .eq("id", id).eq("user_id", ownerId).maybeSingle();
  if (!trip) return notFound();

  /* Every one of these is scoped to the TRIP's owner. See the header. */
  const own = (q) => q.eq("user_id", trip.user_id);

  const [{ data: linkedReceipts }, { data: candidateReceipts },
         { data: linkedMileage }, { data: candidateMileage },
         { data: linkedDocs }, { data: candidateDocs }] = await Promise.all([
    own(sb.from("studio_receipts").select("*").eq("business_trip_id", trip.id)).order("receipt_date"),
    own(sb.from("studio_receipts").select("*").is("business_trip_id", null)
        .gte("receipt_date", trip.start_date).lte("receipt_date", trip.end_date)).order("receipt_date"),
    own(sb.from("studio_trips").select("*").eq("business_trip_id", trip.id)).order("trip_date"),
    own(sb.from("studio_trips").select("*").is("business_trip_id", null)
        .gte("trip_date", trip.start_date).lte("trip_date", trip.end_date)).order("trip_date"),
    own(sb.from("studio_documents").select("*").eq("business_trip_id", trip.id)).order("issued_date"),
    own(sb.from("studio_documents").select("*").is("business_trip_id", null)
        .gte("issued_date", trip.start_date).lte("issued_date", trip.end_date)).order("issued_date"),
  ]);

  const ccy = trip.currency || "SEK";
  const receipts = linkedReceipts || [], mileage = linkedMileage || [], docs = linkedDocs || [];
  const totalReceipts = receipts.reduce((a, r) => a + Number(r.total || 0), 0);
  const totalMileage = mileage.reduce((a, m) => a + Number(m.deduction || 0), 0);
  const drove = trip.travel_mode === "car" || trip.travel_mode === "mixed";
  const s = STATUS[trip.status] || { label: trip.status, tone: "bg-raised text-ink-3" };
  const span = trip.end_date && trip.end_date !== trip.start_date
    ? `${dateISO(trip.start_date)} → ${dateISO(trip.end_date)}` : dateISO(trip.start_date);

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/resor" className="font-mono text-[11.5px] text-ink-3 hover:text-ink-2">← Alla resor</Link>
          <h1 className="mt-1.5 truncate text-[21px] font-medium tracking-[-0.015em]">{trip.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`inline-block rounded px-2 py-0.5 font-mono text-[10.5px] font-medium ${s.tone}`}>{s.label}</span>
            <span className="font-mono text-[11.5px] text-ink-3">{span}</span>
            {trip.destination && <span className="text-[12.5px] text-ink-2">{trip.destination}</span>}
            {trip.country_code && trip.country_code !== "SE" && (
              <span className="font-mono text-[11px] text-ink-3">{trip.country_code}</span>
            )}
          </div>
        </div>
        <TripActions trip={trip} />
      </div>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="mb-1 text-[15.5px] font-medium tracking-[-0.01em]">Underlag för Skatteverket</h2>
        <p className="mb-4 text-[12.5px] leading-relaxed text-ink-3">
          Det här är vad som efterfrågas om avdraget ifrågasätts, upp till sex år efteråt.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Block label="Syfte">
            <span className="whitespace-pre-wrap">{trip.purpose || <span className="text-ink-3">Inte angivet</span>}</span>
            {trip.conference && <div className="mt-1.5 text-[12.5px] text-ink-2">Konferens: {trip.conference}</div>}
          </Block>
          <Block label="Kontakter och deltagare">
            {Array.isArray(trip.contacts) && trip.contacts.length > 0 ? (
              <ul className="flex flex-col gap-0.5">
                {trip.contacts.map((c, i) => (
                  <li key={i}>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-ink-2">
                      {c.company ? ` — ${c.company}` : ""}{c.role ? ` (${c.role})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <span className="text-ink-3">Inga kontakter loggade</span>}
          </Block>
          <Block label="Färdmedel">
            {trip.travel_mode || <span className="text-ink-3">Inte angivet</span>}
            {trip.vehicle_reg && <span className="text-ink-2"> · {trip.vehicle_reg}</span>}
          </Block>
          <Block label="Måltider">
            {trip.uses_traktamente ? "Traktamente enligt schablon" : "Faktiska kvitton"}
          </Block>
        </div>

        {trip.private_days > 0 && (
          <p className="mt-4 rounded-[var(--radius-ctl)] bg-warn-bg px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
            <span className="font-medium text-ink">{num(trip.private_days)} privata dagar.</span>{" "}
            Hotell och flyg ska fördelas proportionellt — bara den del som hör till
            tjänsteresan är avdragsgill.
          </p>
        )}
        {trip.notes && (
          <p className="mt-4 border-t border-border pt-3.5 text-[13px] leading-relaxed text-ink-2">{trip.notes}</p>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Kvitton" value={num(receipts.length)}
          note={money(totalReceipts, { decimals: 0, currency: ccy }).text} />
        <Stat label="Körjournal" value={`${num(mileage.length)} resor`}
          note={`Avdrag ${money(totalMileage, { decimals: 0 }).text}`} />
        <Stat label="Dokument" value={num(docs.length)} note="Boardingkort, hotellfaktura…" />
      </div>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="mb-3 text-[15.5px] font-medium tracking-[-0.01em]">Kvitton</h2>
        {receipts.length === 0 ? (
          <p className="text-[13px] text-ink-3">Inga kvitton kopplade ännu.</p>
        ) : (
          <div className="flex flex-col">
            {receipts.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-border py-2.5 last:border-b-0">
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] text-ink">{r.vendor}</span>
                  <span className="font-mono text-[11px] text-ink-3">
                    {dateISO(r.receipt_date)}{r.category ? ` · ${r.category}` : ""}
                  </span>
                </span>
                <span className="tnum shrink-0 font-mono text-[13px]">
                  {money(r.total, { decimals: 2, currency: r.currency || "SEK" }).text}
                </span>
              </div>
            ))}
          </div>
        )}
        {(candidateReceipts || []).length > 0 && (
          <details className="mt-3.5 border-t border-border pt-3.5">
            <summary className="cursor-pointer text-[13px] font-medium text-ink-2">
              {num(candidateReceipts.length)} kvitton ligger inom resans datum — koppla?
            </summary>
            <div className="mt-3">
              <TripActions.AttachList trip={trip} kind="receipts" items={candidateReceipts} />
            </div>
          </details>
        )}
      </section>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="mb-3 text-[15.5px] font-medium tracking-[-0.01em]">Körjournal</h2>
        {mileage.length === 0 ? (
          <p className="text-[13px] text-ink-3">Inga körjournalresor kopplade ännu.</p>
        ) : (
          <div className="flex flex-col">
            {mileage.map((m) => (
              <div key={m.id} className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-border py-2.5 last:border-b-0">
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] text-ink">{m.from_address} → {m.to_address}</span>
                  <span className="font-mono text-[11px] text-ink-3">{dateISO(m.trip_date)} · {num(m.km)} km</span>
                </span>
                <span className="tnum shrink-0 font-mono text-[13px]">
                  {money(m.deduction, { decimals: 0 }).text}
                </span>
              </div>
            ))}
          </div>
        )}
        {(candidateMileage || []).length > 0 && (
          <details className="mt-3.5 border-t border-border pt-3.5">
            <summary className="cursor-pointer text-[13px] font-medium text-ink-2">
              {num(candidateMileage.length)} resor matchar datumen — koppla?
            </summary>
            <div className="mt-3"><TripActions.AttachList trip={trip} kind="mileage" items={candidateMileage} /></div>
          </details>
        )}
      </section>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="mb-1 text-[15.5px] font-medium tracking-[-0.01em]">Dokument</h2>
        <p className="mb-3 text-[12.5px] text-ink-3">Boardingkort, hotellfaktura, mässbiljett.</p>
        {docs.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-ink-3">
            Inga dokument kopplade. Ladda upp i{" "}
            <Link href="/documents" className="underline">Arkiv</Link> och koppla hit.
          </p>
        ) : (
          <div className="flex flex-col">
            {docs.map((d) => (
              <div key={d.id} className="border-b border-border py-2.5 last:border-b-0">
                <span className="block text-[13.5px] text-ink">{d.title}</span>
                <span className="font-mono text-[11px] text-ink-3">{d.doc_type}</span>
              </div>
            ))}
          </div>
        )}
        {(candidateDocs || []).length > 0 && (
          <details className="mt-3.5 border-t border-border pt-3.5">
            <summary className="cursor-pointer text-[13px] font-medium text-ink-2">
              {num(candidateDocs.length)} dokument matchar datumen — koppla?
            </summary>
            <div className="mt-3"><TripActions.AttachList trip={trip} kind="documents" items={candidateDocs} /></div>
          </details>
        )}
      </section>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="mb-3 text-[15.5px] font-medium tracking-[-0.01em]">Vad som finns på plats</h2>
        <ul className="flex flex-col">
          <Check done={Boolean(trip.purpose)}>Syftet med resan är loggat</Check>
          <Check done={(trip.contacts || []).length > 0}>Kontakter eller deltagare är loggade</Check>
          <Check done={receipts.length > 0}>Minst ett kvitto är kopplat</Check>
          {drove && <Check done={mileage.length > 0}>Körjournalen är kopplad</Check>}
          <Check done={docs.length > 0}>Boardingkort eller hotellfaktura är uppladdad</Check>
          <Check done={Boolean(trip.notes || trip.conference)} note="rekommenderat">Anteckningar eller konferensnamn</Check>
        </ul>
        <p className="mt-3.5 border-t border-border pt-3 text-[12px] leading-relaxed text-ink-3">
          Skatteverket kan begära det här i upp till sex år efter inkomståret. Allt sparas
          i sju enligt bokföringslagen.
        </p>
      </section>
    </div>
  );
}
