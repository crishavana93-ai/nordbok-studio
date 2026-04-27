import Link from "next/link";

export const metadata = { title: "Hjälp & funktioner" };

const sections = [
  {
    icon: "🏠",
    href: "/dashboard",
    title: "Dashboard",
    blurb: "Din morgondashboard. Här ser du allt som hänt i år: pengar in, pengar ut, vad du sannolikt ska betala i skatt, och vilka kvitton som väntar på granskning.",
    use: ["Översikt över YTD-siffror.", "Snabbknappar för 'Ny faktura', 'Scanna kvitto', 'Logga resa'.", "'Skicka veckorapport nu' om du inte vill vänta till måndag."],
  },
  {
    icon: "🧾",
    href: "/invoices",
    title: "Fakturor",
    blurb: "Skicka professionella fakturor som följer svensk lag. Funkar lika bra för svenska kunder (med F-skatt-stämpel + moms) som för UK/US-kunder (på engelska, i USD/GBP utan moms).",
    use: [
      "Klicka 'Ny faktura'. Välj kund — om du saknar kunden klickar du '+ Ny' och fyller i på 30 sekunder.",
      "ROT/RUT? Aktivera under 'Avancerat' — appen lägger till fastighetsbeteckning automatiskt och drar av halva arbetskostnaden.",
      "Skickar du till EU-företag med VAT-nummer? Reverse-charge slås på automatiskt och 'Köparen redovisar moms' skrivs ut på fakturan.",
      "Spara som utkast eller skicka direkt via e-post (din kund får ett snyggt mail med PDF-utseende och OCR-nummer).",
    ],
  },
  {
    icon: "📸",
    href: "/receipts",
    title: "Kvitton",
    blurb: "Snappa kvittot med kameran direkt när du betalt. AI:n läser av leverantör, datum, belopp, moms och föreslår vilket BAS-konto + NE-rad det ska bokföras på. Du tittar igenom och klickar Spara.",
    use: [
      "Klicka 'Scanna med kamera' — telefonen öppnar kameran, du tar bilden, AI:n läser av på 5 sekunder.",
      "Granska siffrorna (om något ser fel ut: ändra), bekräfta kategori (resor, IT-tjänster, kontorsmaterial...).",
      "Markera som 'Privat' om kvittot inte hör till företaget.",
      "Originalbilden lagras i 7 år (Bokföringslagen).",
    ],
  },
  {
    icon: "🚗",
    href: "/mileage",
    title: "Körjournal",
    blurb: "Skatteverket vill ha en körjournal för varje resa du gör i tjänsten. Här loggar du datum, från, till, syfte, km och regnr — och appen räknar avdraget åt dig (25 kr/mil för privatbil i tjänsten 2026).",
    use: [
      "Klicka '+ Logga resa' efter mötet medan du minns syftet.",
      "Skriv något konkret som syfte: 'Kundmöte Acme AB' — inte bara 'jobb'. Skatteverket vill se vem du träffade.",
      "Lägg in mätarställning vid årets början och slut — då kan Skatteverket se att din loggade total stämmer.",
    ],
  },
  {
    icon: "👥",
    href: "/clients",
    title: "Kunder",
    blurb: "Adressboken för dina fakturakunder. När du väljer land (SE, UK, US, DE...) gissar appen rätt valuta och momsregler.",
    use: [
      "Lägg till kontaktperson, e-post, organisationsnr/personnr.",
      "ROT-kunder: fyll i fastighetsbeteckning. RUT-i-bostadsrätt: fyll i BRF org-nr.",
      "EU B2B med VAT-nummer? Appen aktiverar reverse-charge automatiskt nästa gång du fakturerar dem.",
    ],
  },
  {
    icon: "🏦",
    href: "/bank",
    title: "Bank",
    blurb: "Importera dina kontoutdrag som CSV — Swedbank, SEB, Handelsbanken, Nordea och Revolut funkar. Listan kan sen matchas mot fakturor och kvitton.",
    use: [
      "Logga in i din bank → exportera transaktioner som CSV → dra hit eller klicka 'Importera CSV'.",
      "Automatisk PSD2-koppling kommer i v1.5.",
    ],
  },
  {
    icon: "📂",
    href: "/documents",
    title: "Arkiv",
    blurb: "Det digitala kontorsarkivet. Här ligger sådant som inte är fakturor eller kvitton — registreringsbevis, hyresavtal, försäkringspapper, årsredovisningar, ID-handlingar. Allt sparas automatiskt i 7 år (Bokföringslagen).",
    use: [
      "Ladda upp PDF/bild → välj typ (avtal, registreringsbevis, bankutdrag...) → tagga.",
      "När du raderar varnar appen så att du inte råkar ta bort något du måste arkivera.",
    ],
  },
  {
    icon: "⏰",
    href: "/deadlines",
    title: "Deadlines",
    blurb: "Klicka 'Importera Skatteverket-deadlines' EN gång → så är hela årets skattekalender på plats: moms Q1–Q4, NE-bilaga (2 maj), kontrolluppgifter (31 jan), F-skatt 12:e varje månad.",
    use: [
      "Lägg till egna påminnelser ('skicka offert till X', 'förnya domän').",
      "Snooze om något ska skjutas upp.",
      "På måndagar (08:00 svensk tid) får du ett mail med vad som väntar nästa två veckor.",
      "På telefonen: aktivera 'Push-notiser' på dashboarden — då pingar telefonen dig dagen innan en deadline.",
    ],
  },
  {
    icon: "🤖",
    href: "/assistant",
    title: "Assistent",
    blurb: "Chatta med en AI-assistent som ser hela din bokföring. Den svarar på svenska och kan referera till Skatteverkets regler.",
    use: [
      "'Vad har jag för vinst hittills i år?' — den räknar.",
      "'Vilka fakturor är förfallna?' — den listar dem med belopp och kund.",
      "'Kan jag dra av min Berlin-resa?' — den förklarar reglerna och tittar på syftet du loggat.",
      "'Sammanställ mina avdrag per BAS-konto.' — den grupperar och summerar.",
    ],
  },
  {
    icon: "⚙️",
    href: "/settings",
    title: "Inställningar",
    blurb: "Företagsuppgifter, betalningsuppgifter, valuta, språk, notisinställningar.",
    use: [
      "Personnummer/orgnr — appen kollar att de stämmer (Luhn-algoritm).",
      "Standardvaluta — sätter default på nya fakturor (kan alltid ändras per faktura).",
      "Notiser — bestäm om du vill ha veckorapport, deadline-notiser, push-notiser.",
    ],
  },
];

const glossary = [
  { term: "F-skatt", what: "Företagsskatt — det godkännande från Skatteverket som visar att du själv betalar in din skatt. Visas som stämpel på fakturor." },
  { term: "Moms (VAT)", what: "Mervärdesskatt. 25% standard, 12% mat/hotell, 6% böcker/transport. Du tar in det av kund och betalar vidare till Skatteverket." },
  { term: "Momsregistreringsnummer", what: "'SE' + ditt personnummer (10 siffror) + '01'. Appen bygger det åt dig." },
  { term: "BAS-konto", what: "Den svenska kontoplanen som svenska bokförare använder. T.ex. 5800 = Resekostnader. Appen föreslår rätt konto för varje kvitto." },
  { term: "NE-bilaga", what: "Bilagan du fyller i när du deklarerar enskild firma. Sammanställning av intäkter och kostnader. Sista dag: 2 maj varje år." },
  { term: "OCR-nummer", what: "Det 7+1-siffriga betalningsnumret kunden anger när de betalar via Bankgiro. Appen genererar med rätt kontrollsiffra (mod-10)." },
  { term: "ROT/RUT", what: "Skattereduktion på arbetskostnaden för bostäder (ROT = renovering, RUT = städning). Kunden får 50% rabatt, du får pengarna direkt från Skatteverket." },
  { term: "Reverse-charge / Omvänd skattskyldighet", what: "Vid B2B-försäljning till EU-företag med VAT-nummer redovisar köparen momsen, inte säljaren. Du fakturerar 0%." },
  { term: "OSS (One-Stop-Shop)", what: "EU:s system för B2C-försäljning till andra länder. Du måste registrera dig om du säljer för mer än 99 680 kr/år till EU-konsumenter." },
  { term: "Körjournal", what: "Skatteverkets krav på loggbok per resa: datum, från, till, syfte, km, regnr. Krav för avdrag på bilkörning." },
  { term: "Traktamente", what: "Schablonbelopp för måltider på tjänsteresa. 290 kr/dag inrikes 2026. Per land utomlands (Berlin 549, London 561, NYC 700)." },
  { term: "Periodiseringsfond", what: "Du kan skjuta upp att betala skatt på max 30% av vinsten varje år, i upp till 6 år. Hjälper när inkomsten varierar." },
  { term: "Egenavgifter", what: "Sociala avgifter du betalar som egenföretagare. 28,97% på resultatet. Skatteverket räknar med 25% schablonavdrag på dem (max 50 600 kr/år)." },
];

export default function HelpPage() {
  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <h1 className="h1">Hjälp & funktioner</h1>
        <div className="muted">Kort genomgång av vad varje del av Nordbok Studio gör — och varför.</div>
      </div>

      <Link href="/help/avdrag" className="card" style={{ marginBottom: 18, display: "block", textDecoration: "none", color: "inherit", background: "linear-gradient(135deg, var(--accent-soft), var(--bg-card))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28 }}>📖</span>
          <div>
            <strong style={{ fontSize: 16 }}>Avdragsguide — vad är avdragsgillt?</strong>
            <div className="muted" style={{ fontSize: 13 }}>Resor, måltider, IT, hemkontor, representation, OSS — komplett genomgång med BAS-konton.</div>
          </div>
        </div>
      </Link>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2 className="h2" style={{ marginTop: 0 }}>Snabbstart — från noll till första faktura</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li><strong>Inställningar</strong> → fyll i företagsnamn, personnummer, F-skatt, IBAN/Bankgiro. (Eller gå igenom <Link href="/welcome" style={{ textDecoration: "underline" }}>välkomstguiden</Link> igen.)</li>
          <li><strong>Kunder</strong> → lägg till din första kund.</li>
          <li><strong>Fakturor → + Ny faktura</strong> → välj kund, lägg till en rad, klicka "Spara &amp; skicka".</li>
          <li><strong>Deadlines</strong> → klicka "Importera Skatteverket-deadlines" så hamnar moms Q1–Q4, NE-bilaga och F-skatt-betalningar på plats.</li>
          <li><strong>Kvitton</strong> → varje gång du betalar något företagsrelaterat: snappa kvittot med kameran direkt på telefonen.</li>
        </ol>
      </div>

      <h2 className="h2">Funktioner — sektion för sektion</h2>
      <div className="grid-2" style={{ marginBottom: 22 }}>
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="card" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 24 }}>{s.icon}</span>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{s.title}</h3>
            </div>
            <div className="muted" style={{ fontSize: 13.5, marginBottom: 8 }}>{s.blurb}</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text-soft)" }}>
              {s.use.map((u, i) => <li key={i} style={{ marginBottom: 4 }}>{u}</li>)}
            </ul>
          </Link>
        ))}
      </div>

      <h2 className="h2">Ordlista — svensk skattevokabulär förklarad</h2>
      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <tbody>
            {glossary.map((g) => (
              <tr key={g.term}>
                <td style={{ width: 220, verticalAlign: "top", fontWeight: 600 }}>{g.term}</td>
                <td style={{ color: "var(--text-soft)" }}>{g.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 className="h2" style={{ marginTop: 0 }}>Vad gör appen automatiskt?</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li><strong>Veckorapport</strong> via mail varje måndag 08:00 — sammanfattning av YTD, förfallna fakturor och kommande deadlines.</li>
          <li><strong>Push-notiser</strong> på telefonen dagen innan en deadline (om du aktiverat det).</li>
          <li><strong>Påminnelse</strong> skapas automatiskt 3 dagar efter en fakturas förfallodatum om kunden inte betalat.</li>
          <li><strong>Bokföringsregler</strong>: 7-årig arkivering, BAS-kontoplan-mappning, F-skatt-stämpel, ROT/RUT-beräkning, OSS-tröskel, reverse-charge för EU B2B.</li>
          <li><strong>Säkerhet</strong>: all data är krypterad i Supabase; bara du kan se din data (Row-Level Security per användare).</li>
        </ul>
      </div>

      <div style={{ textAlign: "center", marginTop: 22 }}>
        <a href="https://docs.skatteverket.se" target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 13 }}>
          Officiella regler: Skatteverket →
        </a>
      </div>
    </>
  );
}
