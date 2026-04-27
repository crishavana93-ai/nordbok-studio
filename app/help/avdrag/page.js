export const metadata = { title: "Avdragsguide" };

const ROW = ({ what, where, bas, pct, notes }) => (
  <tr>
    <td><strong>{what}</strong></td>
    <td>{where}</td>
    <td className="muted num">{bas}</td>
    <td className="num">{pct}</td>
    <td className="muted" style={{ fontSize: 12.5 }}>{notes}</td>
  </tr>
);

export default function AvdragGuide() {
  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <h1 className="h1">Avdragsguide</h1>
        <div className="muted">Vad är avdragsgillt, var loggar du det i appen, och till vilket BAS-konto.</div>
      </div>

      {/* ─── Beslutsträd ─── */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h2 className="h2" style={{ marginTop: 0 }}>Snabbt beslutsträd</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Är utgiften kopplad till verksamheten? <em>(skapar intäkt eller bevarar verksamheten?)</em> → Om nej, ej avdrag.</li>
          <li>Är det en bilresa du kört själv? → <strong>Körjournal</strong> (km × 25 kr/mil för privatbil 2026).</li>
          <li>Allt annat (flyg, hotell, mat, prenumerationer, utrustning) → <strong>Kvitton</strong> — snap med kameran.</li>
          <li>Måltid på tjänsteresa? Välj <em>per resa</em>: schablon (traktamente) <strong>ELLER</strong> kvitton — inte både.</li>
          <li>Måltid med kund? <strong>Representation</strong>: 50% av kostnad, max 60 kr/person + moms.</li>
          <li>Klart? Kvittobild lagras 7 år (Bokföringslagen).</li>
        </ol>
      </div>

      {/* ─── Resor & måltider ─── */}
      <h2 className="h2">Resor & måltider</h2>
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Vad</th><th>Var i appen</th><th>BAS-konto</th><th>%</th><th>Anmärkning</th></tr></thead>
            <tbody>
              <ROW what="Körning egen bil i tjänst" where="Körjournal" bas="—" pct="25 kr/mil" notes="Skatteverkets schablon för privatbil 2026. Måste ha syfte + från/till + km loggat per resa." />
              <ROW what="Företagsbil bensin/diesel" where="Körjournal" bas="—" pct="12 kr/mil" notes="Förmånsbeskattning hanteras separat." />
              <ROW what="Företagsbil elbil" where="Körjournal" bas="—" pct="0 kr/mil" notes="Ingen mil-ersättning för elbil 2026." />
              <ROW what="Flygbiljett" where="Kvitton" bas="5800" pct="100%" notes="Internationella flyg har normalt 0% moms; svenska 6%." />
              <ROW what="Tåg (SJ, Vy, MTR)" where="Kvitton" bas="5800" pct="100%" notes="6% moms drar du av." />
              <ROW what="Taxi / Bolt / Uber" where="Kvitton" bas="5800" pct="100%" notes="6% moms." />
              <ROW what="Hotell / boende" where="Kvitton" bas="5830" pct="100%" notes="12% moms i Sverige. Utomlands: separat momsåtervinning krävs." />
              <ROW what="Hyrbil i tjänst" where="Kvitton" bas="5615" pct="100%" notes="50% moms-avdrag om bilen även används privat." />
              <ROW what="Drivmedel (företagsbil/egen bil i tjänst)" where="Kvitton" bas="5611" pct="100%" notes="25% moms." />
              <ROW what="Parkering, vägtull, biltvätt" where="Kvitton" bas="5800" pct="100%" notes="" />
              <ROW what="Konferens / mässa" where="Kvitton" bas="7611" pct="100%" notes="Fortbildning. 25% moms i Sverige." />
              <ROW what="Egen måltid på tjänsteresa (traktamente schablon)" where="—" bas="7321" pct="290 kr/dag inrikes" notes="Eller utrikes per land: Berlin 549, London 561, NYC 700, Frankfurt 549, Paris 549. Halvdag = 145 kr inrikes." />
              <ROW what="Egen måltid på tjänsteresa (faktiska kvitton)" where="Kvitton" bas="5841" pct="100%" notes="Välj per resa: antingen traktamente ELLER receipts — inte både." />
              <ROW what="Måltid med kund (representation)" where="Kvitton" bas="6071" pct="50% upp till 60 kr/person + moms" notes="Skriv namn på alla deltagare i beskrivningen. Alkohol = 0% sedan 2017." />
              <ROW what="Personalfest" where="Kvitton" bas="7631" pct="60 kr/person + moms" notes="Max 2 ggr/år." />
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── IT, kommunikation, kontor ─── */}
      <h2 className="h2">IT, kommunikation & kontor</h2>
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Vad</th><th>Var i appen</th><th>BAS-konto</th><th>%</th><th>Anmärkning</th></tr></thead>
            <tbody>
              <ROW what="IT-tjänster (GitHub, Vercel, Anthropic, Notion, Figma, Adobe, AWS)" where="Kvitton" bas="6540" pct="100%" notes="Reverse-charge för EU-leverantörer (du redovisar 25% moms och drar av samtidigt — netto 0)." />
              <ROW what="Mobilabonnemang" where="Kvitton" bas="6212" pct="100% om enbart jobb, annars proportion" notes="25% moms." />
              <ROW what="Bredband / internet" where="Kvitton" bas="6230" pct="100% om enbart jobb, annars del" notes="Hemkontor → räkna procent baserat på yta eller tid." />
              <ROW what="Datorer & utrustning < 28 650 kr (2026)" where="Kvitton" bas="5410" pct="100% direkt" notes="Kan dras av samma år." />
              <ROW what="Datorer & utrustning ≥ 28 650 kr" where="Kvitton" bas="5440 / 1220" pct="Avskrivning 20%/år (5 år)" notes="Inventarier — inte direkt avdrag." />
              <ROW what="Kontorsmaterial (pennor, papper, småinventarier)" where="Kvitton" bas="5410" pct="100%" notes="" />
              <ROW what="Hemkontor (schablon)" where="Kvitton" bas="5400" pct="4 000 kr/år" notes="Utan kvitton — kräver att du regelbundet jobbar hemifrån." />
              <ROW what="Hemkontor (faktiska kostnader)" where="Kvitton" bas="5400" pct="Procent av hyra/el efter yta" notes="Mer jobb men kan ge mer avdrag." />
              <ROW what="Porto / frakt" where="Kvitton" bas="6250" pct="100%" notes="" />
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Tjänster, försäkring, marknadsföring ─── */}
      <h2 className="h2">Tjänster, försäkring & marknadsföring</h2>
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Vad</th><th>Var i appen</th><th>BAS-konto</th><th>%</th><th>Anmärkning</th></tr></thead>
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
      <h2 className="h2">EJ avdragsgillt — vanliga fallgropar</h2>
      <div className="card" style={{ marginBottom: 16 }}>
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
      <h2 className="h2">OSS — One-Stop-Shop för EU B2C-försäljning</h2>
      <div className="card" style={{ marginBottom: 16 }}>
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
      <h2 className="h2">Vad ska finnas på kvittot?</h2>
      <div className="card">
        <div className="grid-2">
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
        <a href="https://www.skatteverket.se" target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 13 }}>
          Officiella regler & SKV-publikationer på Skatteverket.se →
        </a>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginBottom: 24 }}>
        Detta är en sammanfattning, inte skatterådgivning. Vid komplexa fall — fråga din revisor eller Skatteverket direkt.
      </div>
    </>
  );
}
