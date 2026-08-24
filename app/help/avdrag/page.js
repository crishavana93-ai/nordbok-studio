export const metadata = { title: "Avdragsguide" };

/* Migrated to the token system 2026-08-24, and five figures corrected at the same
   time — the traktamente rate, the representation rule, the EV mileage rate, the
   inventarier threshold and the home-office schablon were all out of date. Each is
   sourced from Skatteverket's 2026 figures. */
const ROW = ({ what, where, bas, pct, notes }) => (
  <tr className="border-b border-border last:border-b-0 align-top">
    <td className="px-2 py-2.5 text-[13.5px] font-medium text-ink">{what}</td>
    <td className="px-2 py-2.5 text-[13px] text-ink-2 whitespace-nowrap">{where}</td>
    <td className="px-2 py-2.5 font-mono text-[12px] text-ink-3 whitespace-nowrap">{bas}</td>
    <td className="tnum px-2 py-2.5 font-mono text-[12.5px] text-ink whitespace-nowrap">{pct}</td>
    <td className="px-2 py-2.5 text-[12.5px] leading-relaxed text-ink-2">{notes}</td>
  </tr>
);

const TH = ({ children, className = "" }) => (
  <th className={`micro-label border-b border-border px-2 py-2 text-left ${className}`}>{children}</th>
);

export default function AvdragGuide() {
  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-3">
      <div>
        <h1 className="text-[21px] font-medium tracking-[-0.015em]">Avdragsguide</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Vad som är avdragsgillt, var du loggar det, och till vilket BAS-konto.
          Beloppen gäller 2026.
        </p>
      </div>

      {/* ─── Beslutsträd ─── */}
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="mb-3 text-[15.5px] font-medium tracking-[-0.01em]">Snabbt beslutsträd</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Är utgiften kopplad till verksamheten? <em>(skapar intäkt eller bevarar verksamheten?)</em> → Om nej, ej avdrag.</li>
          <li>Är det en bilresa du kört själv? → <strong>Körjournal</strong> (25 kr/mil privatbil, 12 kr/mil förmånsbil bensin/diesel, 9,50 kr/mil förmånsbil elbil).</li>
          <li>Allt annat (flyg, hotell, mat, prenumerationer, utrustning) → <strong>Kvitton</strong> — snap med kameran.</li>
          <li>Måltid på tjänsteresa? Välj <em>per resa</em>: schablon (traktamente) <strong>ELLER</strong> kvitton — inte både.</li>
          <li>Måltid med kund? <strong>Representation</strong>: måltiden är inte avdragsgill vid inkomstbeskattningen — bara momsen, på högst 300 kr per person. Kaffe och smörgås: 60 kr per person.</li>
          <li>Klart? Kvittobild lagras 7 år (Bokföringslagen).</li>
        </ol>
      </div>

      {/* ─── Resor & måltider ─── */}
      <h2 className="px-1 pt-2 text-[15.5px] font-medium tracking-[-0.01em]">Resor & måltider</h2>
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-3 sm:p-4">
        <div data-scroll-x className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead><tr><TH>Vad</TH><TH>Var i appen</TH><TH>BAS-konto</TH><TH>Belopp</TH><TH>Anmärkning</TH></tr></thead>
            <tbody>
              <ROW what="Körning egen bil i tjänst" where="Körjournal" bas="—" pct="25 kr/mil" notes="Skatteverkets schablon för privatbil 2026. Måste ha syfte + från/till + km loggat per resa." />
              <ROW what="Företagsbil bensin/diesel" where="Körjournal" bas="—" pct="12 kr/mil" notes="Förmånsbeskattning hanteras separat." />
              <ROW what="Förmånsbil elbil" where="Körjournal" bas="—" pct="9,50 kr/mil" notes="Skatteverkets sats 2026 för helelektrisk förmånsbil. Appen använde tidigare 0 kr/mil — se Körjournal om du har äldre resor att räkna om." />
              <ROW what="Flygbiljett" where="Kvitton" bas="5800" pct="100%" notes="Internationella flyg har normalt 0% moms; svenska 6%." />
              <ROW what="Tåg (SJ, Vy, MTR)" where="Kvitton" bas="5800" pct="100%" notes="6% moms drar du av." />
              <ROW what="Taxi / Bolt / Uber" where="Kvitton" bas="5800" pct="100%" notes="6% moms." />
              <ROW what="Hotell / boende" where="Kvitton" bas="5830" pct="100%" notes="12% moms i Sverige. Utomlands: separat momsåtervinning krävs." />
              <ROW what="Hyrbil i tjänst" where="Kvitton" bas="5615" pct="100%" notes="50% moms-avdrag om bilen även används privat." />
              <ROW what="Drivmedel (företagsbil/egen bil i tjänst)" where="Kvitton" bas="5611" pct="100%" notes="25% moms." />
              <ROW what="Parkering, vägtull, biltvätt" where="Kvitton" bas="5800" pct="100%" notes="" />
              <ROW what="Konferens / mässa" where="Kvitton" bas="7611" pct="100%" notes="Fortbildning. 25% moms i Sverige." />
              <ROW what="Egen måltid på tjänsteresa (traktamente schablon)" where="—" bas="7321" pct="300 kr/dag inrikes" notes="Halvdag 150 kr, nattraktamente 150 kr när nattkostnaden inte ersätts. Utrikes gäller normalbelopp per land — slå upp landet hos Skatteverket." />
              <ROW what="Egen måltid på tjänsteresa (faktiska kvitton)" where="Kvitton" bas="5841" pct="100%" notes="Välj per resa: antingen traktamente ELLER receipts — inte både." />
              <ROW what="Måltid med kund (representation)" where="Kvitton" bas="6071" pct="0 % inkomstskatt" notes="Lunch och middag är INTE avdragsgilla vid inkomstbeskattningen sedan 2017 — bara momsen får dras, på ett underlag om högst 300 kr per person. Skriv alltid ut deltagarnas namn." />
              <ROW what="Enklare förtäring (kaffe, smörgås)" where="Kvitton" bas="6072" pct="max 60 kr/person" notes="Exklusive moms. Detta är det enda som är avdragsgillt vid representation — måltider är det inte." />
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── IT, kommunikation, kontor ─── */}
      <h2 className="px-1 pt-2 text-[15.5px] font-medium tracking-[-0.01em]">IT, kommunikation & kontor</h2>
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-3 sm:p-4">
        <div data-scroll-x className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead><tr><TH>Vad</TH><TH>Var i appen</TH><TH>BAS-konto</TH><TH>Belopp</TH><TH>Anmärkning</TH></tr></thead>
            <tbody>
              <ROW what="IT-tjänster (GitHub, Vercel, Anthropic, Notion, Figma, Adobe, AWS)" where="Kvitton" bas="6540" pct="100%" notes="Reverse-charge för EU-leverantörer (du redovisar 25% moms och drar av samtidigt — netto 0)." />
              <ROW what="Mobilabonnemang" where="Kvitton" bas="6212" pct="100% om enbart jobb, annars proportion" notes="25% moms." />
              <ROW what="Bredband / internet" where="Kvitton" bas="6230" pct="100% om enbart jobb, annars del" notes="Hemkontor → räkna procent baserat på yta eller tid." />
              <ROW what="Datorer & utrustning under 29 600 kr" where="Kvitton" bas="5410" pct="100 % direkt" notes="Halvt prisbasbelopp exkl. moms — 29 599 kr för 2026. Gränsen följer prisbasbeloppet och ändras varje år." />
              <ROW what="Datorer & utrustning från 29 600 kr" where="Kvitton" bas="5440 / 1220" pct="Avskrivning 20 %/år" notes="Inventarier — skrivs av över fem år, inte direkt avdrag." />
              <ROW what="Kontorsmaterial (pennor, papper, småinventarier)" where="Kvitton" bas="5410" pct="100%" notes="" />
              <ROW what="Arbetsrum i bostaden (schablon)" where="Kvitton" bas="5400" pct="2 000 eller 4 000 kr/år" notes="2 000 kr om du äger bostaden, 4 000 kr i bostadsrätt eller hyresrätt. Kräver minst 800 arbetstimmar hemma under året — inte bara att du jobbar hemifrån ibland." />
              <ROW what="Hemkontor (faktiska kostnader)" where="Kvitton" bas="5400" pct="Procent av hyra/el efter yta" notes="Mer jobb men kan ge mer avdrag." />
              <ROW what="Porto / frakt" where="Kvitton" bas="6250" pct="100%" notes="" />
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Tjänster, försäkring, marknadsföring ─── */}
      <h2 className="px-1 pt-2 text-[15.5px] font-medium tracking-[-0.01em]">Tjänster, försäkring & marknadsföring</h2>
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-3 sm:p-4">
        <div data-scroll-x className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead><tr><TH>Vad</TH><TH>Var i appen</TH><TH>BAS-konto</TH><TH>Belopp</TH><TH>Anmärkning</TH></tr></thead>
            <tbody>
              <ROW what="Konsultarvoden (revisor, advokat, redovisning)" where="Kvitton" bas="6550" pct="100%" notes="" />
              <ROW what="Reklam & marknadsföring (Google Ads, Meta Ads, SEO, design)" where="Kvitton" bas="5900" pct="100%" notes="Reverse-charge för utländska leverantörer." />
              <ROW what="Företagsförsäkring" where="Kvitton" bas="6310" pct="100%" notes="" />
              <ROW what="Bankavgifter" where="Kvitton" bas="6570" pct="100%" notes="" />
              <ROW what="Föreningsavgifter (yrkesförening)" where="Kvitton" bas="6981" pct="100%" notes="Om kopplat till verksamheten." />
              <ROW what="Fortbildning, kurser, böcker, podcasts" where="Kvitton" bas="7611" pct="100%" notes="Måste vara relevant för din verksamhet." />
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── EJ avdragsgillt ─── */}
      <h2 className="px-1 pt-2 text-[15.5px] font-medium tracking-[-0.01em]">EJ avdragsgillt — vanliga fallgropar</h2>
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Privata måltider hemma eller i lunchen utan kund/affär.</li>
          <li>Familjemedlemmars resor, biljetter eller måltider — även om de "var med".</li>
          <li>Vanlig klädsel (kostym, sportkläder). Endast arbetskläder/uniform med företagets logo.</li>
          <li>Privat sjukvård eller naprapat utanför arbetshälsovårds-avtal.</li>
          <li>Husdjur — utom vakthund som faktiskt används i tjänst.</li>
          <li>Böter, parkeringsböter, viten.</li>
          <li><strong>Alkohol som representation</strong> (sedan 2017). Du måste separera kvittots alkoholdel.</li>
          <li>Tjänsteresor utan dokumenterat syfte (Skatteverket underkänner hela resan).</li>
          <li>Nöjesutgifter under "representation"-flagg utan affärssamband.</li>
        </ul>
      </div>

      {/* ─── OSS-förklaring ─── */}
      <h2 className="px-1 pt-2 text-[15.5px] font-medium tracking-[-0.01em]">OSS — One-Stop-Shop för EU B2C-försäljning</h2>
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <p style={{ marginTop: 0 }}>
          Om du säljer <strong>till konsumenter</strong> (inte företag) i andra EU-länder och samlat passerar <strong>99 680 kr/år</strong> (≈ €10 000) totalt, måste du:
        </p>
        <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Registrera dig för OSS hos Skatteverket.</li>
          <li>Fakturera <strong>kundens lands moms</strong>, inte svensk: tysk konsument = 19%, fransk = 20%, italiensk = 22%, etc.</li>
          <li>Lämna <strong>kvartalsvis</strong> OSS-deklaration till Skatteverket — de fördelar momsen till respektive land.</li>
        </ol>
        <p style={{ marginBottom: 0 }}>
          <strong>Under tröskeln</strong> → använd vanlig svensk moms (25%/12%/6%) som vanligt. Säljer du till <strong>EU-företag med VAT-nummer</strong> → reverse-charge gäller (0% moms, köparen redovisar). Appen sätter dessa flaggor automatiskt baserat på kundens land + VAT-nr.
        </p>
      </div>

      {/* ─── Krav per kvitto ─── */}
      <h2 className="px-1 pt-2 text-[15.5px] font-medium tracking-[-0.01em]">Vad ska finnas på kvittot?</h2>
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <strong>Alltid:</strong>
            <ul style={{ paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Datum</li>
              <li>Säljarens namn + orgnr</li>
              <li>Belopp + moms separerat</li>
              <li>Vad det avser (stol, lunch, taxiresa...)</li>
            </ul>
          </div>
          <div>
            <strong>Bonus-saker som hjälper Skatteverket:</strong>
            <ul style={{ paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Säljarens momsregistreringsnr</li>
              <li>Köparens namn (ditt företag) — krävs över 4 000 kr</li>
              <li>Notering om syfte eller deltagare (för representation)</li>
            </ul>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 22, marginBottom: 12 }}>
        <a href="https://www.skatteverket.se" target="_blank" rel="noreferrer" className="text-[13px] leading-relaxed text-ink-2" style={{ fontSize: 13 }}>
          Officiella regler & SKV-publikationer på Skatteverket.se →
        </a>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginBottom: 24 }}>
        Detta är en sammanfattning, inte skatterådgivning. Vid komplexa fall — fråga din revisor eller Skatteverket direkt.
      </div>
    </div>
  );
}
