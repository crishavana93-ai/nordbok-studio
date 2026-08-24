/* components/MomsBanner.jsx — Server Component.
 *
 * Fram till nu fanns kunskapen om en försenad momsdeklaration bara i
 * `npm run momsstatus`, ett kommando man måste komma ihåg att köra. En upptäckt
 * som ingen ser är ingen upptäckt. Den här remsan ligger överst på översikten
 * och är det första som möter en när något har gått ut.
 *
 * Den säger tre saker och inget mer: att något är försenat, vad det kostar, och
 * vad man gör åt det. Är allt i sin ordning renderar den ingenting alls — en
 * banner som alltid syns slutar snabbt att betyda något.
 */

import Link from "next/link";
import { requireUser } from "@/lib/supabase-server";
import { getActiveOwnerId } from "@/lib/access";
import { momsStatus } from "@/lib/moms-status";

export default async function MomsBanner() {
  let s, settings;
  try {
    const { sb } = await requireUser();
    const ownerId = await getActiveOwnerId();

    const [{ data: inst }, { data: lamnade }] = await Promise.all([
      sb.from("studio_settings")
        .select("vat_registered_from, vat_dereg_from, vat_period_type, vat_eu_trade, vat_large_turnover")
        .eq("user_id", ownerId).maybeSingle(),
      sb.from("studio_moms_perioder").select("period_key, lamnad_at, belopp").eq("user_id", ownerId),
    ]);

    settings = inst;
    s = momsStatus({
      registreradFrom: inst?.vat_registered_from,
      avregistreradFrom: inst?.vat_dereg_from,
      periodTyp: inst?.vat_period_type,
      euHandel: !!inst?.vat_eu_trade,
      storOmsattning: !!inst?.vat_large_turnover,
      idag: new Date().toISOString().slice(0, 10),
      lamnade: lamnade || [],
    });
  } catch {
    /* Översikten ska ladda även om momstabellen inte finns än. En saknad
       migration får inte bli en vit sida. */
    return null;
  }

  if (!settings?.vat_registered_from) return null;

  /* Okänd redovisningsperiod: be om den, varna inte. Skillnaden mellan kvartal
     och helår är skillnaden mellan "sju dagar sen" och "åtta månader kvar". */
  if (s.saknarPeriodTyp || s.okandPeriodTyp) {
    return (
      <Remsa ton="fraga">
        <strong>Redovisningsperioden för moms är inte satt.</strong>{" "}
        Utan den går det inte att säga när din momsdeklaration ska lämnas — kvartal och
        helår ger flera månaders skillnad. Den står på momsregistreringsbeviset.
        <Knapp href="/settings">Ange den i inställningarna</Knapp>
      </Remsa>
    );
  }

  if (s.forsenade.length) {
    const avgift = s.forsenade.reduce((a, p) => a + p.forseningsavgift, 0);
    const flera = s.forsenade.length !== 1;
    return (
      <Remsa ton="varning">
        <strong>
          {s.forsenade.length} momsdeklaration{flera ? "er" : ""} är försenad{flera ? "e" : ""}
          {" — "}{s.forsenade.map((p) => p.key).join(", ")}.
        </strong>{" "}
        Förseningsavgiften är 625 kr per utebliven deklaration och tas ut även om
        deklarationen visar noll eller ett belopp att få tillbaka
        {flera ? `, sammanlagt ${avgift} kr` : ""}.
        <Knapp href={`/moms?period=${s.forsenade[0].key}`}>Se perioden</Knapp>
      </Remsa>
    );
  }

  if (s.nasta?.status === "brådskande") {
    return (
      <Remsa ton="fraga">
        <strong>Momsdeklarationen för {s.nasta.key} ska lämnas senast {s.nasta.deadline}.</strong>{" "}
        {s.nasta.dagar_till_deadline} dagar kvar.
        <Knapp href={`/moms?period=${s.nasta.key}`}>Se perioden</Knapp>
      </Remsa>
    );
  }

  return null;
}

/* ── Presentation ────────────────────────────────────────────────────────────
   Hårfin ram, ingen skugga, ingen ikonfärg utöver kantens — samma regler som
   resten av gränssnittet. Färgen bär betydelse här, inte dekoration.         */

function Remsa({ ton, children }) {
  const varning = ton === "varning";
  return (
    <div
      role={varning ? "alert" : "status"}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        gap: "8px 12px",
        padding: "12px 16px",
        marginBottom: 20,
        borderRadius: 10,
        background: "var(--warn-bg)",
        border: "1px solid var(--warn)",
        color: "var(--ink)",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <span aria-hidden="true" style={{ color: "var(--warn)", fontWeight: 600 }}>
        {varning ? "✗" : "?"}
      </span>
      <span style={{ flex: "1 1 320px", minWidth: 0 }}>{children}</span>
    </div>
  );
}

function Knapp({ href, children }) {
  return (
    <Link
      href={href}
      style={{
        flex: "0 0 auto",
        padding: "5px 12px",
        borderRadius: 8,
        border: "1px solid var(--border-firm)",
        color: "var(--ink)",
        textDecoration: "none",
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Link>
  );
}
