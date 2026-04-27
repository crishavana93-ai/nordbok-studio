import Link from "next/link";

export const metadata = { title: "Finansiering — bankkonto, kredit & lån" };

const Section = ({ title, children }) => (
  <div className="card" style={{ marginBottom: 14 }}>
    <h2 className="h2" style={{ marginTop: 0 }}>{title}</h2>
    {children}
  </div>
);

const T = ({ rows, headers }) => (
  <div className="table-wrap">
    <table className="table">
      <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default function FinansieringPage() {
  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <h1 className="h1">Finansiering & kredit</h1>
        <div className="muted">Bankkonto, lån, kort, hur du bygger företagskredit som enskild firma — och vad ingen säger åt dig.</div>
      </div>

      <div className="alert alert-info" style={{ marginBottom: 14 }}>
        <strong>Inledning:</strong> Denna sida är information, inte personlig finansiell rådgivning. Räntor och villkor 2026 är ungefärliga och ändras — kolla alltid med banken före beslut. För komplexa fall: konsultera revisor eller företagsrådgivare.
      </div>

      <Section title="🚨 Det viktigaste att förstå om enskild firma och kredit">
        <p style={{ marginTop: 0 }}>
          Som enskild näringsidkare är du <strong>personligt ansvarig</strong> för alla skulder företaget tar. Det finns ingen separat företagskredit — banken tittar på <strong>din UC-poäng</strong>, dina inkomster, betalningsanmärkningar och din historia.
        </p>
        <ul style={{ paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Late Klarna, telefonräkning eller hyra → påverkar direkt vilka lån du får som EF.</li>
          <li>Ingen kreditgräns mellan "ditt privata" och "ditt företag" rättsligt.</li>
          <li>Om du planerar lån &gt;500 000 kr — överväg att byta till AB (aktiebolag) för begränsat ansvar. Du kan flytta verksamheten utan skattekonsekvens enligt 23 kap. inkomstskattelagen.</li>
        </ul>
      </Section>

      <Section title="Bankkonto — vart ska du börja?">
        <p style={{ marginTop: 0 }}>De fintech-banker som rejectar (t.ex. Revolut Pro) gör automatisk KYC. Om du inte uppfyllde deras tröskel — gå till alternativ med mer manuell granskning.</p>
        <T headers={["Bank", "Typ", "EF-vänlig", "Notering"]} rows={[
          ["Wise Business", "Fintech, multi-currency", "★★★★★", "Bäst för internationella kunder. USD/GBP/EUR/SEK i lokala IBAN. ~£45 setup."],
          ["Lunar Business", "Nordisk neobank", "★★★★", "Mer flexibel än Revolut. Kort + IBAN + fakturering."],
          ["Qonto", "Fransk neobank, finns i SE", "★★★★", "Designat för frilans/SMB. €9–25/mån."],
          ["Holvi (BBVA)", "Finsk neobank", "★★★", "Frilans-fokus, kontrollera Sverige-status post-förvärv."],
          ["Swedbank Företagspaket", "Storbank", "★★★", "Lättast att få godkännande om du redan har privatkonto. Inkluderar Bankgiro."],
          ["SEB Företagskonto", "Storbank", "★★", "Vill se 6–12 månaders historik. Bättre räntor om godkänd."],
          ["Handelsbanken", "Storbank", "★★", "Långsam onboarding men relationsbaserad — bra när du väl är inne."],
        ]} />
        <div className="alert alert-info" style={{ marginTop: 12, marginBottom: 0 }}>
          <strong>Praktisk strategi:</strong> Öppna <strong>Wise Business</strong> (för internationella kunder) + <strong>Swedbank Företagspaket</strong> (svensk drift med Bankgiro) parallellt. Kostar lite. Bygger dual-stack.
        </div>
      </Section>

      <Section title="Lån & kredit för enskild firma">
        <T headers={["Långivare", "Typ", "Räntor 2026", "EF-vänlig", "Anmärkning"]} rows={[
          ["Almi Företagspartner (statlig)", "Startuplån, mikrolån, växtlån", "~5–8%", "★★★★★", "Designat för nya företag. Ofta sambelånat med bank. Boka gratis möte på almi.se."],
          ["Swedbank Företagskredit", "Kontokredit + termin", "7–12%", "★★★★", ""],
          ["SEB Företagskredit", "Kontokredit + termin", "7–12%", "★★★", ""],
          ["Handelsbanken", "Termin", "6–10%", "★★★", "Bästa räntorna om du är inne, svår att komma in."],
          ["Qred", "Fintech SMB-lån", "12–22%", "★★★★", "1–3 dagar utbetalning. Hög ränta."],
          ["Capitalbox", "Fintech SMB-lån", "14–25%", "★★★", ""],
          ["Froda", "Fintech SMB-lån", "12–20%", "★★★", ""],
          ["Kompar", "Marknadsplats", "—", "—", "Jämför offerter utan 50 separata UC-frågningar."],
          ["Tillväxtverket", "Bidrag (inte lån)", "—", "—", "Innovations- och regionala stöd. Programmen ändras årligen."],
        ]} />
      </Section>

      <Section title="Bygg företagskredit — steg-för-steg">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li><strong>Öppna Almi-finansierat startuplån</strong> (50–150k). Statligt backat, designat för nya EF.</li>
          <li><strong>Para med Swedbank Företagskonto</strong> (eller motsvarande storbank). De medfinansierar ofta med Almi.</li>
          <li><strong>Skaffa ett litet Företagskreditkort</strong> (Eurocard, AmEx Business, eller bankens eget) — betala av varje månad. Bygger snabbt betalningshistorik.</li>
          <li><strong>Efter 12 månader rena återbetalningar</strong> → ansök om större Kontokredit på din bank.</li>
          <li><strong>När verksamheten passerar ~500k kr/år</strong> → överväg att gå över till AB innan du tar &gt;500k i nya lån. Begränsar personligt ansvar.</li>
        </ol>
      </Section>

      <Section title="Klarna — hjälper det din företagskredit?">
        <p style={{ marginTop: 0 }}>
          <strong>Klarna är konsumentprodukt</strong> (Buy Now Pay Later), inte ett företagskredit-verktyg. Men:
        </p>
        <ul style={{ paddingLeft: 18, lineHeight: 1.7, margin: 0 }}>
          <li>Klarna rapporterar till UC — så <strong>betalar du i tid hjälper det din personliga kreditpoäng</strong> som direkt påverkar dina företagslånevillkor (eftersom EF = du).</li>
          <li>Sena Klarna-betalningar = anmärkning som dödar lånemöjligheterna i flera år.</li>
          <li>Klarna for Business finns i andra marknader men inte som kreditprodukt i Sverige idag.</li>
          <li>För företagsutgifter — använd hellre Företagskreditkort (Eurocard, AmEx Business) som ger dig poäng och bygger ren företagskredit-historik.</li>
        </ul>
      </Section>

      <Section title="Skuld som hävstång — det grundläggande ramverket">
        <p style={{ marginTop: 0 }}>Skuld kan accelerera tillväxt eller döda en verksamhet. Skillnaden är vad du gör med pengarna.</p>
        <div className="grid-2">
          <div>
            <strong style={{ color: "var(--ok)" }}>"God skuld"</strong>
            <ul style={{ paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Utrustning som genererar intäkter (kamera för fotograf, server för utvecklare)</li>
              <li>Marknadsföring som mätbart drar in nya kunder</li>
              <li>Personal/underleverantör som låter dig ta större jobb</li>
              <li>Kontokredit som jämnar ut 60–90-dagars betalningscykler från kund</li>
            </ul>
          </div>
          <div>
            <strong style={{ color: "var(--error)" }}>"Dålig skuld"</strong>
            <ul style={{ paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Bil som inte används i tjänsten</li>
              <li>Lifestyle-utgifter (resor, mat) finansierade på kredit</li>
              <li>Kort utan plan för återbetalning</li>
              <li>Snabblån (Qred, Capitalbox) för icke-akuta behov — räntor 14–25% äter snabbt vinsten</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Skattefördelen — räntan är avdragsgill">
        <p style={{ marginTop: 0 }}>
          Räntan på företagslån är avdragsgill som <strong>räntekostnad (BAS 8410)</strong> och dras av på NE-bilaga rad R6. Det betyder din effektiva ränta är ungefär:
        </p>
        <div style={{ background: "var(--bg-soft)", padding: 14, borderRadius: 9, fontFamily: "ui-monospace, monospace", fontSize: 14 }}>
          effektiv ränta = nominell ränta × (1 − marginalskatt)
        </div>
        <p style={{ marginBottom: 0 }}>
          Exempel: Almi-lån på 8% nominellt med din marginalskatt på 50% → <strong>effektiv ränta ≈ 4%</strong>. Det är därför sansat sambank-finansierad utbyggnad nästan alltid slår att vänta tills du har eget kapital.
        </p>
      </Section>

      <Section title="Ansökningschecklist — vad bankerna och Almi vill se">
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>Aktuellt registreringsbevis (ladda upp i <Link href="/documents" style={{ textDecoration: "underline" }}>Arkiv</Link>)</li>
          <li>Senaste 12–24 månaders bokföring eller bankutdrag (exportera från <Link href="/bank" style={{ textDecoration: "underline" }}>Bank</Link>)</li>
          <li>NE-bilaga från senaste deklarationen</li>
          <li>F-skatt-godkännande (Skatteverket-utdrag)</li>
          <li>Personnummer-baserad UC-rapport (be om gratis kopia på uc.se en gång/år)</li>
          <li>Affärsplan för Almi (mall finns gratis på almi.se → "Planera")</li>
          <li>Identifikation (giltigt körkort eller pass)</li>
          <li>Ev. säkerhet: privat fastighet, värdepapper, eller medlåntagare</li>
        </ul>
      </Section>

      <Section title="Praktisk plan för Hopkins Method (eller liknande ny EF)">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li><strong>Denna vecka:</strong> Ansök om Wise Business (10 min) — fungerar för USD/GBP/EUR-kunder.</li>
          <li><strong>Denna vecka:</strong> Boka möte med Swedbank för Företagspaket. Om du är privatkund där: 80% chans till godkännande.</li>
          <li><strong>Denna vecka:</strong> Boka kostnadsfritt möte med Almi (almi.se → "Boka rådgivning"). Förklara verksamheten, fråga om mikrolån.</li>
          <li><strong>Inom 1 månad:</strong> Ladda upp registreringsbevis + bankutdrag i appens <Link href="/documents" style={{ textDecoration: "underline" }}>Arkiv</Link>. Importera transaktioner via <Link href="/bank" style={{ textDecoration: "underline" }}>Bank</Link>.</li>
          <li><strong>Inom 3 månader:</strong> Ansök om litet Företagskreditkort (Eurocard, AmEx Gold Business). Använd för faktiska företagsutgifter, betala alltid i tid.</li>
          <li><strong>Inom 6 månader:</strong> Ansök om Almi-mikrolån eller startuplån (50–150k) baserat på dina intäkter och plan.</li>
          <li><strong>Inom 12 månader:</strong> Med ren historik — ansök om Kontokredit hos huvudbanken (100–300k).</li>
          <li><strong>När intäkterna passerar 500k kr/år:</strong> Konsultera revisor om transition till AB.</li>
        </ol>
      </Section>

      <div style={{ textAlign: "center", marginTop: 22, marginBottom: 18, fontSize: 12, color: "var(--text-muted)" }}>
        Källor: <a href="https://www.almi.se" target="_blank" rel="noreferrer">Almi Företagspartner</a> · <a href="https://www.skatteverket.se" target="_blank" rel="noreferrer">Skatteverket</a> · <a href="https://www.uc.se" target="_blank" rel="noreferrer">UC</a> · <a href="https://www.verksamt.se" target="_blank" rel="noreferrer">Verksamt.se</a> · <a href="https://www.tillvaxtverket.se" target="_blank" rel="noreferrer">Tillväxtverket</a>
      </div>
    </>
  );
}
